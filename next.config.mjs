/** @type {import('next').NextConfig} */
const nextConfig = {
    async redirects() {
        return [
            {
                source: '/linkedin',
                destination: 'https://www.linkedin.com/in/pilu-vitu/',
                permanent: true,
            },
            {
                source: '/github',
                destination: 'https://github.com/PiluVitu',
                permanent: true,
            },
            {
                source: '/instagram',
                destination: 'https://www.instagram.com/pilu.dev/',
                permanent: true,
            },
            {
                source: '/twitter',
                destination: 'https://twitter.com/PiluVitu',
                permanent: true,
            },
            {
                source: '/zap',
                destination: 'https://wa.me/message/6UOZCKTOYGUNE1',
                permanent: true,
            },
            {
                source: '/twitch',
                destination: 'https://www.twitch.tv/piluvitu',
                permanent: true,
            },
        ]
    },
}

export default nextConfig
