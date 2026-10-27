import { ImageResponse } from 'next/og'

export const alt = 'Votaí: a votação de filmes da turma'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 96,
        background: 'linear-gradient(135deg, #0b1220 0%, #1e1b4b 100%)',
        color: '#f8fafc',
      }}
    >
      <div style={{ fontSize: 40, color: '#22d3ee', letterSpacing: 6 }}>
        VOTAÇÃO DE FILMES
      </div>
      <div style={{ fontSize: 160, fontWeight: 700, marginTop: 16 }}>Votaí</div>
      <div style={{ fontSize: 40, color: '#cbd5e1', marginTop: 16 }}>
        votai.piluvitu.com.br
      </div>
    </div>,
    size,
  )
}
