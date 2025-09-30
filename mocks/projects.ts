import { nanoid } from 'nanoid'
export type Project = {
  id: string
  projectName: string
  projectLogo: string
  description: string
  tags: string[]
  deployLink: string
  repoLink: string
  image?: string
  altImage: string
}

export const Projects: Project[] = [
  {
    id: nanoid(),
    projectName: 'Live PRs',
    projectLogo: '/pr-live-dark.svg',
    description:
      'Live PRs é um agregador de pull request onde foi solicitada a sua revisão, de acordo com o repositorio que você seleciona, podendo ser de colaboração ou de organização, ele reune todos os PRs em cards, mostrando estado do pr e checks de CI, assignees e outras informações.',
    tags: [
      'React',
      'Next',
      'Go',
      'Tailwind',
      'GitHub Actions',
      'Docker',
      'Aws',
      'Grafana',
      'Prometheus',
      'Sentry',
    ],
    deployLink: 'https://pr-live-folder-front.vercel.app/',
    repoLink: '',
    image: '/live-prs.png',
    altImage: 'LPR',
  },
  // {
  //   id: nanoid(),
  //   projectName: 'Octopost',
  //   projectLogo: '',
  //   description:
  //     'O OctoPost é um aplicativo de redes sociais inovador que permite aos usuários fazerem publicações em várias plataformas de mídia social, tudo dentro de uma única e intuitiva interface unificada.Foi projetado para simplificar o processo de compartilhamento de conteúdo em várias redes sociais.',
  //   tags: [
  //     'React',
  //     'Sass',
  //     'Vite',
  //     'Electron',
  //     'Node',
  //     'Express',
  //     'TS',
  //     'Vitest',
  //     'Github Actions',
  //     'Docker',
  //     'Aws',
  //   ],
  //   deployLink: '',
  //   repoLink: 'https://github.com/devhatt/octopost',
  //   image: '/octopost.png',
  //   altImage: 'OC',
  // },
  // {
  //   id: nanoid(),
  //   projectName: 'Petdex',
  //   projectLogo: '',
  //   description:
  //     'O PetDex é um projeto mobile/desktop com o objetivo de facilitar a adoção de pets. No petdéx usuários e ONGs podem cadastrar os animais para adoção e o aplicativo vai fazer um sistema de match com o usuário que mais combina com aquele pet.',
  //   tags: [
  //     'JS',
  //     'Go',
  //     'Storybook',
  //     'Sass',
  //     'MariaDB',
  //     'HTML',
  //     'Docker',
  //     'GitHub Actions',
  //     'Aws',
  //   ],
  //   deployLink: '',
  //   repoLink: 'https://github.com/devhatt/pet-dex-frontend',
  //   image: '/petdex.png',
  //   altImage: 'PD',
  // },
]
