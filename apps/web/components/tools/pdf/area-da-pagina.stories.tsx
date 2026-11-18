import { useCallback, useEffect, useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs'
import { expect, userEvent, waitFor } from 'storybook/test'
import {
  AreaDaPagina,
  ControlesDaPagina,
  FaixaDePaginas,
  ZOOMS,
  ZOOM_INICIAL,
  usePaginaDesenhada,
} from './area-da-pagina'
import type { DocumentoAberto } from './renderizador'
import { criarRenderizadorFalso } from './renderizador-falso'
import { useMiniaturas } from './use-miniaturas'

// As peças da página aberta do Editar, sem os objetos: a faixa, os controles e a área com a folha.
function PaginaAberta({
  nome,
  paginasQueFalham = [],
  zoomInicial = ZOOM_INICIAL,
}: {
  nome: string
  paginasQueFalham?: number[]
  zoomInicial?: number
}) {
  const [documento, setDocumento] = useState<DocumentoAberto | null>(null)
  const [pagina, setPagina] = useState(0)
  const [zoom, setZoom] = useState(zoomInicial)
  const areaRef = useRef<HTMLDivElement>(null)
  const folhaRef = useRef<HTMLDivElement>(null)
  const anteriorRef = useRef<HTMLButtonElement>(null)
  const proximaRef = useRef<HTMLButtonElement>(null)
  const diminuirRef = useRef<HTMLButtonElement>(null)
  const aumentarRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let aberto: DocumentoAberto | null = null
    void criarRenderizadorFalso({ paginasQueFalham })
      .abrir(new File(['x'], nome, { type: 'application/pdf' }))
      .then((novo) => {
        aberto = novo
        setDocumento(novo)
      })
    return () => aberto?.fechar()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- abre uma vez por story
  }, [nome])

  const miniaturas = useMiniaturas(documento, 64)
  const desenho = usePaginaDesenhada({
    documento,
    pagina,
    zoom,
    areaRef,
    folhaRef,
  })
  const aoEscolher = useCallback((indice: number) => setPagina(indice), [])
  if (!documento) return null
  const total = documento.paginas

  return (
    <section aria-labelledby="titulo" className="max-w-3xl space-y-4">
      <h2 id="titulo" className="font-semibold">
        Páginas
      </h2>
      <FaixaDePaginas
        documento={documento}
        paginas={Array.from({ length: total }, (_, indice) => ({
          chave: `p${indice}`,
          miniatura: indice,
          giro: 0 as const,
        }))}
        pagina={pagina}
        rotulo="Páginas"
        miniaturas={miniaturas}
        aoEscolher={aoEscolher}
      />
      <ControlesDaPagina
        pagina={pagina}
        total={total}
        zoom={zoom}
        anteriorRef={anteriorRef}
        proximaRef={proximaRef}
        diminuirRef={diminuirRef}
        aumentarRef={aumentarRef}
        aoPassar={(sentido) =>
          setPagina((atual) =>
            Math.min(total - 1, Math.max(0, atual + sentido)),
          )
        }
        aoMudarZoom={(passo) =>
          setZoom((atual) =>
            Math.min(ZOOMS.length - 1, Math.max(0, atual + passo)),
          )
        }
      />
      <AreaDaPagina
        areaRef={areaRef}
        folhaRef={folhaRef}
        numeroDaPagina={pagina + 1}
        larguraCss={desenho.larguraCss}
        proporcao={desenho.proporcao}
        desenhando={desenho.desenhando}
        falhou={desenho.falhou}
        aoTentarDeNovo={desenho.tentarDeNovo}
      />
    </section>
  )
}

const meta = {
  title: 'Tools/PDF/AreaDaPagina',
  component: PaginaAberta,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { nome: 'contrato-3p.pdf' },
} satisfies Meta<typeof PaginaAberta>

export default meta
type Story = StoryObj<typeof meta>

export const Pagina: Story = {
  play: async ({ canvas }) => {
    await waitFor(() =>
      expect(canvas.getByTestId('editar-pdf-canvas')).toBeInTheDocument(),
    )
    await expect(
      canvas.getByRole('group', { name: 'Área da página 1' }),
    ).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Próxima página' }),
    )
    await expect(canvas.getByTestId('editar-pdf-posicao')).toHaveTextContent(
      'Página 2 de 3',
    )
    await expect(
      canvas.getByRole('button', { name: 'Página 2' }),
    ).toHaveAttribute('aria-current', 'page')
  },
}

export const PaginaDeitada: Story = { args: { nome: 'mesclado-girado-4p.pdf' } }

export const ZoomNoMaximo: Story = {
  args: { zoomInicial: ZOOMS.length - 1 },
  play: async ({ canvas }) => {
    const aumentar = await canvas.findByRole('button', {
      name: 'Aumentar o zoom',
    })
    await expect(aumentar).toBeDisabled()
    await expect(canvas.getByTestId('editar-pdf-zoom')).toHaveTextContent(
      '400%',
    )
  },
}

export const FalhaAoDesenhar: Story = {
  args: { paginasQueFalham: [0] },
  play: async ({ canvas }) => {
    const alerta = await canvas.findByRole('alert')
    await expect(alerta).toHaveTextContent('Não deu para desenhar a página 1')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Tentar de novo' }),
    )
    await waitFor(() =>
      expect(canvas.getByTestId('editar-pdf-canvas')).toBeInTheDocument(),
    )
  },
}
