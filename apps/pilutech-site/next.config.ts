import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'botai.pilutech.com.br',
        port: '',
        pathname: '/opengraph-image',
        search: '',
      },
      {
        protocol: 'https',
        hostname: 'sombrai.pilutech.com.br',
        port: '',
        pathname: '/opengraph-image.png',
        search: '',
      },
    ],
  },
}

export default nextConfig
