import { ApiError } from '../api'

/**
 * Mensagem padrão de "a ação deu certo, o recarregamento é que não".
 * Cada tela pode passar uma mais específica (nomeando o que de fato
 * aconteceu: "arquivada", "criada"...) — ver `mutarERecarregar` abaixo.
 *
 * ⚠️ NUNCA pode ler como falha da ação. É esse o defeito inteiro que este
 * módulo existe pra impedir.
 */
export const MENSAGEM_RECARGA_FALHOU =
  'A ação foi concluída, mas não consegui recarregar a tela — atualize a página pra ver o resultado.'

export type ResultadoMutacao =
  | { ok: true }
  | { ok: false; fase: 'mutacao' | 'recarga'; mensagem: string }

function mensagemDoErro(err: unknown): string {
  return err instanceof ApiError ? err.message : String(err)
}

/**
 * Executa uma mutação e SÓ DEPOIS recarrega — em dois `try` separados,
 * nunca um só.
 *
 * O defeito que isto elimina (achado de revisão, primeiro em
 * `debt-detail.tsx`, depois de novo em `accounts.tsx`): com `carregar()`
 * dentro do MESMO `try` da mutação, uma mutação que dá 200 seguida de um
 * `GET` que falha (rede instável logo depois — o Android do dono) fazia a
 * tela gravar o erro do GET no estado de erro da AÇÃO e continuar mostrando
 * o estado ANTIGO. O dono lia "falhou", tentava de novo e batia num 404
 * ("já arquivada" / "já baixada"): a ação tinha funcionado, a tela dizia
 * que não, e não havia saída.
 *
 * Mutação e recarregamento são sucessos/falhas INDEPENDENTES aos olhos do
 * dono — por isso o retorno diz QUAL das duas fases falhou, e quem chama
 * decide onde escrever a mensagem (`formError`, `acaoErro`, ...) e qual
 * estado de "processando" limpar. A estrutura de dois `try` e a distinção
 * das duas mensagens têm um dono só; os setters de estado ficam na tela.
 *
 * Não lança: erro de qualquer uma das fases vira valor de retorno.
 */
export async function mutarERecarregar(
  mutar: () => Promise<unknown>,
  recarregar: () => Promise<unknown>,
  mensagemRecargaFalhou: string = MENSAGEM_RECARGA_FALHOU,
): Promise<ResultadoMutacao> {
  try {
    await mutar()
  } catch (err: unknown) {
    return { ok: false, fase: 'mutacao', mensagem: mensagemDoErro(err) }
  }

  try {
    await recarregar()
  } catch {
    // A mensagem do GET NUNCA é repassada: ela descreve a falha do
    // recarregamento, e mostrá-la aqui é exatamente o que fazia o dono ler
    // "falhou" depois de uma ação bem-sucedida.
    return { ok: false, fase: 'recarga', mensagem: mensagemRecargaFalhou }
  }

  return { ok: true }
}
