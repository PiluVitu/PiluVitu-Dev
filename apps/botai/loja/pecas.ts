export type Tema = 'escuro' | 'claro'
export type Cena = 'pagina-preenchida' | 'pessoa-de-teste' | 'resultado'
export type CenaDeDestaque = Exclude<Cena, 'pagina-preenchida'>

export interface Tamanho {
  largura: number
  altura: number
}
export interface Peca extends Tamanho {
  arquivo: string
}
export interface Captura {
  nome: string
  cena: Cena
  tema: Tema
}

export const CENAS: Cena[] = [
  'pagina-preenchida',
  'pessoa-de-teste',
  'resultado',
]
export const TEMAS: Tema[] = ['escuro', 'claro']

const doisDigitos = (n: number) => String(n).padStart(2, '0')

export const CAPTURAS: Captura[] = CENAS.flatMap((cena, i) =>
  TEMAS.map((tema, j) => ({
    cena,
    tema,
    nome: `${doisDigitos(i * TEMAS.length + j + 1)}-${cena}-${tema}`,
  })),
)

export const TAMANHOS_DAS_CAPTURAS: Tamanho[] = [
  { largura: 1280, altura: 800 },
  { largura: 640, altura: 400 },
]
export const TAMANHO_DA_OPERA: Tamanho = { largura: 612, altura: 408 }
export const CENAS_DA_OPERA: CenaDeDestaque[] = ['pessoa-de-teste', 'resultado']

export const ICONE: Peca = {
  arquivo: 'icone-128.png',
  largura: 128,
  altura: 128,
}
export const LOGO_DO_EDGE: Peca = {
  arquivo: 'edge-logo-300.png',
  largura: 300,
  altura: 300,
}
export const TILE_DA_CHROME: Peca = {
  arquivo: 'chrome-tile-440x280.png',
  largura: 440,
  altura: 280,
}

export const arquivoDaCaptura = (captura: Captura, t: Tamanho) =>
  `capturas/${t.largura}x${t.altura}/${captura.nome}.png`

export const arquivoDaOpera = (cena: CenaDeDestaque) =>
  `opera/${TAMANHO_DA_OPERA.largura}x${TAMANHO_DA_OPERA.altura}/${doisDigitos(CENAS_DA_OPERA.indexOf(cena) + 1)}-${cena}.png`

export const PECAS_DA_LOJA: Peca[] = [
  ICONE,
  LOGO_DO_EDGE,
  TILE_DA_CHROME,
  ...CAPTURAS.flatMap((captura) =>
    TAMANHOS_DAS_CAPTURAS.map((t) => ({
      arquivo: arquivoDaCaptura(captura, t),
      ...t,
    })),
  ),
  ...CENAS_DA_OPERA.map((cena) => ({
    arquivo: arquivoDaOpera(cena),
    ...TAMANHO_DA_OPERA,
  })),
]

export const COPIAS_PARA_O_SITE: { origem: string; destino: string }[] = [
  { origem: ICONE.arquivo, destino: 'icone-128.png' },
  ...CAPTURAS.map((captura) => ({
    origem: arquivoDaCaptura(captura, TAMANHOS_DAS_CAPTURAS[0]),
    destino: `capturas/${captura.nome}.png`,
  })),
]
