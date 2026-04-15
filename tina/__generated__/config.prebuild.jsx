// tina/config.tsx
import { defineConfig } from "tinacms";
import { jsx, jsxs } from "react/jsx-runtime";
var branch = process.env.HEAD || process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_BRANCH || "main";
var SlugFieldWithPreview = ({
  input,
  field
}) => {
  const slug = String(input.value ?? "");
  return jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [
    jsx(
      "label",
      {
        style: {
          display: "block",
          marginBottom: 2,
          fontSize: 13,
          fontWeight: 600,
          color: "rgb(15 23 42)"
        },
        children: field.label ?? "Slug (URL)"
      }
    ),
    jsx(
      "input",
      {
        ...input,
        type: "text",
        style: {
          border: "1px solid rgb(203 213 225)",
          borderRadius: 6,
          padding: "8px 12px",
          fontSize: 14,
          width: "100%",
          boxSizing: "border-box",
          outline: "none"
        }
      }
    ),
    slug && jsx(
      "a",
      {
        href: `/posts/${slug}`,
        target: "_blank",
        rel: "noopener noreferrer",
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 14px",
          background: "#0f172a",
          color: "#fff",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          textDecoration: "none",
          width: "fit-content",
          marginTop: 2
        },
        children: "\u2197 Ver post"
      }
    )
  ] });
};
var config_default = defineConfig({
  branch,
  clientId: process.env.NEXT_PUBLIC_TINA_CLIENT_ID ?? "",
  token: process.env.TINA_TOKEN ?? "",
  build: {
    outputFolder: "admin",
    publicFolder: "public"
  },
  media: {
    tina: {
      mediaRoot: "uploads",
      publicFolder: "public"
    }
  },
  schema: {
    collections: [
      {
        name: "post",
        label: "Posts",
        path: "content/posts",
        format: "mdx",
        // router removed intentionally: enabling it forces visual-editing mode,
        // which requires useTina in the page to populate form fields.
        // The slug field below provides a direct "Ver post" link instead.
        fields: [
          {
            type: "string",
            name: "title",
            label: "T\xEDtulo",
            isTitle: true,
            required: true
          },
          {
            type: "string",
            name: "slug",
            label: "Slug (URL)",
            required: true,
            ui: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              component: SlugFieldWithPreview
            }
          },
          {
            type: "string",
            name: "excerpt",
            label: "Resumo",
            ui: {
              component: "textarea"
            }
          },
          {
            type: "image",
            name: "coverImage",
            label: "Imagem de capa"
          },
          {
            type: "string",
            name: "tags",
            label: "Tags",
            list: true
          },
          {
            type: "datetime",
            name: "publishedAt",
            label: "Data de publica\xE7\xE3o"
          },
          {
            type: "boolean",
            name: "draft",
            label: "Rascunho"
          },
          {
            type: "number",
            name: "readingTimeMinutes",
            label: "Tempo de leitura (min)"
          },
          {
            type: "rich-text",
            name: "body",
            label: "Conte\xFAdo",
            isBody: true
          }
        ]
      }
    ]
  }
});
export {
  config_default as default
};
