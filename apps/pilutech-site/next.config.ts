import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // O repo guia o agente pelos CLAUDE.md; sem isto o `next dev` grava um AGENTS.md.
  agentRules: false,
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
      {
        protocol: 'https',
        hostname: 'apurai.pilutech.com.br',
        port: '',
        pathname: '/opengraph-image.png',
        search: '',
      },
      {
        protocol: 'https',
        hostname: 'reparai.pilutech.com.br',
        port: '',
        pathname: '/opengraph-image.png',
        search: '',
      },
    ],
  },
}

export default nextConfig
