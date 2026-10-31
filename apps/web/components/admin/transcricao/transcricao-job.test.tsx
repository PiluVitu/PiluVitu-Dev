import { renderEstatico } from '@/lib/render-estatico'
import type { TranscricaoJobProps } from './transcricao-job'
import { TranscricaoJob } from './transcricao-job'
import * as historias from './transcricao-job.stories'

// `storybook/test` é ESM puro e o Jest daqui roda CommonJS; as stories só
// precisam do `fn` para os callbacks.
jest.mock('storybook/test', () => ({ fn: () => jest.fn() }))

function render(args: Partial<TranscricaoJobProps> | undefined) {
  return renderEstatico(
    <TranscricaoJob job={null} onNova={() => {}} {...args} />,
  )
}

describe('TranscricaoJob (estados das stories)', () => {
  it('Na fila mostra a posição e a barra em 0%', () => {
    const raiz = render(historias.NaFila.args)
    expect(raiz.textContent).toContain('Na fila — posição 2')
    expect(
      raiz.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'),
    ).toBe('0')
    expect(raiz.textContent).toContain('Pode sair desta tela')
  })

  it('Transcrevendo mostra parte X de N, o nome atual e o progresso', () => {
    const raiz = render(historias.Transcrevendo.args)
    expect(raiz.textContent).toContain(
      'Transcrevendo parte 2 de 3 — reuniao-parte-2.ogg',
    )
    expect(
      raiz.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'),
    ).toBe('33')
  })

  it('aviso de rede aparece sem esconder o andamento', () => {
    const raiz = render(historias.TranscrevendoSemResposta.args)
    expect(raiz.textContent).toContain('tentando de novo')
    expect(raiz.querySelector('[role="progressbar"]')).not.toBeNull()
  })

  it('Pronto mostra o texto, o modelo e o copiar, sem barra', () => {
    const raiz = render(historias.Pronto.args)
    expect(raiz.querySelector('textarea')?.textContent).toContain(
      'Depois o promeia.',
    )
    expect(raiz.textContent).toContain('Copiar texto')
    expect(raiz.textContent).toContain('whisper-large-v3-mlx')
    expect(raiz.querySelector('[role="progressbar"]')).toBeNull()
  })

  it('Erro mostra a mensagem do job e o botão de nova transcrição', () => {
    const raiz = render(historias.Erro.args)
    expect(raiz.querySelector('[role="alert"]')?.textContent).toBe(
      'O promeia reiniciou no meio da transcrição. Envie os áudios de novo.',
    )
    expect(raiz.textContent).toContain('Nova transcrição')
    expect(raiz.querySelector('textarea')).toBeNull()
  })

  it('id expirado (sem job) mostra a mensagem do 404', () => {
    const raiz = render(historias.ErroNaoEncontrada.args)
    expect(raiz.querySelector('[role="alert"]')?.textContent).toContain(
      'não encontrada',
    )
    expect(raiz.textContent).not.toContain('Consultando')
  })

  it('sem job e sem erro ainda está consultando', () => {
    expect(render({}).textContent).toContain('Consultando a transcrição')
  })
})
