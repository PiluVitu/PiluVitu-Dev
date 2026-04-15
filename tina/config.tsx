import React from 'react'
import { defineConfig } from 'tinacms'

const branch =
  process.env.HEAD ||
  process.env.VERCEL_GIT_COMMIT_REF ||
  process.env.GITHUB_BRANCH ||
  'main'

/** Custom slug field: standard text input + "Ver post" button that opens /posts/[slug]. */
const SlugFieldWithPreview = ({
  input,
  field,
}: {
  input: React.InputHTMLAttributes<HTMLInputElement>
  field: { label?: string }
}) => {
  const slug = String(input.value ?? '')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label
        style={{
          display: 'block',
          marginBottom: 2,
          fontSize: 13,
          fontWeight: 600,
          color: 'rgb(15 23 42)',
        }}
      >
        {field.label ?? 'Slug (URL)'}
      </label>
      <input
        {...input}
        type="text"
        style={{
          border: '1px solid rgb(203 213 225)',
          borderRadius: 6,
          padding: '8px 12px',
          fontSize: 14,
          width: '100%',
          boxSizing: 'border-box',
          outline: 'none',
        }}
      />
      {slug && (
        <a
          href={`/posts/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            background: '#0f172a',
            color: '#fff',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            textDecoration: 'none',
            width: 'fit-content',
            marginTop: 2,
          }}
        >
          ↗ Ver post
        </a>
      )}
    </div>
  )
}

export default defineConfig({
  branch,
  clientId: process.env.NEXT_PUBLIC_TINA_CLIENT_ID ?? '',
  token: process.env.TINA_TOKEN ?? '',

  build: {
    outputFolder: 'admin',
    publicFolder: 'public',
  },

  media: {
    tina: {
      mediaRoot: 'uploads',
      publicFolder: 'public',
    },
  },

  schema: {
    collections: [
      {
        name: 'post',
        label: 'Posts',
        path: 'content/posts',
        format: 'mdx',
        // router removed intentionally: enabling it forces visual-editing mode,
        // which requires useTina in the page to populate form fields.
        // The slug field below provides a direct "Ver post" link instead.
        fields: [
          {
            type: 'string',
            name: 'title',
            label: 'Título',
            isTitle: true,
            required: true,
          },
          {
            type: 'string',
            name: 'slug',
            label: 'Slug (URL)',
            required: true,
            ui: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              component: SlugFieldWithPreview as any,
            },
          },
          {
            type: 'string',
            name: 'excerpt',
            label: 'Resumo',
            ui: {
              component: 'textarea',
            },
          },
          {
            type: 'image',
            name: 'coverImage',
            label: 'Imagem de capa',
          },
          {
            type: 'string',
            name: 'tags',
            label: 'Tags',
            list: true,
          },
          {
            type: 'datetime',
            name: 'publishedAt',
            label: 'Data de publicação',
          },
          {
            type: 'boolean',
            name: 'draft',
            label: 'Rascunho',
          },
          {
            type: 'number',
            name: 'readingTimeMinutes',
            label: 'Tempo de leitura (min)',
          },
          {
            type: 'rich-text',
            name: 'body',
            label: 'Conteúdo',
            isBody: true,
          },
        ],
      },
    ],
  },
})
