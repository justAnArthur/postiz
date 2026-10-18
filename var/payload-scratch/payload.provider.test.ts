import 'reflect-metadata';
import { ChildProcess, spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PayloadProvider } from '@gitroom/nestjs-libraries/integrations/social/payload.provider';
import { CreatePostDto } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';

// the scratch Payload and the cover picture it serves are both on localhost
process.env.DISABLE_SSRF_PROTECTION = 'true';

const port = 3999;
const url = `http://localhost:${port}`;
const provider = new PayloadProvider();
const fields = (apiKey: string) =>
  Buffer.from(
    JSON.stringify({
      url: `${url}/api/`,
      collection: 'users',
      apiKey,
      postUrl: 'https://blog.example.com/{collection}/{slug}',
    })
  ).toString('base64');
const token = fields('scratch-api-key');
const integration = {} as any;

let server: ChildProcess;
let categoryId: number;

const api = async (path: string) => {
  const response = await fetch(`${url}/api${path}`, {
    headers: { Authorization: 'users API-Key scratch-api-key' },
  });
  return { status: response.status, body: await response.json() };
};

beforeAll(async () => {
  server = spawn(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', 'server.ts'],
    { cwd: __dirname, env: { ...process.env, PORT: String(port) } }
  );
  categoryId = await new Promise((resolve, reject) => {
    let log = '';
    server.stdout.on('data', (chunk) => {
      log += chunk;
      const ready = log.match(/READY (.+)/);
      if (ready) resolve(JSON.parse(ready[1]).categoryId);
    });
    server.stderr.on('data', (chunk) => (log += chunk));
    server.on('exit', () => reject(new Error(`scratch Payload exited:\n${log}`)));
  });
});

afterAll(() => {
  server?.kill();
});

const details = (settings: any, message = '# Launch\n\nWe **shipped** it.') => ({
  id: 'post-1',
  message,
  settings,
});

describe('PayloadProvider', () => {
  it('connects with an API key and refuses a wrong one', async () => {
    const connected = await provider.authenticate({ code: token, codeVerifier: '' });
    expect(connected).toMatchObject({
      id: `${url}_1`,
      name: 'Postiz',
      username: 'postiz@example.com',
      accessToken: token,
    });

    expect(
      await provider.authenticate({ code: fields('wrong'), codeVerifier: '' })
    ).toBe('Payload did not accept the API key');
  });

  it('lists the blog categories', async () => {
    expect(await provider.categoriesList(token)).toEqual([
      { id: categoryId, name: 'News' },
    ]);
  });

  let releaseId: string;
  it('publishes a doc with a Lexical body, a cover and SEO meta', async () => {
    const [published] = await provider.post(
      '',
      token,
      [
        details({
          __type: 'payload',
          title: 'We shipped it',
          excerpt: 'The short version',
          categories: [categoryId],
          tags: [{ value: 'launch', label: 'launch' }],
          main_image: { id: 'm1', path: `${url}/cover.png`, alt: 'Cover' },
        }),
      ],
      integration
    );
    releaseId = published.postId;

    expect(published).toMatchObject({
      id: 'post-1',
      status: 'completed',
      releaseURL: 'https://blog.example.com/posts/we-shipped-it',
    });

    const { body: doc } = await api(`/posts/${releaseId}?depth=0`);
    expect(doc).toMatchObject({
      title: 'We shipped it',
      slug: 'we-shipped-it',
      excerpt: 'The short version',
      _status: 'published',
      categories: [categoryId],
      tags: ['launch'],
      meta: { title: 'We shipped it', description: 'The short version' },
    });
    expect(doc.publishedAt).toBeTruthy();
    expect(doc.heroImage).toBeTruthy();
    expect(doc.meta.image).toBe(doc.heroImage);
    expect(doc.content.root.children[0]).toMatchObject({ type: 'heading', tag: 'h1' });
    expect(JSON.stringify(doc.content)).toContain('shipped');

    const { body: media } = await api(`/media/${doc.heroImage}`);
    expect(media).toMatchObject({ alt: 'Cover', mimeType: 'image/png' });
  });

  it('reuses the cover it already uploaded', async () => {
    await provider.post(
      '',
      token,
      [
        details({
          title: 'Second post',
          slug: 'custom-slug',
          main_image: { id: 'm1', path: `${url}/cover.png` },
        }),
      ],
      integration
    );

    const { body } = await api('/media?limit=10');
    expect(body.totalDocs).toBe(1);
    expect((await api('/posts?where[slug][equals]=custom-slug')).body.totalDocs).toBe(1);
  });

  it('edits the published doc in place', async () => {
    const edited = await provider.editPost(
      token,
      releaseId,
      details({ title: 'We shipped it again', slug: 'shipped-again' }, 'Plain *new* body'),
      integration
    );
    expect(edited).toEqual({
      postId: releaseId,
      releaseURL: 'https://blog.example.com/posts/shipped-again',
    });

    const { body: doc } = await api(`/posts/${releaseId}`);
    expect(doc).toMatchObject({ title: 'We shipped it again', _status: 'published' });
    expect(doc.content.root.children[0].type).toBe('paragraph');
  });

  it('deletes the published doc', async () => {
    await provider.deletePost(token, releaseId, {} as any, integration);
    expect((await api(`/posts/${releaseId}`)).status).toBe(404);
  });

  it('turns a Payload validation error into a message', async () => {
    await expect(
      provider.post('', token, [details({ title: 'Broken', collection: 'nope' })], integration)
    ).rejects.toThrow();

    await expect(
      provider.post('', token, [details({ title: 'Second post', slug: 'custom-slug' })], integration)
    ).rejects.toThrow(/slug/i);
  });
});

describe('Payload settings', () => {
  const create = (settings: any) =>
    validate(
      plainToInstance(CreatePostDto, {
        type: 'schedule',
        shortLink: false,
        date: '2026-10-20T10:00:00.000Z',
        tags: [],
        posts: [
          {
            integration: { id: 'channel' },
            value: [{ content: 'Body', image: [] }],
            settings,
          },
        ],
      })
    );

  it('validates settings.__type payload through the public API DTO', async () => {
    expect(await create({ __type: 'payload', title: 'A title', slug: 'a-title' })).toEqual([]);
    // what the form sends for a field typed in and cleared
    expect(await create({ __type: 'payload', title: 'A title', slug: '', collection: '' })).toEqual([]);
  });

  it('rejects a missing title and a bad slug', async () => {
    const errors = JSON.stringify(await create({ __type: 'payload', slug: 'Not A Slug' }));
    expect(errors).toContain('title');
    expect(errors).toContain('Invalid slug');
  });
});
