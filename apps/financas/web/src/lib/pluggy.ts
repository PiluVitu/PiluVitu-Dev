import type { LinhaImportada } from '@piluvitu/tools/import'
import { api } from '../api'

/**
 * Fatia ④ (Open Finance via Pluggy) — o que a tela de import
 * (`pages/importar.tsx`) precisa saber sobre a sincronização, fora do
 * componente: shape da resposta, a janela de datas default, a dica por
 * causa de erro e a conexão salva por conta. Mesmo raciocínio de
 * `lib/insight.ts`/`lib/commitments.ts`: tipo/regra fora da página, com
 * teste próprio.
 */

/**
 * Espelha `LinhaRejeitada` de `src/domain/pluggy-map.ts` (Worker) — a SPA
 * não importa através da fronteira Worker/bundle (mesma razão de
 * `lib/dates.ts` duplicar `todayInTeresina`).
 *
 * ⚠️ Existe porque linha recusada é **reportada, nunca descartada**: sem
 * mostrar isto, o dono veria "importei 30" sem saber que 12 ficaram de
 * fora — e as que mais ficam de fora são as `PENDING`, que num cartão são
 * a FATURA ABERTA INTEIRA.
 */
export type LinhaRejeitadaView = {
  index: number
  id: string
  motivo: string
}

/** Espelha `PluggyTransactionsResponse` de `src/routes/pluggy.ts`. */
export type PluggyTransactionsView = {
  account_id: string
  item_id: string
  from: string
  to: string
  paginas: number
  recebidas: number
  linhas: LinhaImportada[]
  rejeitadas: LinhaRejeitadaView[]
}

/**
 * O par que identifica a conexão no Pluggy. **Não é credencial** — por
 * isso mora em `settings` (D1) e não em secret; o que é credencial
 * (`PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET`) nunca chega ao navegador.
 */
export type ConexaoPluggy = {
  /** `item` do Pluggy: a CONEXÃO com o banco (é ela que cai e pede reconexão). */
  item_id: string
  /** `account` do Pluggy: a conta/cartão DENTRO daquela conexão. */
  account_id: string
}

/**
 * Chaveada por `account_id` DESTE app, mesmo padrão (e mesmo motivo) de
 * `import_map:<account_id>` em `lib/import-settings.ts`: cada conta daqui
 * representa, na prática, um banco/cartão específico. Vale de graça o
 * ganho que o mapa de colunas já pagou: o dono conecta no MacBook e
 * sincroniza do Android sem reconfigurar (`localStorage` não faria isso).
 */
function chaveConexao(accountId: string): string {
  return `pluggy:${accountId}`
}

function isConexao(value: unknown): value is ConexaoPluggy {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.item_id === 'string' &&
    v.item_id !== '' &&
    typeof v.account_id === 'string' &&
    v.account_id !== ''
  )
}

/**
 * Conexão salva daquela conta, ou `null` quando não há (ou quando o valor
 * salvo não é o shape esperado / a chamada falhou) — degrada pro
 * formulário de configuração em vez de lançar, igual a `mapaSalvo`.
 */
export async function conexaoPluggy(
  accountId: string,
): Promise<ConexaoPluggy | null> {
  try {
    const { value } = await api<{ key: string; value: string | null }>(
      `/api/settings/${encodeURIComponent(chaveConexao(accountId))}`,
    )
    if (value === null) return null
    const parsed: unknown = JSON.parse(value)
    return isConexao(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * ⚠️ **LANÇA quando falha — ao contrário de `salvarMapa`, e a divergência
 * é deliberada.** Lá o salvamento é um efeito colateral no MEIO de uma
 * importação em curso (engolir a falha é melhor que travar o que o dono
 * está fazendo). Aqui é uma AÇÃO PRÓPRIA dele, com botão e formulário: um
 * "salvei" mudo que não salvou faria ele voltar amanhã e reencontrar o
 * formulário vazio, sem nunca ter sido avisado. Quem chama trata com
 * `mutarERecarregar`.
 */
export async function salvarConexaoPluggy(
  accountId: string,
  conexao: ConexaoPluggy,
): Promise<void> {
  await api(`/api/settings/${encodeURIComponent(chaveConexao(accountId))}`, {
    method: 'PUT',
    body: JSON.stringify({ value: JSON.stringify(conexao) }),
  })
}

/**
 * ⚠️ **A janela default é de UM MÊS, nunca dos 12 que o Pluggy guarda — é
 * a guarda do primeiro import, e ela é estrutural, não um aviso.**
 *
 * O dono vai importar histórico. Se o sinal estiver invertido, não há
 * desfazer barato: `uq_tx_imported` impede reimportar por cima, e a saída
 * seria `DELETE ... WHERE import_source='pluggy'` ou Time Travel (que
 * restaura o banco INTEIRO). Um default de 12 meses transformaria o
 * primeiro toque no maior estrago possível; com um mês, o pior caso é uma
 * dezena de linhas conferíveis a olho.
 *
 * O servidor **não tem default nenhum** (`routes/pluggy.ts` recusa sem
 * `from`/`to`), então esta é a única janela que existe — não dá pra
 * "esquecer" de passar e cair no ano inteiro.
 */
export function janelaPadrao(hoje: string): { de: string; ate: string } {
  const ano = Number(hoje.slice(0, 4))
  const mes = Number(hoje.slice(5, 7))
  const dia = Number(hoje.slice(8, 10))

  const anoAnterior = mes === 1 ? ano - 1 : ano
  const mesAnterior = mes === 1 ? 12 : mes - 1
  // Dia 0 do mês seguinte = último dia do mês pedido — o mesmo aparo de
  // `competenceDueDate` no Worker: 31/03 vira 28/02, nunca 03/03.
  const ultimoDia = new Date(Date.UTC(anoAnterior, mesAnterior, 0)).getUTCDate()
  const diaAparado = Math.min(dia, ultimoDia)

  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    de: `${anoAnterior}-${pad(mesAnterior)}-${pad(diaAparado)}`,
    ate: hoje,
  }
}

/**
 * A dica que traduz o `code` em AÇÃO — e ela existe porque erros de MESMO
 * status mandam o dono pra lados OPOSTOS (mesma disciplina de
 * `dicaParaErroDeGeracao`, `lib/insight.ts`).
 *
 * ⚠️ **`pluggy_item_disconnected` é a mais importante das sete**: é a que
 * o dono mais vai ver com o tempo (conexão bancária cai sozinha, por
 * expiração de consentimento ou senha trocada) e a que mais parece "erro
 * genérico" se mal escrita. Nada nesta tela resolve — nem repetir, nem
 * trocar secret, nem esperar —, e a dica diz isso com todas as letras,
 * nomeando o app onde a ação existe.
 *
 * A mensagem do servidor continua sendo mostrada como está: esta dica é um
 * SEGUNDO parágrafo, nunca uma reescrita. `null` pra todo código sem ação
 * específica conhecida — não inventar conselho pra erro não mapeado.
 */
export function dicaParaErroPluggy(code: string): string | null {
  if (code === 'pluggy_disabled') {
    return 'Isto NÃO é o banco fora do ar nem conexão caída: os secrets PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET nunca foram configurados neste Worker. Enquanto isso, o import por arquivo (.ofx/.csv) continua funcionando normalmente.'
  }
  if (code === 'pluggy_invalid_credentials') {
    return 'O Pluggy recusou as credenciais DESTE APLICATIVO — não tem a ver com a sua conexão bancária, e repetir não resolve. Confira PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.'
  }
  if (code === 'pluggy_item_disconnected') {
    return 'Só o app Meu Pluggy pode refazer essa conexão: abra o app, reconecte esta conta e volte aqui. Tentar de novo agora dá exatamente o mesmo resultado. Enquanto isso, dá pra importar o extrato por arquivo (.ofx/.csv).'
  }
  if (code === 'pluggy_rate_limited') {
    return 'Nada quebrou e nada precisa ser reconfigurado: o Pluggy só limitou a quantidade de consultas por minuto. Espere o tempo indicado acima e toque de novo.'
  }
  if (code === 'pluggy_unreachable') {
    return 'O problema é do lado do Pluggy (ou da rede), não da sua conexão nem da configuração daqui — nada precisa ser mudado. Tente mais tarde.'
  }
  if (code === 'pluggy_token_expired' || code === 'pluggy_ilegivel') {
    return 'O Pluggy RESPONDEU, então não é caso de mexer nos secrets nem de reconectar a conta. Se repetir, é para reportar.'
  }
  if (code === 'pluggy_janela_grande') {
    return 'Escolha um intervalo menor (um mês por vez) e sincronize em partes — conferir em pedaços também é mais seguro que conferir tudo de uma vez.'
  }
  return null
}
