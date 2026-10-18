# Payload provider

This fork adds [Payload](https://payloadcms.com) as a publishing channel next to
WordPress and Hashnode. A Payload blog connects with its URL and an API key, and a
post published from Postiz becomes a published doc in a Payload collection.

## What the provider sends

On publish, the provider uploads the cover picture to the `media` collection (it
reuses a media doc with the same filename, so retries and edits do not duplicate
it), then creates the doc with `POST /api/<collection>`:

| Field         | Value                                                      |
| ------------- | ---------------------------------------------------------- |
| `title`       | the title setting                                          |
| `slug`        | the slug setting, or the title slugified                   |
| `markdown`    | the post body as markdown                                  |
| `excerpt`     | the excerpt setting, when set                              |
| `categories`  | ids of docs in the `categories` collection, when set       |
| `tags`        | the tags as strings, when set                              |
| `heroImage`   | the uploaded cover's id, when set                          |
| `meta`        | `title`, `description` and `image` for `@payloadcms/plugin-seo` |
| `publishedAt` | the time Postiz publishes the post                         |
| `_status`     | `published`                                                |

The names follow Payload's website template. Payload drops fields a collection
does not have, so a blog without `excerpt` or `tags` just ignores them.

Saving a published post with "Just update the post details" sends the same fields
with `PATCH /api/<collection>/<id>`, and deleting the post in Postiz deletes the doc.
Removing the channel leaves the blog alone.

## Blog setup

1. Let the users collection hold API keys:

   ```ts
   export const Users: CollectionConfig = {
     slug: 'users',
     auth: { useAPIKey: true },
     // ...
   }
   ```

2. Create a user for Postiz in the admin, tick "Enable API Key" and copy the key.

3. Turn the `markdown` field into the Lexical body. Add this hook to the posts
   collection (`hooks: { beforeChange: [markdownToLexical] }`). It runs before
   Payload validates the doc, so a required `content` field is fine.

   ```ts
   import type { CollectionBeforeChangeHook } from 'payload'
   import { convertMarkdownToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'

   // Postiz sends a post's body as markdown in `markdown`: store it as the Lexical `content`.
   export const markdownToLexical: CollectionBeforeChangeHook = async ({ data, req }) => {
     if (typeof data.markdown !== 'string') return data

     const { markdown, ...rest } = data
     return {
       ...rest,
       content: convertMarkdownToLexical({
         editorConfig: await editorConfigFactory.default({ config: req.payload.config }),
         markdown,
       }),
     }
   }
   ```

   If the rich text field is not called `content`, rename it in the hook. The
   same hook runs in the provider tests (`var/payload-scratch/markdownToLexical.ts`).

## Connecting in Postiz

Add a channel, pick Payload and fill in:

- **Payload URL**: where the admin runs, e.g. `https://blog.example.com`
- **Users collection**: the auth collection the key belongs to, usually `users`
- **API key**: the key from step 2
- **Public post URL**: where a published post lives, with `{slug}`, `{id}` or
  `{collection}` in it, e.g. `https://blog.example.com/posts/{slug}`. It becomes
  the post's release URL.

A Payload on a private network (the same Docker network or VPC as Postiz) needs
`DISABLE_SSRF_PROTECTION=true`, as for WordPress.

Each post's settings pick the collection (default `posts`), title, slug, excerpt,
categories, tags, cover picture and SEO title and description.

## Tests

The tests publish to a throwaway Payload on sqlite:

```bash
pnpm --dir var/payload-scratch install --ignore-workspace
node_modules/.bin/vitest run --config var/payload-scratch/vitest.config.mts
```

`.github/workflows/payload-image.yml` runs them and publishes
`ghcr.io/justanarthur/postiz` on every push to main.
