import { nanoid } from 'nanoid'
export type Carreira = {
  id: string
  orgName: string
  orgDescription: string
  orgLink: string
  image?: string
  altImage: string
  title: string
  role: string
  location: string
  date: string
  atribuitions: string[]
}

export const Carreiras: Carreira[] = [
  {
    id: nanoid(),
    orgName: 'Dev Hatt',
    orgDescription: 'Sua comunidade de desenvolvimento open source!',
    orgLink: 'https://bento.me/devhatt',
    image:
      'https://creatorspace.imgix.net/users/clvcq3cpx00szrx01tp252b95/pKsIsqvUYb6ORJ97-Icon%25207.png?w=300&h=300',
    altImage: 'DH',
    title: 'Software Engineer',
    role: 'DevOps',
    location: 'São Paulo, São Paulo, Brasil - Remoto',
    date: '01 Mai, 2023 - Atualmente',
    atribuitions: [
      'Implementação de CD ',
      'Implementação de CI de testes e build',
      'Dockerização de aplicações',
      'Criação de ambiente de stage',
      'Incorporação e configuração de novas ferramentas para aumentar a eficiência.',
      'Proatividade na busca por melhorias contínuas.',
    ],
  },
  {
    id: nanoid(),
    orgName: 'Dev Hatt',
    orgDescription: 'Sua comunidade de desenvolvimento open source!',
    orgLink: 'https://bento.me/devhatt',
    image:
      'https://creatorspace.imgix.net/users/clvcq3cpx00szrx01tp252b95/pKsIsqvUYb6ORJ97-Icon%25207.png?w=300&h=300',
    altImage: 'DH',
    title: 'Software Engineer',
    role: 'Full-Stack',
    location: 'São Paulo, São Paulo, Brasil - Remoto',
    date: '12 Dez, 2023 - 30 Mar, 2024',
    atribuitions: [
      'Dedicação à criação de novos componentes e recursos.',
      'Foco constante em aperfeiçoar as aplicações da empresa com refatoração.',
      'Organização do sistema.',
      'Implementação de uma Tracker dedicada para análise e coleta de dados.',
      'Uso desses insights para melhorar ainda mais os projetos.',
    ],
  },
  {
    id: nanoid(),
    orgName: 'Aride',
    orgDescription:
      'Seguro digital de bicicletas, a cobertura de queda acidental oferece proteção contra danos materiais causados à bicicleta em caso de acidentes não intencionais',
    orgLink: 'https://aride.com.br/',
    image:
      'https://aride.com.br/wp-content/uploads/2023/06/FAVICON-ARIDE-150x150.png',
    altImage: 'AR',
    title: 'Software Engineer',
    role: 'Front-End',
    location: 'São Paulo, São Paulo, Brasil - Remoto',
    date: '20 Mar, 2024 - Atualmente',
    atribuitions: [
      'Criação de componentes',
      'Refatoração de componentes',
      'Configuração de ambiente',
      'Criação de Páginas responsivas',
      'Consumo de APIs',
    ],
  },
]
