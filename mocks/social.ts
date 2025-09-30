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
    socialLink: 'https://github.com/PiluVitu',
    image: '/github.png',
    altImage: 'GH',
  },
  {
    id: nanoid(),
    socialDescription: 'Vamos nos conectar no LinkedIn',
    socialLink: 'https://www.linkedin.com/in/pilu-vitu/',
    image: '/linkedin.png',
    altImage: 'LKDN',
  },
  {
    id: nanoid(),
    socialDescription: 'Me siga no X',
    socialLink: 'https://twitter.com/PiluVitu',
    image: '/twitter.png',
    altImage: 'TW',
  },
  // {
  //   id: nanoid(),
  //   socialDescription: 'Me siga no BlueSky',
  //   socialLink: 'https://bsky.app/profile/piluvitu.dev',
  //   image: '/bsky.png',
  //   altImage: 'BSKY',
  // },
  {
    id: nanoid(),
    socialDescription: 'Segue no GranGran',
    socialLink: 'https://www.instagram.com/pilu.dev/',
    image: '/instagram.png',
    altImage: 'IN',
  },
  // {
  //   id: nanoid(),
  //   socialDescription: 'Xama no Zap',
  //   socialLink: 'https://wa.me/message/6UOZCKTOYGUNE1',
  //   image: '/whatsapp.png',
  //   altImage: 'WZP',
  // },
]
