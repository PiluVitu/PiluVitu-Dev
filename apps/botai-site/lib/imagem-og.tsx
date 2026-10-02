/* eslint-disable @next/next/no-img-element -- ImageResponse (Satori) só suporta <img> */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export type DadosDaImagemOg = {
  rotulo: string
  titulo: string
  subtitulo: string
}

export async function imagemOg({
  rotulo,
  titulo,
  subtitulo,
}: DadosDaImagemOg): Promise<ImageResponse> {
  const icone = await readFile(join(process.cwd(), 'app', 'icon.png'), 'base64')
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
        <img
          src={`data:image/png;base64,${icone}`}
          width={168}
          height={168}
          alt=""
          style={{ borderRadius: 36 }}
        />
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
