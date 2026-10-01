import type { Tema } from './pecas'

interface Cores {
  fundo: string
  texto: string
  suave: string
  destaque: string
}

// Os tokens --background, --foreground, --muted-foreground e --primary do @piluvitu/ui.
export const CORES: Record<Tema, Cores> = {
  escuro: {
    fundo: 'hsl(220 33% 5%)',
    texto: 'hsl(215 33% 93%)',
    suave: 'hsl(216 17% 64%)',
    destaque: 'hsl(198 93% 60%)',
  },
  claro: {
    fundo: 'hsl(220 50% 98%)',
    texto: 'hsl(222 36% 9%)',
    suave: 'hsl(215 18% 35%)',
    destaque: 'hsl(198 93% 26%)',
  },
}
export const BRANCO_DA_OPERA = '#ffffff'

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export const dataUrl = (tipo: string, conteudo: Uint8Array | string) =>
  `data:${tipo};base64,${Buffer.from(conteudo).toString('base64')}`

function documento(corpo: string, estilo: string, fonte?: string): string {
  const faceDaFonte = fonte
    ? `@font-face { font-family: Jakarta; src: url(${fonte}) format('woff2'); font-weight: 200 800; }`
    : ''
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<style>
${faceDaFonte}
* { box-sizing: border-box; margin: 0; }
html, body { width: 100vw; height: 100vh; overflow: hidden; }
body { font-family: Jakarta, system-ui, sans-serif; }
${estilo}
</style>
</head>
<body>${corpo}</body>
</html>`
}

function imagemDoSvg(svg: string, lado: number): string {
  return `<img src="${dataUrl('image/svg+xml', svg)}" alt="" width="${lado}" height="${lado}">`
}

export function htmlIcone(o: { svg: string; arte: number }): string {
  return documento(
    imagemDoSvg(o.svg, o.arte),
    'body { display: grid; place-items: center; background: transparent; }',
  )
}

export function htmlTile(o: { svg: string; fonte: string }): string {
  const c = CORES.escuro
  return documento(
    `<main>${imagemDoSvg(o.svg, 96)}<div><h1>Botaí</h1><p>Bota dados de teste no formulário</p></div></main>`,
    `body { display: grid; place-items: center; background: ${c.fundo}; color: ${c.texto}; }
main { display: flex; align-items: center; gap: 24px; }
h1 { font-size: 44px; font-weight: 800; letter-spacing: -0.02em; }
p { margin-top: 6px; max-width: 220px; font-size: 17px; line-height: 1.35; color: ${c.suave}; }`,
    o.fonte,
  )
}

export function htmlPagina(o: { fundo: string; popup: string }): string {
  return documento(
    `<img class="fundo" src="${o.fundo}" alt=""><img class="popup" src="${o.popup}" alt="">`,
    `.fundo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.popup { position: absolute; top: 1.5vh; right: 1.25vw; width: 29.6875vw; border-radius: 0.94vw; outline: 1px solid rgb(128 128 128 / 0.25); box-shadow: 0 1.25vw 3.75vw rgb(0 0 0 / 0.35); }`,
  )
}

export function htmlDestaque(o: {
  svg: string
  popup: string
  titulo: string
  subtitulo: string
  tema: Tema
  fonte: string
  fundoBranco?: boolean
}): string {
  const c = CORES[o.tema]
  const fundo = o.fundoBranco ? BRANCO_DA_OPERA : c.fundo
  return documento(
    `<main><section><p class="marca">${imagemDoSvg(o.svg, 32)}Botaí</p><h1>${escaparHtml(o.titulo)}</h1><p class="sub">${escaparHtml(o.subtitulo)}</p></section><img class="popup" src="${o.popup}" alt=""></main>`,
    `body { background: ${fundo}; color: ${c.texto}; }
main { height: 100vh; display: flex; align-items: center; justify-content: center; gap: 5vw; padding: 0 6vw; }
section { flex: 1; max-width: 44vw; }
.marca { display: flex; align-items: center; gap: 0.8vw; font-size: 1.9vw; font-weight: 700; color: ${c.destaque}; }
.marca img { width: 2.5vw; height: 2.5vw; }
h1 { margin-top: 1.4vw; font-size: 3.9vw; line-height: 1.1; font-weight: 800; letter-spacing: -0.02em; }
.sub { margin-top: 1.6vw; font-size: 1.75vw; line-height: 1.45; color: ${c.suave}; }
.popup { flex: none; max-width: 40vw; max-height: 86vh; border-radius: 1vw; outline: 1px solid rgb(128 128 128 / 0.25); box-shadow: 0 1.5vw 4vw rgb(0 0 0 / 0.3); }`,
    o.fonte,
  )
}
