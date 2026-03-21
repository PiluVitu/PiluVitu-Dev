/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
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
    ],
  },
};

export default nextConfig;
