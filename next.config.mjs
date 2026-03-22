/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
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
    ],
  },
};

export default nextConfig;
