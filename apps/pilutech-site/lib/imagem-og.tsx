import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { SvgDaMarca } from '@/components/pilutech-mark'
import { CORES_DA_MARCA, NOME_DA_MARCA, proporcoesDoLockup } from './marca'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'PiluTech: infraestrutura, IA e desenvolvimento de software'

const PASTA_DAS_FONTES = join(
  process.cwd(),
  'node_modules',
  '@fontsource',
  'plus-jakarta-sans',
  'files',
)

async function fonte(peso: 500 | 800) {
  return {
    name: 'Plus Jakarta Sans',
    data: await readFile(
      join(PASTA_DAS_FONTES, `plus-jakarta-sans-latin-${peso}-normal.woff`),
    ),
    weight: peso,
    style: 'normal' as const,
  }
}

export async function imagemOg(): Promise<ImageResponse> {
  const simbolo = 120
  const { espaco, palavra } = proporcoesDoLockup(simbolo)
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 80,
        background: CORES_DA_MARCA.noite,
        backgroundImage:
          'radial-gradient(60% 60% at 50% 0%, rgba(56, 189, 248, 0.13), transparent)',
        color: CORES_DA_MARCA.texto,
        fontFamily: 'Plus Jakarta Sans',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: espaco }}>
        <SvgDaMarca
          tamanho={simbolo}
          cores={{ base: CORES_DA_MARCA.texto, destaque: CORES_DA_MARCA.ciano }}
        />
        <div
          style={{
            display: 'flex',
            fontSize: palavra,
            fontWeight: 800,
            letterSpacing: -2.5,
          }}
        >
          {NOME_DA_MARCA}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          maxWidth: 1000,
          fontSize: 64,
          fontWeight: 800,
          lineHeight: 1.08,
          letterSpacing: -2.2,
        }}
      >
        Infraestrutura, IA e desenvolvimento de software.
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 30,
          fontWeight: 500,
          color: CORES_DA_MARCA.aco,
        }}
      >
        pilutech.com.br · Teresina, PI · atendimento remoto
      </div>
    </div>,
    { ...size, fonts: [await fonte(800), await fonte(500)] },
  )
}
