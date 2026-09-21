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

/** Espelha `LinhaRejeitada` do Worker. Linha recusada é reportada, nunca descartada. */
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
 * ⚠️ LANÇA quando falha, ao contrário de `salvarMapa`: aqui é ação própria do
 * dono, com botão — um "salvei" mudo o faria voltar amanhã ao formulário vazio.
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
 * Janela default de UM MÊS, nunca os 12 que o Pluggy guarda.
 *
 * ⚠️ É a guarda do primeiro import: sem desfazer barato, um default de 12 meses
 * transformaria o primeiro toque no maior estrago possível. Ver `janelaMaxima`.
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
 * Traduz o `code` em AÇÃO, como segundo parágrafo — nunca reescreve a mensagem
 * do servidor. `null` para código sem ação conhecida: não inventar conselho.
 *
 * ⚠️ `pluggy_item_disconnected` é a mais importante: nada nesta tela resolve,
 * só o app Meu Pluggy.
 */
export function dicaParaErroPluggy(code: string): string | null {
  if (code === 'pluggy_disabled') {
    return 'Isto NÃO é o banco fora do ar nem conexão caída: os secrets PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET nunca foram configurados neste Worker. Enquanto isso, o import por arquivo (.ofx/.csv) continua funcionando normalmente.'
  }
  if (code === 'pluggy_invalid_credentials') {
    return 'O Pluggy recusou as credenciais DESTE APLICATIVO — não tem a ver com a sua conexão bancária, e repetir não resolve. Confira PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.'
  }
  if (code === 'pluggy_aguardando_autorizacao') {
    return 'Não é conexão caída: ela existe e está esperando VOCÊ terminar de autorizar. Volte na aba que abriu e conclua o acesso. Se ela já fechou ou expirou, toque em conectar de novo para gerar um link novo — o anterior é de uso único e não funciona duas vezes.'
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

/**
 * Fatia ⑤ (o app conecta sozinho) — o que a tela precisa saber sobre
 * CRIAR a conexão e LISTAR as contas dela, agora que o dono não cola mais
 * `item_id`/`account_id` à mão (os dois eram impossíveis de obter pela
 * interface do Pluggy: o primeiro só no dashboard, o segundo só por `curl`).
 */

/**
 * Espelha `POST /api/pluggy/connect`.
 *
 * ⚠️ `authorize_url` é de uso único e expira — a tela não pode guardá-la.
 */
export type PluggyConectarView = {
  item_id: string
  status: string
  execution_status: string
  authorize_url: string | null
}

/**
 * Uma conta dentro da conexão.
 *
 * ⚠️ `type` não é união fechada: tipo desconhecido tem que ser EXIBIDO, nunca
 * sumir do `<select>` nem quebrar a tela.
 */
export type PluggyContaView = {
  id: string
  type: string
  subtype?: string
  name?: string
  number?: string
}

/** Espelha a resposta de `GET /api/pluggy/accounts`. */
export type PluggyContasView = {
  item_id: string
  contas: PluggyContaView[]
}

/**
 * Cria a conexão (conector 200) e devolve o item com a URL a autorizar.
 *
 * ⚠️ LANÇA quando falha: um "conectei" mudo deixaria o dono esperando uma aba
 * que nunca abre.
 */
export async function conectarPluggy(): Promise<PluggyConectarView> {
  return api<PluggyConectarView>('/api/pluggy/connect', { method: 'POST' })
}

/**
 * As contas da conexão. Sem `itemId`, o servidor usa o salvo em `settings`.
 *
 * ⚠️ LANÇA quando falha: `pluggy_aguardando_autorizacao` e
 * `pluggy_item_disconnected` mandam o dono a lados opostos, e devolver lista
 * vazia diria "não tenho conta nenhuma" — falso nos dois casos.
 */
export async function contasPluggy(itemId?: string): Promise<PluggyContasView> {
  const query = itemId ? `?item_id=${encodeURIComponent(itemId)}` : ''
  return api<PluggyContasView>(`/api/pluggy/accounts${query}`)
}

/**
 * Rótulo da conta no `<option>`. Pura.
 *
 * ⚠️ Tipo desconhecido devolve o `type` CRU: achatar num rótulo genérico
 * tornaria duas contas indistinguíveis no mesmo `<select>`.
 */
export function rotuloDeConta(conta: PluggyContaView): string {
  const tipo =
    conta.type === 'BANK'
      ? 'Conta corrente'
      : conta.type === 'CREDIT'
        ? 'Cartão'
        : conta.type

  return [tipo, conta.name, conta.number].filter(Boolean).join(' · ')
}

/**
 * Avisa quando a conta do app e a do banco têm naturezas incompatíveis.
 *
 * ⚠️ AVISO, nunca bloqueio: `kind` e `type` não descrevem a intenção do dono.
 * O caso que dói é `CREDIT` fora de `credit_card` — só ela preenche
 * `bill_competence`, que é derivado e não é patchável.
 */
export function avisoDeTipoDeConta(
  kindDoApp: string,
  typeDoPluggy: string,
): string | null {
  if (typeDoPluggy === 'CREDIT' && kindDoApp !== 'credit_card') {
    return 'Atenção: no banco isto é um CARTÃO DE CRÉDITO, mas a conta do app que vai receber não é do tipo cartão. A fatura entraria sem competência, e competência não dá pra corrigir depois — só apagando e reimportando. Se for mesmo um cartão, crie uma conta de cartão no app antes.'
  }
  if (typeDoPluggy === 'BANK' && kindDoApp === 'credit_card') {
    return 'Atenção: no banco isto é uma CONTA CORRENTE, mas a conta do app que vai receber é um cartão de crédito. O extrato entraria como se fossem compras de fatura.'
  }
  return null
}

/** Uma conta do app que já tem conexão salva — um item da fila do lote. */
export type ContaConectada = {
  accountId: string
  nome: string
  conexao: ConexaoPluggy
}

/**
 * Quais contas do app já têm conexão salva, na ordem recebida.
 *
 * Uma leitura por conta: nenhuma rota lista `settings` por prefixo. Conta que
 * falha fica de fora da fila sem derrubar as outras.
 */
export async function conexoesPluggy(
  contas: Array<{ id: string; name: string }>,
): Promise<ContaConectada[]> {
  const pares = await Promise.all(
    contas.map(async (c) => ({
      accountId: c.id,
      nome: c.name,
      conexao: await conexaoPluggy(c.id),
    })),
  )
  return pares.filter((p): p is ContaConectada => p.conexao !== null)
}

/**
 * A janela máxima que o Pluggy guarda: 12 meses.
 *
 * ⚠️ NÃO é o default — `janelaPadrao` segue em um mês e o servidor não tem
 * default nenhum. É escolha explícita do dono, certa na carga inicial de conta
 * vazia. Ver "janelaMaxima" no CLAUDE.md.
 */
export function janelaMaxima(hoje: string): { de: string; ate: string } {
  const ano = Number(hoje.slice(0, 4))
  const mes = Number(hoje.slice(5, 7))
  const dia = Number(hoje.slice(8, 10))

  // Mesmo aparo de `janelaPadrao`: dia 0 do mês seguinte = último dia do mês
  // pedido, então 29/02 num ano bissexto vira 28/02 no ano anterior.
  const ultimoDia = new Date(Date.UTC(ano - 1, mes, 0)).getUTCDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    de: `${ano - 1}-${pad(mes)}-${pad(Math.min(dia, ultimoDia))}`,
    ate: hoje,
  }
}
