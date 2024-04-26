import { nanoid } from 'nanoid'
export type Project = {
  id: string
  projectName: string
  tags: string[]
  projectLogo: string
  deployLink: string
  repoLink: string
  image?: string
  altImage: string
}

export const Projects: Project[] = [
  {
    id: nanoid(),
    projectName: 'Octopost',
    projectLogo: '',
    tags: [
      'React',
      'Sass',
      'Vite',
      'Electron',
      'Node',
      'Express',
      'TS',
      'Vitest',
    ],
    deployLink: '',
    repoLink: 'https://github.com/devhatt/octopost',
    image: '/octopost.png',
    altImage: 'OC',
  },
  {
    id: nanoid(),
    projectName: 'Petdex',
    projectLogo: '',
    tags: ['JS', 'Go', 'Storybook', 'Sass', 'MariaDB', 'HTML', 'Docker'],
    deployLink: '',
    repoLink: 'https://bento.me/devhatt',
    image: '/petdex.png',
    altImage: 'PD',
  },
  {
    id: nanoid(),
    projectName: 'React Movies',
    projectLogo: '',
    tags: ['React', 'StyledComponentes', 'Vite'],
    deployLink: 'https://rocket-movies.piluvitu.dev',
    repoLink: 'https://github.com/PiluVitu/RocketMovies',
    image: '/rocket-movies.png',
    altImage: 'DH',
  },
  {
    id: nanoid(),
    projectName: 'ToDo App',
    projectLogo: '',
    tags: ['React', 'StyledComponentes', 'Vite'],
    deployLink: 'https://rocket-todo-ruby.vercel.app/',
    repoLink: 'https://github.com/PiluVitu/Rocket-Todo',
    image: '/todo.png',
    altImage: 'TD',
  },
  {
    id: nanoid(),
    projectName: 'GitFav',
    projectLogo: 'Octopost',
    tags: ['JS', 'HTML', 'CSS'],
    deployLink: 'https://git-fav-explorer.vercel.app/',
    repoLink: 'https://github.com/PiluVitu/GitFav-Explorer',
    image: '/git-fav.png',
    altImage: 'GF',
  },
]
