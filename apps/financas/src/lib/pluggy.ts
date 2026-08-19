/**
 * Cliente HTTP do Pluggy — a camada que fala com `api.pluggy.ai` e mais
 * nada. Não escreve no D1, não mapeia pro schema, não decide política de
 * import.
 *
 * ⚠️ **Cópia do DESENHO de `src/lib/promeia.ts`**, não do código: `fetch`
 * injetado, timeout, classes de erro separadas **por CAUSA** (nunca por
 * status), e credencial fora de toda mensagem de erro. As divergências em
 * relação ao promeia estão marcadas uma a uma abaixo — cada uma tem motivo,
 * nenhuma é descuido.
 *
 * ⚠️ **A CREDENCIAL NÃO PODE ENCOSTAR NO D1, e a razão é concreta:**
 * `scripts/backup-d1.sh` exporta o banco INTEIRO às 03:00 e guarda **30
 * cópias em texto claro** em `~/Backups/financas/` (ver CLAUDE.md § _Backup
 * do D1_). Rotacionar a chave no Pluggy depois não apagaria as que já foram
 * gravadas. Por isso:
 *
 * | O quê                                    | Onde mora                                    |
 * | ---------------------------------------- | -------------------------------------------- |
 * | `PLUGGY_CLIENT_ID` / `PLUGGY_CLIENT_SECRET` | **secret do Worker** (`wrangler secret put`) |
 * | `apiKey` de 2 h (`POST /auth`)           | **memória do isolate**, `WeakMap` (①)        |
 * | `itemId` / `accountId`                   | `settings` — NÃO são credencial              |
 *
 * `itemId`/`accountId` de propósito **não** são lidos aqui: são dado de
 * configuração (`getSetting`/`setSetting`, `src/domain/settings.ts`), e
 * misturá-los faria este arquivo depender de `D1Database` só pra descobrir
 * pra quem ligar. Quem chama passa os ids; este módulo só fala HTTP.
 *
 * ⚠️ **DUAS ARMADILHAS que este arquivo DELIBERADAMENTE não resolve** — ver
 * `PluggyTransacao` abaixo, onde os dois campos perigosos estão marcados. O
 * resumo: `amount` tem a convenção de sinal OPOSTA à deste schema, e `date`
 * vem em UTC num app que é `purchase_date`-cêntrico em GMT-3. As duas
 * conversões pertencem à fatia do MAPEADOR, com uma resposta real capturada
 * na mão — encodar aqui uma regra que só li na documentação faria uma
 * suposição parecer medida, e o custo de errar é 12 meses de dado com sinal
 * ou mês trocado, que `uq_tx_imported` impede de reimportar por cima.
 */
import { isRealCalendarDate } from './dates'

/** Host fixo do Pluggy. Não é binding: não varia por ambiente, e um secret a menos é um secret a menos pra esquecer no deploy. */
export const PLUGGY_BASE_URL = 'https://api.pluggy.ai'

/** Bindings que ligam este módulo. **Secrets**, nunca `vars` do wrangler.jsonc. */
export type PluggyBindings = {
  PLUGGY_CLIENT_ID?: string
  PLUGGY_CLIENT_SECRET?: string
}

export type PluggyConfig = {
  clientId: string
  clientSecret: string
}

/**
 * Timeout por chamada. Generoso, mas **não é o `TIMEOUT_MS` do promeia**: lá
 * o valor cobre uma rodada de modelo local (20-33 s medidos) e existe uma
 * janela CURTA deliberada por cima (`PromeiaDemorou` é resultado normal).
 * Aqui não há janela curta nenhuma — o Pluggy é uma API HTTP comum, então
 * estourar 30 s **é falha**, e cai em `PluggyInalcancavel` junto com DNS e
 * conexão recusada (a ação do dono é a mesma: tentar de novo mais tarde).
 */
export const TIMEOUT_MS = 30_000

/**
 * Validade da apiKey devolvida por `POST /auth`: **2 h** (fato medido, ver
 * CLAUDE.md). ⚠️ O corpo do `/auth` **não** carrega a expiração — ela é
 * calculada AQUI, a partir deste valor. Se a doc estiver desatualizada ou o
 * relógio do isolate divergir, a rede de segurança é o retry de 401 em
 * `pedirAutenticado` (renova UMA vez e repete), não este número.
 */
export const VALIDADE_API_KEY_MS = 2 * 60 * 60 * 1000

/**
 * Renova com folga em vez de esperar o vencimento exato: uma chave que
 * expira NO MEIO de uma paginação de 40 páginas custaria um 401 + re-auth no
 * meio do laço. 5 min cobre qualquer paginação real.
 */
export const MARGEM_RENOVACAO_MS = 5 * 60 * 1000

/** Teto de página do próprio Pluggy (fato medido). */
export const PAGE_SIZE = 500

/**
 * ⚠️ **Teto de páginas por INVOCAÇÃO, e o número sai de uma restrição da
 * plataforma, não de gosto: o plano free do Workers permite 50 subrequests
 * por invocação.** 1 `POST /auth` + 1 `GET /items/:id` + N páginas precisa
 * caber nos 50. 40 páginas = 20 000 lançamentos, muito além de 12 meses de
 * uso pessoal, e ainda deixa 8 subrequests de folga.
 *
 * Estourar o teto **lança** (`RangeError`, que a rota já traduz em 422 com
 * mensagem legível) em vez de truncar em silêncio: devolver 20 000 de 30 000
 * linhas sem avisar seria uma falha com cara de sucesso — exatamente a
 * classe de defeito que este módulo caça em toda fatia.
 */
export const MAX_PAGINAS = 40

/** `Retry-After: 60` é o que o Pluggy manda no 429 (medido). Usado só quando o header vem ausente/ilegível. */
export const RETRY_AFTER_PADRAO_S = 60

/** Trecho de corpo guardado pra log em `PluggyRespostaIlegivel`. */
const AMOSTRA_MAX = 200

/**
 * ⚠️ Substitui a amostra do corpo de `POST /auth`. **Nunca remover:** a
 * resposta desse endpoint CARREGA a apiKey, e `PluggyRespostaIlegivel.amostra`
 * existe pra ir pro log. Sem esta troca, um `/auth` que respondesse 200 com
 * um shape inesperado gravaria a chave em texto claro no `wrangler tail` —
 * a mesma classe de vazamento que a regra "token fora de toda mensagem de
 * erro" existe pra impedir, só que pela porta dos fundos.
 */
export const AMOSTRA_OMITIDA = '<corpo do /auth omitido: carrega a apiKey>'

// ---------------------------------------------------------------------------
// Erros — um por CAUSA, porque cada um manda o dono para um lugar DIFERENTE.
//
// | Classe                    | O que o dono tem que fazer                        |
// | ------------------------- | ------------------------------------------------- |
// | PluggyDesligado           | nada quebrou — configure os secrets se quiser usar |
// | PluggyCredencialInvalida  | corrigir PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET   |
// | PluggyTokenExpirado       | (raro) reportar — NÃO é a credencial               |
// | PluggyRateLimitado        | esperar N segundos e tentar de novo                |
// | PluggyInalcancavel        | tentar mais tarde — o problema é do outro lado     |
// | PluggyItemDesconectado    | **reconectar a conta no app Meu Pluggy**           |
// | PluggyRespostaIlegivel    | (raro) reportar — alguém respondeu e não entendi   |
// ---------------------------------------------------------------------------

/**
 * Os secrets não estão configurados. **Não é falha** — espelha
 * `promeiaConfigurado()`: a rota chama `pluggyConfigurado(env)` e responde
 * `503 pluggy_disabled` ANTES de chegar aqui.
 *
 * ⚠️ Esta classe é a rede pra quem esquecer esse guard. Sem ela, um `/auth`
 * com credencial vazia voltaria 401/403 e sairia como
 * `PluggyCredencialInvalida` — mandando o dono CORRIGIR uma credencial que
 * ele nunca configurou. Duas causas diferentes, mensagens diferentes.
 */
export class PluggyDesligado extends Error {
  constructor() {
    super(MSG_DESLIGADO)
    this.name = 'PluggyDesligado'
  }
}

/** `POST /auth` recusou o par clientId/clientSecret. Não adianta repetir. */
export class PluggyCredencialInvalida extends Error {
  constructor() {
    super(MSG_CREDENCIAL_INVALIDA)
    this.name = 'PluggyCredencialInvalida'
  }
}

/**
 * A apiKey de 2 h foi recusada **mesmo depois de renovar**.
 *
 * ⚠️ A mensagem afirma o que está PROVADO e nada além: como a renovação
 * passou pelo `/auth` com sucesso, a credencial está boa — então isto NÃO é
 * caso de mexer nos secrets. Chutar a causa aqui mandaria o dono trocar uma
 * chave que está certa.
 */
export class PluggyTokenExpirado extends Error {
  readonly status: number
  constructor(status: number) {
    super(
      `o Pluggy recusou a chave (HTTP ${status}) mesmo depois de renová-la — ` +
        'a credencial está boa (o /auth passou), o problema é nesta requisição',
    )
    this.name = 'PluggyTokenExpirado'
    this.status = status
  }
}

/**
 * `429`. Carrega os segundos do `Retry-After` porque é o único número que
 * torna a mensagem acionável ("espere 60 s", não "tente mais tarde").
 *
 * ⚠️ **Não existe backoff automático aqui, de propósito.** Dormir 60 s
 * dentro de um Worker gasta wall time de uma invocação que tem teto, e quem
 * chama pode preferir parar e retomar depois (a paginação é retomável — ver
 * `paginasDeTransacoes`). O cliente devolve o número; a decisão é de quem
 * chama.
 */
export class PluggyRateLimitado extends Error {
  readonly retryAfterSegundos: number
  constructor(retryAfterSegundos: number) {
    super(
      `o Pluggy limitou a taxa de requisições — tente de novo em ${retryAfterSegundos} s`,
    )
    this.name = 'PluggyRateLimitado'
    this.retryAfterSegundos = retryAfterSegundos
  }
}

/**
 * Não alcancei o Pluggy: DNS, conexão recusada, timeout, ou 5xx do lado
 * deles. **As duas situações viram UMA classe de propósito** — "não
 * respondeu" e "respondeu 502" mandam o dono para o MESMO lugar (esperar e
 * tentar de novo), e quebrar em duas classes só multiplicaria caminhos sem
 * mudar nenhuma ação. `status` é `null` quando ninguém respondeu.
 */
export class PluggyInalcancavel extends Error {
  readonly status: number | null
  constructor(status: number | null = null) {
    super(
      status === null
        ? 'não consegui falar com o Pluggy (rede, DNS ou tempo esgotado) — tente de novo mais tarde'
        : `o Pluggy respondeu HTTP ${status} (erro do lado deles) — tente de novo mais tarde`,
    )
    this.name = 'PluggyInalcancavel'
    this.status = status
  }
}

/**
 * ⚠️ **O erro MAIS IMPORTANTE deste arquivo na prática, e o mais fácil de
 * achatar num "deu erro" genérico.** O banco pediu re-autenticação: nada
 * aqui — nem repetir, nem trocar secret, nem esperar — resolve. O dono tem
 * que **abrir o app Meu Pluggy e reconectar a conta**, e a mensagem diz
 * isso com essas palavras.
 *
 * `status`/`executionStatus` viajam junto porque a tela precisa poder
 * mostrar QUAL estado o item reportou sem ter que consultar de novo.
 */
export class PluggyItemDesconectado extends Error {
  readonly itemId: string
  readonly status: string
  readonly executionStatus: string | null

  constructor(itemId: string, status: string, executionStatus: string | null) {
    super(
      'a conexão com o banco caiu e o Pluggy está pedindo autenticação de novo. ' +
        'Abra o app Meu Pluggy e reconecte esta conta — não adianta tentar de ' +
        `novo por aqui (estado reportado: ${status}` +
        (executionStatus === null ? '' : ` / ${executionStatus}`) +
        ').',
    )
    this.name = 'PluggyItemDesconectado'
    this.itemId = itemId
    this.status = status
    this.executionStatus = executionStatus
  }
}

/**
 * Alguém respondeu e o corpo não é o que o Pluggy promete. Mesma lição
 * medida do promeia: **"não respondeu" e "respondeu e eu não entendi" mandam
 * o dono para lados OPOSTOS**, então colapsá-las num tipo só é o próprio
 * bug. Aqui isso sobra para: 2xx com corpo que não é objeto JSON, corpo
 * ilegível, e 4xx fora de 401/403/429.
 */
export class PluggyRespostaIlegivel extends Error {
  readonly status: number
  readonly amostra: string

  constructor(status: number, amostra: string) {
    super(
      `o Pluggy respondeu HTTP ${status} num formato que não reconheço — ` +
        'alguém do outro lado respondeu, então isto NÃO é "o Pluggy está fora"',
    )
    this.name = 'PluggyRespostaIlegivel'
    this.status = status
    this.amostra = amostra
  }
}

/**
 * Textos FIXOS — nunca montados a partir da URL, do erro cru, do request ou
 * de qualquer coisa que tenha encostado em `clientSecret`/`apiKey`.
 */
export const MSG_DESLIGADO =
  'A sincronização com o Pluggy está desligada: os secrets PLUGGY_CLIENT_ID ' +
  'e PLUGGY_CLIENT_SECRET não foram configurados neste Worker.'

export const MSG_CREDENCIAL_INVALIDA =
  'O Pluggy recusou as credenciais deste aplicativo. Confira PLUGGY_CLIENT_ID ' +
  'e PLUGGY_CLIENT_SECRET (wrangler secret put) — repetir não resolve.'

// ---------------------------------------------------------------------------
// Tipos do fio. Nomes de campo em inglês, IGUAIS aos do Pluggy, de propósito:
// é o que permite comparar uma resposta real com a documentação sem tradução
// no meio.
// ---------------------------------------------------------------------------

export type PluggyTransacao = {
  /** UUID do Pluggy. Serve DIRETO como `transactions.imported_id` (`uq_tx_imported`). */
  id: string
  description: string
  descriptionRaw?: string | null

  /**
   * ⚠️⚠️ **ARMADILHA ①, SINAL INVERTIDO — não converter sem medir.** A
   * documentação do Pluggy diz *"positive amounts indicate debits"*, ou
   * seja, o OPOSTO da convenção deste schema (negativo = saída). Consequência
   * se alguém fizer `Math.round(amount * 100)` direto: `accountBalances()`
   * erra por **2×**, `byCategory()` (que filtra `amount_cents < 0`) perde a
   * despesa inteira, e `CHECK (amount_cents <> 0)` aceita numa boa — o banco
   * não tem como reclamar de um sinal.
   *
   * **Este cliente NÃO converte, e isso é decisão, não omissão:** a regra
   * acima é DOCUMENTAÇÃO, não medição contra uma resposta real (a tabela de
   * fatos medidos deste projeto não a inclui). Encodar aqui uma conversão
   * testada faria uma suposição parecer verificada — e o desfazer, se
   * estiver errada, não é reimportar por cima: `uq_tx_imported` bloqueia, e
   * a saída seria `DELETE ... WHERE import_source='pluggy'` ou Time Travel
   * (que restaura o banco INTEIRO).
   *
   * A conversão pertence ao mapeador, num lugar só, escrita contra uma
   * resposta real capturada à mão.
   */
  amount: number

  /**
   * ⚠️⚠️ **ARMADILHA ②, DATA EM UTC — não cortar `slice(0, 10)`.** Este app é
   * `purchase_date`-cêntrico em **GMT-3**: uma compra depois das 21h local
   * cai no dia seguinte em UTC e **propaga pro `bill_competence`**, que é
   * campo derivado e **não é patchável** (`PATCH /api/transactions/:id`
   * recusa com `protected_field`). Seria a **5ª vez** que este projeto paga
   * essa classe de bug. O precedente de conversão já existe e tem dono:
   * `src/domain/cashflow.ts#localCompetence` (que reusa `todayInTeresina`).
   *
   * Mesma decisão da armadilha ①: o cliente entrega o valor do fio, o
   * mapeador converte.
   */
  date: string

  currencyCode?: string
  /** Sempre `null` no plano free (medido) — a categorização vem das `rules`. */
  category?: string | null

  /**
   * `DEBIT` (saiu dinheiro) ou `CREDIT` (entrou).
   *
   * ⚠️ **É ELE que resolve a armadilha ① acima, não o sinal de `amount`** — o
   * sinal de `amount` muda de significado conforme o TIPO DA CONTA (positivo é
   * débito no cartão, mas despesa é negativa na conta corrente), enquanto
   * `type` descreve o FLUXO e vale igual nos dois. Ver
   * `src/domain/pluggy-map.ts#sinalDe`, onde a conversão de fato mora.
   */
  type?: string

  /**
   * `POSTED` (liquidada na instituição) ou `PENDING`.
   *
   * ⚠️ Num CARTÃO, `PENDING` é a **fatura aberta inteira**, não só a compra
   * instável de hoje — ver `src/domain/pluggy-map.ts#STATUS_IMPORTAVEL`, que
   * documenta a decisão de importar só `POSTED` e as citações da doc.
   */
  status?: string

  balance?: number | null
}

/** Envelope de paginação do Pluggy, verbatim. */
export type PaginaDeTransacoes = {
  results: PluggyTransacao[]
  page: number
  total: number
  totalPages: number
}

export type PluggyItem = {
  id: string
  status: string
  executionStatus?: string | null
  connector?: { id?: number; name?: string } | null
}

/**
 * Estados que significam "o banco quer que o dono autentique de novo".
 *
 * ⚠️ **Vêm da documentação do Pluggy, NÃO de medição contra a conta do
 * dono** — e é por isso que a checagem é uma ALLOWLIST em vez de "tudo que
 * não é UPDATED". Um estado desconhecido (ou um estado novo que o Pluggy
 * criar amanhã) NÃO vira "reconecte": mandar o dono refazer uma conexão que
 * está de pé desperdiça o tempo dele arrumando o que já está certo — a mesma
 * regra que o cliente do promeia aprendeu na marra. O estado cru fica
 * disponível em `PluggyItem.status` pra quem quiser mostrá-lo.
 */
const STATUS_PRECISA_RECONECTAR = new Set(['LOGIN_ERROR', 'WAITING_USER_INPUT'])

const EXECUTION_PRECISA_RECONECTAR = new Set([
  'LOGIN_ERROR',
  'INVALID_CREDENTIALS',
  'INVALID_CREDENTIALS_MFA',
  'ACCOUNT_LOCKED',
  'USER_INPUT_TIMEOUT',
])

export type PluggyOpts = {
  /** ⚠️ Sempre injetado nos testes — NENHUM teste deste módulo toca a rede. */
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /** Relógio injetável (mesma disciplina de `todayInTeresina(now?)`): mock de `Date` global vaza entre testes. */
  agora?: () => number
}

// ---------------------------------------------------------------------------
// ① apiKey memoizada POR ISOLATE — nunca persistida
// ---------------------------------------------------------------------------

type Sessao = { apiKey: string; expiraEm: number }

/**
 * ⚠️ **`WeakMap` chaveado pelo objeto `env`, nunca uma variável solta** —
 * mesmo padrão (e mesmo motivo) de `getAuth` em `src/lib/auth.ts`: o `env`
 * tem identidade estável entre requests do mesmo isolate, e um `WeakMap`
 * impede que o `env` sintético de um teste envenene a instância de outro.
 *
 * ⚠️ Guarda a **Promise**, não a `Sessao` resolvida: duas requisições
 * concorrentes no mesmo isolate compartilham UM `POST /auth` em vez de
 * disparar dois (o teto de `PATCH /items` é 20/min — desperdiçar chamada de
 * auth por corrida é gastar cota à toa). A entrada é removida quando a
 * promise rejeita, senão o isolate ficaria com uma falha memoizada para
 * sempre.
 */
const sessoes = new WeakMap<PluggyBindings, Promise<Sessao>>()

/**
 * O recurso está configurado? Sem os dois secrets a feature está
 * **DESLIGADA**, não quebrada — a rota responde `503 pluggy_disabled` e nada
 * mais no módulo muda. Espelha `promeiaConfigurado()` byte a byte no
 * espírito: credencial ausente nunca é erro de execução.
 */
export function pluggyConfigurado(env: PluggyBindings): PluggyConfig | null {
  const clientId = (env.PLUGGY_CLIENT_ID ?? '').trim()
  const clientSecret = (env.PLUGGY_CLIENT_SECRET ?? '').trim()
  if (clientId === '' || clientSecret === '') return null
  return { clientId, clientSecret }
}

/**
 * Devolve uma apiKey válida, reusando a do isolate enquanto ela tiver mais
 * de `MARGEM_RENOVACAO_MS` de vida.
 */
export async function autenticar(
  env: PluggyBindings,
  opts: PluggyOpts = {},
): Promise<string> {
  const agora = (opts.agora ?? Date.now)()

  const emVoo = sessoes.get(env)
  if (emVoo) {
    // `.catch` aqui só evita que a rejeição de OUTRA chamada vire a nossa —
    // quem falhou já propagou o erro pra quem a disparou. Nós reautenticamos.
    const sessao = await emVoo.catch(() => null)
    if (sessao !== null && sessao.expiraEm - MARGEM_RENOVACAO_MS > agora) {
      return sessao.apiKey
    }
    if (sessoes.get(env) === emVoo) sessoes.delete(env)
  }

  const nova = autenticarDeVerdade(env, opts)
  sessoes.set(env, nova)
  try {
    return (await nova).apiKey
  } catch (err) {
    // Só apaga se ainda for a NOSSA promise: outra chamada pode já ter
    // colocado uma tentativa nova no lugar.
    if (sessoes.get(env) === nova) sessoes.delete(env)
    throw err
  }
}

/**
 * Esquece a apiKey memoizada deste isolate. Usada pelo retry de 401 e
 * exposta porque uma rota que receba `PluggyTokenExpirado` pode querer
 * forçar a renovação na próxima tentativa.
 */
export function esquecerApiKey(env: PluggyBindings): void {
  sessoes.delete(env)
}

async function autenticarDeVerdade(
  env: PluggyBindings,
  opts: PluggyOpts,
): Promise<Sessao> {
  const cfg = pluggyConfigurado(env)
  if (cfg === null) throw new PluggyDesligado()

  const lida = await pedir(
    `${PLUGGY_BASE_URL}/auth`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // ⚠️ O clientSecret vive AQUI e em lugar nenhum mais: não vai pra URL
      // (query string entra em log de proxy), não vai pra header custom, e
      // nenhuma mensagem de erro deste arquivo é construída a partir de
      // `init`.
      body: JSON.stringify({
        clientId: cfg.clientId,
        clientSecret: cfg.clientSecret,
      }),
    },
    opts,
    // Amostra suprimida: a resposta deste endpoint carrega a apiKey.
    true,
  )

  if (lida.status === 429) throw new PluggyRateLimitado(retryAfter(lida))
  if (lida.status === 401 || lida.status === 403) {
    throw new PluggyCredencialInvalida()
  }
  if (lida.status >= 500) throw new PluggyInalcancavel(lida.status)

  const apiKey =
    lida.json !== null && typeof lida.json.apiKey === 'string'
      ? lida.json.apiKey.trim()
      : ''

  if (lida.status !== 200 || apiKey === '') {
    throw new PluggyRespostaIlegivel(lida.status, lida.amostra)
  }

  const agora = (opts.agora ?? Date.now)()
  return { apiKey, expiraEm: agora + VALIDADE_API_KEY_MS }
}

// ---------------------------------------------------------------------------
// ② Item — a checagem que decide entre "sincronizar" e "reconecte no app"
// ---------------------------------------------------------------------------

export async function buscarItem(
  env: PluggyBindings,
  itemId: string,
  opts: PluggyOpts = {},
): Promise<PluggyItem> {
  const id = itemId.trim()
  if (id === '') throw new RangeError('itemId é obrigatório')

  const lida = await pedirAutenticado(
    `${PLUGGY_BASE_URL}/items/${encodeURIComponent(id)}`,
    env,
    opts,
  )
  garantirOk(lida)

  const json = lida.json as Record<string, unknown>
  if (typeof json.id !== 'string' || typeof json.status !== 'string') {
    throw new PluggyRespostaIlegivel(lida.status, lida.amostra)
  }
  return json as unknown as PluggyItem
}

/** Puro, sem HTTP — testável sozinho. Ver `STATUS_PRECISA_RECONECTAR` pro porquê da allowlist. */
export function precisaReconectar(item: PluggyItem): boolean {
  const exec = item.executionStatus ?? null
  return (
    STATUS_PRECISA_RECONECTAR.has(item.status) ||
    (exec !== null && EXECUTION_PRECISA_RECONECTAR.has(exec))
  )
}

/**
 * Lança `PluggyItemDesconectado` quando o item precisa de re-autenticação.
 *
 * Puro e separado de `buscarItem` de propósito — mesmo precedente de
 * `assertEmailPermitido` (`src/lib/auth.ts`): a busca devolve o fato, a
 * asserção aplica a política. Um fluxo de leitura que só quer INSPECIONAR o
 * estado usa `buscarItem` sozinho; o fluxo de sincronização chama os dois.
 */
export function assertItemConectado(item: PluggyItem): void {
  if (precisaReconectar(item)) {
    throw new PluggyItemDesconectado(
      item.id,
      item.status,
      item.executionStatus ?? null,
    )
  }
}

// ---------------------------------------------------------------------------
// ③ Transações — PÁGINA A PÁGINA, nunca "busca tudo"
// ---------------------------------------------------------------------------

export type FiltroTransacoes = {
  accountId: string
  /** `YYYY-MM-DD`. O Pluggy guarda **12 meses** (medido). */
  from?: string
  to?: string
}

/**
 * Uma página. É o primitivo — `paginasDeTransacoes` é construída em cima
 * dele, e quem precisar de controle fino (retomar da página 7 numa segunda
 * invocação do Worker) chama esta aqui direto.
 */
export async function buscarPaginaDeTransacoes(
  env: PluggyBindings,
  filtro: FiltroTransacoes & { page?: number },
  opts: PluggyOpts = {},
): Promise<PaginaDeTransacoes> {
  const accountId = filtro.accountId.trim()
  if (accountId === '') throw new RangeError('accountId é obrigatório')

  const page = filtro.page ?? 1
  if (!Number.isInteger(page) || page < 1) {
    throw new RangeError(
      `page inválida: ${String(filtro.page)} (esperado inteiro >= 1)`,
    )
  }

  // Validação de calendário ANTES de gastar um subrequest, com a MESMA
  // função do resto do módulo (`lib/dates.ts`) — nunca uma segunda regra:
  // um regex de formato aceitaria '2026-02-30', e o filtro sairia mudo.
  const params = new URLSearchParams({
    accountId,
    page: String(page),
    pageSize: String(PAGE_SIZE),
  })
  if (filtro.from !== undefined) {
    if (!isRealCalendarDate(filtro.from)) {
      throw new RangeError(
        `from inválido: ${filtro.from} (esperado YYYY-MM-DD real)`,
      )
    }
    params.set('from', filtro.from)
  }
  if (filtro.to !== undefined) {
    if (!isRealCalendarDate(filtro.to)) {
      throw new RangeError(
        `to inválido: ${filtro.to} (esperado YYYY-MM-DD real)`,
      )
    }
    params.set('to', filtro.to)
  }

  const lida = await pedirAutenticado(
    `${PLUGGY_BASE_URL}/transactions?${params.toString()}`,
    env,
    opts,
  )
  garantirOk(lida)

  const json = lida.json as Record<string, unknown>
  if (!Array.isArray(json.results)) {
    throw new PluggyRespostaIlegivel(lida.status, lida.amostra)
  }

  return {
    results: json.results as PluggyTransacao[],
    page: numero(json.page, page),
    total: numero(json.total, (json.results as unknown[]).length),
    totalPages: numero(json.totalPages, 1),
  }
}

/**
 * ⚠️ **DECISÃO (②): página a página, e NÃO existe um `buscarTodas()` — a
 * ausência é o ponto.** Três razões, nesta ordem de peso:
 *
 * 1. **50 subrequests por invocação no plano free do Workers.** Uma função
 *    "busca tudo" promete algo que a plataforma pode não deixar entregar: 12
 *    meses de um cartão movimentado passam de 40 páginas e a invocação MORRE
 *    no meio — pior que devolver menos, porque não sobra nem o que já veio.
 *    Página a página, quem chama grava cada lote e retoma numa invocação
 *    seguinte (`buscarPaginaDeTransacoes` aceita `page`).
 * 2. **Teto de 10 ms de CPU por invocação no free tier.** Materializar
 *    milhares de objetos e só então entregá-los concentra parse e alocação
 *    num pico; consumir lote a lote intercala com a espera de rede.
 * 3. **Quem chama já trabalha em lote e sabe parar antes.** `importTransactions`
 *    (`src/domain/import.ts`) escreve 5 linhas por statement e faz dedupe por
 *    `(account_id, imported_id)` em aplicação — com o gerador, uma página
 *    inteira já conhecida encerra a varredura em vez de pagar as outras 39.
 *
 * ⚠️ **Um servidor que ignorasse `page` e devolvesse sempre a mesma página
 * NÃO corrompe nada** e por isso não há checagem de eco: o dedupe por
 * `imported_id` do import descarta a repetição, e o `MAX_PAGINAS` limita o
 * desperdício. Inventar aqui uma segunda validação seria proteger contra o
 * que já tem dono.
 */
export async function* paginasDeTransacoes(
  env: PluggyBindings,
  filtro: FiltroTransacoes,
  opts: PluggyOpts = {},
): AsyncGenerator<PluggyTransacao[], void, undefined> {
  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const pagina = await buscarPaginaDeTransacoes(
      env,
      { ...filtro, page },
      opts,
    )

    if (pagina.results.length > 0) yield pagina.results

    if (page >= pagina.totalPages) return
    // Página vazia com `totalPages` prometendo mais: o servidor se
    // contradisse. Parar é o certo — insistir só gastaria subrequest.
    if (pagina.results.length === 0) return

    if (page === MAX_PAGINAS) {
      throw new RangeError(
        `o Pluggy reportou ${pagina.totalPages} páginas e o teto por execução é ${MAX_PAGINAS} ` +
          `(${MAX_PAGINAS * PAGE_SIZE} lançamentos) — busque um intervalo menor com from/to`,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Transporte
// ---------------------------------------------------------------------------

type Lida = {
  status: number
  ok: boolean
  json: Record<string, unknown> | null
  amostra: string
  headers: Headers | null
}

/**
 * `GET` autenticado, com **UMA** renovação automática quando o Pluggy recusa
 * a chave.
 *
 * ⚠️ O retry existe porque a expiração de 2 h é calculada localmente (ver
 * `VALIDADE_API_KEY_MS`) — se essa conta estiver errada, o 401 é o único
 * sinal verdadeiro. **Uma vez só**: se a chave RECÉM-EMITIDA também for
 * recusada, repetir vira laço e queima cota; a segunda recusa sai como
 * `PluggyTokenExpirado`, que afirma exatamente o que ficou provado (a
 * credencial está boa — o `/auth` acabou de passar).
 */
async function pedirAutenticado(
  url: string,
  env: PluggyBindings,
  opts: PluggyOpts,
  jaRenovou = false,
): Promise<Lida> {
  const apiKey = await autenticar(env, opts)
  const lida = await pedir(
    url,
    {
      method: 'GET',
      headers: { 'X-API-KEY': apiKey, accept: 'application/json' },
    },
    opts,
  )

  if ((lida.status === 401 || lida.status === 403) && !jaRenovou) {
    esquecerApiKey(env)
    return pedirAutenticado(url, env, opts, true)
  }
  return lida
}

/** Traduz uma resposta não-2xx de rota autenticada na classe certa. */
function garantirOk(lida: Lida): void {
  if (lida.status === 429) throw new PluggyRateLimitado(retryAfter(lida))
  if (lida.status === 401 || lida.status === 403) {
    throw new PluggyTokenExpirado(lida.status)
  }
  if (lida.status >= 500) throw new PluggyInalcancavel(lida.status)
  if (!lida.ok || lida.json === null) {
    throw new PluggyRespostaIlegivel(lida.status, lida.amostra)
  }
}

function retryAfter(lida: Lida): number {
  const bruto = lida.headers?.get('retry-after') ?? ''
  const n = Number(bruto)
  return Number.isInteger(n) && n > 0 ? n : RETRY_AFTER_PADRAO_S
}

function numero(valor: unknown, padrao: number): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : padrao
}

async function pedir(
  url: string,
  init: RequestInit,
  opts: PluggyOpts,
  sigiloso = false,
): Promise<Lida> {
  const f = opts.fetchImpl ?? fetch
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  let resposta: Response
  try {
    resposta = await f(url, { ...init, signal: controller.signal })
  } catch {
    clearTimeout(timeoutId)
    // Texto FIXO: nem o erro original (que em alguns runtimes ecoa a
    // requisição inteira, headers e body inclusos — e o body do /auth É a
    // credencial) nem a URL entram na mensagem.
    throw new PluggyInalcancavel()
  }

  // ⚠️ `clearTimeout` DEPOIS de ler o corpo, não logo depois do fetch —
  // lição medida em `apps/ramielle/src/lib/publishers/http.ts` e repetida em
  // `promeia.ts`: limpar o timer quando os HEADERS chegam deixa todo
  // `.text()` seguinte SEM limite, e um timeout que o corpo pode furar não é
  // um timeout.
  let bruto: string | null
  try {
    bruto = await resposta.text()
  } catch {
    bruto = null
  } finally {
    clearTimeout(timeoutId)
  }

  if (bruto === null) {
    return {
      status: resposta.status,
      ok: resposta.ok,
      json: null,
      amostra: sigiloso ? AMOSTRA_OMITIDA : '<corpo ilegível>',
      headers: resposta.headers,
    }
  }

  let json: Record<string, unknown> | null = null
  try {
    const parsed: unknown = JSON.parse(bruto)
    // `JSON.parse('5')`/`'null'` são JSON válidos e não são envelope nenhum —
    // sem esta checagem, `json.apiKey` num número lançaria depois.
    json =
      typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null
  } catch {
    json = null
  }

  return {
    status: resposta.status,
    ok: resposta.ok,
    json,
    amostra: sigiloso ? AMOSTRA_OMITIDA : bruto.slice(0, AMOSTRA_MAX),
    headers: resposta.headers,
  }
}
