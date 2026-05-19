/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // mermaid + langium têm deep imports de vscode-jsonrpc/languageserver-* que
  // Turbopack não consegue resolver pelo walk-up do .pnpm. Como mermaid já é
  // carregado lazy em components/mdx/mermaid-block.tsx (dynamic import dentro
  // de useEffect, só roda no client), basta marcá-los como externals do server
  // pra Turbopack não tentar fazer o bundle dessa cadeia.
  serverExternalPackages: [
    "mermaid",
    "@mermaid-js/parser",
    "langium",
  ],
  // Keystatic lê YAML em runtime; o trace serverless da Vercel pode não os
  // incluir nas revalidações ISR — sem isto, carreiras/projetos/redes podem
  // aparecer vazios em produção.
  outputFileTracingIncludes: {
    "/*": ["./content/**/*"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "media.dev.to",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "media2.dev.to",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "viralizeplusprod.s3.us-east-1.amazonaws.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "aride.com.br",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "redeconfia.com.br",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "creatorspace.imgix.net",
        port: "",
        pathname: "/**",
      },
      // TinaCMS media uploads stored in piluvitu-blog repo
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        port: "",
        pathname: "/PiluVitu/piluvitu-blog/**",
      },
      // Tina Cloud media
      {
        protocol: "https",
        hostname: "assets.tina.io",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
