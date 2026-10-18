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
