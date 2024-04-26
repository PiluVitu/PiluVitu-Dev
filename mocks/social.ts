import { nanoid } from 'nanoid'
export type Social = {
  id: string
  socialDescription: string
  socialLink: string
  image?: string
  altImage: string
}

export const Socials: Social[] = [
  {
    id: nanoid(),
    socialDescription: 'Acesse o meu Github',
    socialLink: 'https://piluvitu.dev/github',
    image: '/github.png',
    altImage: 'GH',
  },
  {
    id: nanoid(),
    socialDescription: 'Vamos nos conectar no LinkedIn',
    socialLink: 'https://piluvitu.dev/linkedin',
    image: '/linkedin.png',
    altImage: 'LKDN',
  },
  {
    id: nanoid(),
    socialDescription: 'Me siga no X',
    socialLink: 'https://piluvitu.dev/twitter',
    image: '/twitter.png',
    altImage: 'TW',
  },
  {
    id: nanoid(),
    socialDescription: 'Segue no GranGran',
    socialLink: 'https://piluvitu.dev/instagram',
    image: '/instagram.png',
    altImage: 'IN',
  },
  {
    id: nanoid(),
    socialDescription: 'Xama no Zap',
    socialLink: 'https://piluvitu.dev/zap',
    image: '/whatsapp.png',
    altImage: 'WZP',
  },
]
