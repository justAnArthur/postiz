// A throwaway Payload the provider tests publish to: sqlite in a temp folder,
// collections shaped like Payload's website template, REST on PORT.
import { createReadStream, mkdtempSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig, getPayload, handleEndpoints } from 'payload'
import { markdownToLexical } from './markdownToLexical.ts'

const port = Number(process.env.PORT || 3999)
const apiKey = process.env.PAYLOAD_API_KEY || 'scratch-api-key'
const cover = path.resolve(import.meta.dirname, '../../apps/frontend/public/icons/platforms/payload.png')
const dir = mkdtempSync(path.join(tmpdir(), 'payload-scratch-'))

const config = buildConfig({
  secret: 'scratch',
  serverURL: `http://localhost:${port}`,
  db: sqliteAdapter({ client: { url: `file:${path.join(dir, 'db.sqlite')}` } }),
  editor: lexicalEditor(),
  collections: [
    { slug: 'users', auth: { useAPIKey: true }, fields: [{ name: 'name', type: 'text' }] },
    {
      slug: 'media',
      upload: { staticDir: path.join(dir, 'media') },
      access: { read: () => true },
      fields: [{ name: 'alt', type: 'text' }],
    },
    { slug: 'categories', fields: [{ name: 'title', type: 'text', required: true }] },
    {
      slug: 'posts',
      versions: { drafts: true },
      hooks: { beforeChange: [markdownToLexical] },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'text', unique: true },
        { name: 'excerpt', type: 'textarea' },
        { name: 'heroImage', type: 'upload', relationTo: 'media' },
        { name: 'content', type: 'richText', required: true },
        { name: 'categories', type: 'relationship', relationTo: 'categories', hasMany: true },
        { name: 'tags', type: 'text', hasMany: true },
        {
          name: 'meta',
          type: 'group',
          fields: [
            { name: 'title', type: 'text' },
            { name: 'description', type: 'textarea' },
            { name: 'image', type: 'upload', relationTo: 'media' },
          ],
        },
        { name: 'publishedAt', type: 'date' },
      ],
    },
  ],
})

const payload = await getPayload({ config })
await payload.create({
  collection: 'users',
  data: { email: 'postiz@example.com', password: 'scratch', name: 'Postiz', enableAPIKey: true, apiKey },
})
const category = await payload.create({ collection: 'categories', data: { title: 'News' } })

http
  .createServer(async (req, res) => {
    if (req.url === '/cover.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' })
      return createReadStream(cover).pipe(res)
    }

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
    const response = await handleEndpoints({
      config,
      request: new Request(`http://localhost:${port}${req.url}`, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        ...(hasBody ? { body: Readable.toWeb(req) as ReadableStream, duplex: 'half' } : {}),
      }),
    })
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(Buffer.from(await response.arrayBuffer()))
  })
  .listen(port, () => {
    console.log(`READY ${JSON.stringify({ url: `http://localhost:${port}`, apiKey, categoryId: category.id })}`)
  })
