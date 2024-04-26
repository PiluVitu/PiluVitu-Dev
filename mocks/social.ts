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
    image: 'https://github.githubassets.com/favicons/favicon-dark.png',
    altImage: 'GH',
  },
  {
    id: nanoid(),
    socialDescription: 'Vamos nos conectar no LinkedIn',
    socialLink: 'https://piluvitu.dev/linkedin',
    image: 'https://static.licdn.com/aero-v1/sc/h/al2o9zrvru7aqj8e1x2rzsrca',
    altImage: 'LKDN',
  },
  {
    id: nanoid(),
    socialDescription: 'Me siga no X',
    socialLink: 'https://piluvitu.dev/twitter',
    image: 'https://abs.twimg.com/favicons/twitter-pip.3.ico',
    altImage: 'TW',
  },
  {
    id: nanoid(),
    socialDescription: 'Segue no GranGran',
    socialLink: 'https://piluvitu.dev/instagram',
    image: 'https://static.cdninstagram.com/rsrc.php/v3/yV/r/ftfgD2tsNT7.png',
    altImage: 'IN',
  },
  {
    id: nanoid(),
    socialDescription: 'Xama no Zap',
    socialLink: 'https://piluvitu.dev/zap',
    image: 'https://static.whatsapp.net/rsrc.php/v3/yz/r/ujTY9i_Jhs1.png',
    altImage: 'WZP',
  },
]
