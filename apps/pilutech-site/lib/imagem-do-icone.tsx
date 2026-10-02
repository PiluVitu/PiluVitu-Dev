import { ImageResponse } from 'next/og'
import { SvgDaMarca } from '@/components/pilutech-mark'
import { CORES_DA_MARCA } from './marca'

export function imagemDoIcone(
  lado: number,
  { arredondado }: { arredondado: boolean },
): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: CORES_DA_MARCA.noite,
        borderRadius: arredondado ? Math.round(lado * 0.22) : 0,
      }}
    >
      <SvgDaMarca
        tamanho={Math.round(lado * 0.62)}
        cores={{ base: CORES_DA_MARCA.texto, destaque: CORES_DA_MARCA.ciano }}
      />
    </div>,
    { width: lado, height: lado },
  )
}
