/* eslint-disable @next/next/no-img-element -- ImageResponse (Satori) só suporta <img> */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export type DadosOgPiluLabs = {
  rotulo: string
  titulo: string
  subtitulo: string
  icone?: string
}

async function pngComoDataUrl(caminhoPublico: string): Promise<string | null> {
  try {
    const arquivo = await readFile(
      join(process.cwd(), 'public', caminhoPublico),
    )
    return `data:image/png;base64,${arquivo.toString('base64')}`
  } catch {
    return null
  }
}

export async function imagemOgPiluLabs({
  rotulo,
  titulo,
  subtitulo,
  icone,
}: DadosOgPiluLabs): Promise<ImageResponse> {
  const iconeSrc = icone ? await pngComoDataUrl(icone) : null
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: '#0b1220',
      }}
    >
      <div style={{ display: 'flex', fontSize: 30, color: '#38bdf8' }}>
        {rotulo}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 48 }}>
        {iconeSrc ? (
          <img
            src={iconeSrc}
            width={168}
            height={168}
            alt=""
            style={{ borderRadius: 36 }}
          />
        ) : null}
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: titulo.length > 14 ? 72 : 92,
              fontWeight: 700,
              color: '#f8fafc',
              letterSpacing: -2,
            }}
          >
            {titulo}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 38,
              color: '#94a3b8',
              lineHeight: 1.3,
            }}
          >
            {subtitulo}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', fontSize: 28, color: '#64748b' }}>
        PiluLabs · Powered by PiluTech
      </div>
    </div>,
    { ...size },
  )
}
