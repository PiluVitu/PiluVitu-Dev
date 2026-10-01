import { type Rng, rngPadrao, escolher, digitosAleatorios } from './aleatorio'

export type Sexo = 'F' | 'M'

export const PRENOMES_F = [
  'Maria Eduarda',
  'Ana Clara',
  'Beatriz',
  'Juliana',
  'Camila',
  'Larissa',
  'Fernanda',
  'Letícia',
  'Mariana',
  'Gabriela',
  'Patrícia',
  'Aline',
  'Júlia',
  'Isabela',
  'Luíza',
  'Ana Paula',
  'Vitória',
  'Bruna',
  'Natália',
  'Tânia',
] as const

export const PRENOMES_M = [
  'João Pedro',
  'Lucas Gabriel',
  'Rafael',
  'Thiago',
  'Gustavo',
  'Felipe',
  'José Carlos',
  'Antônio',
  'Carlos Eduardo',
  'Pedro Henrique',
  'Matheus',
  'Bruno',
  'André',
  'Vinícius',
  'Luiz Fernando',
  'Francisco',
  'Caio',
  'Diego',
  'Márcio',
  'Sérgio',
] as const

export const SOBRENOMES = [
  'Silva',
  'Santos',
  'Oliveira',
  'Souza',
  'Pereira',
  'Ferreira',
  'Lima',
  'Alves',
  'Rodrigues',
  'Costa',
  'Ribeiro',
  'Carvalho',
  'Almeida',
  'Rocha',
  'Barbosa',
  'Gomes',
  'Martins',
  'Araújo',
  'Melo',
  'Cardoso',
  'Nascimento',
  'Moreira',
  'Teixeira',
  'Correia',
  'Mendes',
  'Freitas',
  'Barros',
  'Pinto',
  'Monteiro',
  'Conceição',
] as const

export interface Nome {
  sexo: Sexo
  prenome: string
  sobrenomes: [string, string]
  completo: string
  noCartao: string
}

export function removerAcentos(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function slugNome(s: string): string {
  return removerAcentos(s)
    .toLowerCase()
    .replace(/[^a-z]/g, '')
}

export function nomeNoCartao(
  prenome: string,
  sobrenomes: [string, string],
): string {
  const partes = [...prenome.split(' '), ...sobrenomes]
  const meio = partes.slice(1, -1).map((p) => p[0])
  return removerAcentos(
    [partes[0], ...meio, partes[partes.length - 1]].join(' '),
  ).toUpperCase()
}

export function gerarNome(rng: Rng = rngPadrao): Nome {
  const sexo: Sexo = rng.int(2) === 0 ? 'F' : 'M'
  const prenome = escolher(rng, sexo === 'F' ? PRENOMES_F : PRENOMES_M)
  const s1 = escolher(rng, SOBRENOMES)
  let s2 = escolher(rng, SOBRENOMES)
  while (s2 === s1) s2 = escolher(rng, SOBRENOMES)
  const sobrenomes: [string, string] = [s1, s2]
  return {
    sexo,
    prenome,
    sobrenomes,
    completo: `${prenome} ${s1} ${s2}`,
    noCartao: nomeNoCartao(prenome, sobrenomes),
  }
}

export const DOMINIO_EMAIL = 'tuamaeaquelaursa.com'

export interface Email {
  usuario: string
  endereco: string
  caixaUrl: string
}

export function gerarEmail(rng: Rng, nome: Nome): Email {
  const primeiro = slugNome(nome.prenome.split(' ')[0])
  const ultimo = slugNome(nome.sobrenomes[1])
  const usuario = `${primeiro}-${ultimo}-${digitosAleatorios(rng, 4).join('')}`
  return {
    usuario,
    endereco: `${usuario}@${DOMINIO_EMAIL}`,
    caixaUrl: `https://${DOMINIO_EMAIL}/${usuario}`,
  }
}
