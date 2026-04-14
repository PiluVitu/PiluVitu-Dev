import { defineConfig } from 'tinacms'

const branch =
  process.env.HEAD ||
  process.env.VERCEL_GIT_COMMIT_REF ||
  process.env.GITHUB_BRANCH ||
  'main'

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
        ui: {
          router: ({ document }) => `/posts/${document._sys.filename}`,
        },
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
