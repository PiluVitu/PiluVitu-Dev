import { nanoid } from 'nanoid';
export type Carreira = {
  id: string;
  orgName: string;
  orgDescription: string;
  orgLink: string;
  image?: string;
  altImage: string;
  title: string;
  role: string;
  location: string;
  date: string;
  atribuitions: string[];
};

export const Carreiras: Carreira[] = [
  {
    id: nanoid(),
    orgName: 'ViralizePlus',
    orgDescription: 'Sua comunidade de desenvolvimento open source!',
    orgLink: 'https://www.viralizeplus.com.br/',
    image:
      'https://viralizeplusprod.s3.us-east-1.amazonaws.com/Group+1597881566.png',
    altImage: 'VP',
    title: 'Developer',
    role: 'FullStackOps',
    location: 'São Paulo, São Paulo, Brasil - Remoto',
    date: 'Dez, 2024 - Atualmente',
    atribuitions: [
      'Implementação de CI/CD',
      'Dockerização de aplicações e integração com ECS',
      'Criação e gerenciamento de pipelines(GitHub Actions)',
      'Criação e configuração de serviços usando ferramentas IAC(Terraform)',
      'Deploy de aplicações de front e back na AWS',
      'Implementação de telemetria e trace de log(openTelymetry)',
      'Otimização de custos da infra em 40%',
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
    title: 'Software Developer',
    role: 'Front-End',
    location: 'São Paulo, São Paulo, Brasil - Remoto',
    date: 'Mar, 2024 - Atualmente',
    atribuitions: [
      'Criação e refatoração de componentes(MUI)',
      'Resolução de bugs e tratamento de erros com base em relatório(Rollbar)',
      'Desenvolvimento de novas features(React + TS)',
      'Configuração de ambiente',
      'Criação de Páginas responsivas(Styled Components)',
      'Consumo de APIs(Axios)',
    ],
  },
  {
    id: nanoid(),
    orgName: 'RedeConfia',
    orgDescription: 'Plataforma de infraestrutura e soluções digitais',
    orgLink: 'https://redeconfia.com.br/',
    image: 'https://redeconfia.com.br/assets/home-logo-C3ApN9Xe.svg',
    altImage: 'RC',
    title: 'Developer',
    role: 'DevOps',
    location: 'São Paulo, São Paulo, Brasil - Remoto',
    date: 'Dez, 2024 - Dez, 2024',
    atribuitions: [
      'Implementação de infraestrutura multi-cloud com Terraform, integrando Cloudflare e Render',
      'Arquitetou e implementou ambientes segregados (staging/produção) automatizados por IAC',
      'Desenvolvimento de pipelines CI/CD',
      'Análise e implementação de estratégia de precificação otimizada, garantindo melhor custo-benefício da infraestrutura',
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
    title: 'Developer',
    role: 'DevOps',
    location: 'São Paulo, São Paulo, Brasil - Remoto',
    date: 'Mai, 2023 - Out, 2024',
    atribuitions: [
      'Implementação de CI/CD ',
      'Dockerização de aplicações',
      'Criação e gerenciamento de pipilines(GitHub Actions)',
      'Criação e gerenciamento de ambientes de desenvolvimento/produção na AWS',
      'Implementação de monitoramento(Prometheus, Grafana Faro)',
      'Criação e configuração de serviços usando ferramentas IAC(Ansible e Terraform)',
      'Deploy de aplicações de front e back em cloud provider(AWS)',
    ],
  },
];
