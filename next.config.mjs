/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'media.dev.to',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'media2.dev.to',
        port: '',
        pathname: '/**',
      },
    ],
  },
  experimental: {
    // Suppress hydration warnings from browser extensions
    suppressHydrationWarning: true,
  },
}

export default nextConfig
