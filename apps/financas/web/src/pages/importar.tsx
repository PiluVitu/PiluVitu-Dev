import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import type { LinhaImportada } from '@piluvitu/tools/import'
import { parseCsv, type MapaColunas } from '@piluvitu/tools/import/csv'
import { idEstavel } from '@piluvitu/tools/import/id'
import { parseOfx } from '@piluvitu/tools/import/ofx'
import { formatBRL } from '@piluvitu/tools/money'
import type { Regra, RegraAplicada } from '@piluvitu/tools/regras'
import { Ajuda } from '@piluvitu/ui/ajuda'
import { Badge } from '@piluvitu/ui/badge'
import { Button } from '@piluvitu/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import { Input } from '@piluvitu/ui/input'
import { Label } from '@piluvitu/ui/label'
import { api, ApiError } from '../api'
import { isRealCalendarDate, todayInTeresina } from '../lib/dates'
import {
  detectarProvaveis,
  rotuloOrigem,
  type ColisaoProvavel,
  type TxExistente,
} from '../lib/duplicata-provavel'
import {
  CHECKBOX_CLASSNAME,
  FILE_INPUT_CLASSNAME,
  SELECT_CLASSNAME,
} from '../lib/form-classes'
import { mapaSalvo, salvarMapa } from '../lib/import-settings'
import { mutarERecarregar } from '../lib/mutar-e-recarregar'
import { type PayeeParaSugestao } from '../lib/payee-suggest'
import {
  conexaoPluggy,
  dicaParaErroPluggy,
  janelaPadrao,
  salvarConexaoPluggy,
  type ConexaoPluggy,
  type LinhaRejeitadaView,
  type PluggyTransactionsView,
} from '../lib/pluggy'
import { explicarRegras, sugerirParaLinha } from '../lib/regras-import'
import { ALVO_LINK } from '../lib/touch'
import type { AccountView } from './accounts'

/**
 * Tela de import (fatia ②, Tasks 4-5 — spec
 * docs/superpowers/specs/2026-07-27-financas-import-design.md). Duas
 * responsabilidades num arquivo só, porque são o MESMO fluxo contínuo (o
 * brief das duas tasks pede isso explicitamente):
 *
 *  1. Ler o arquivo NO NAVEGADOR (§3 do spec — o Worker nunca vê o
 *     arquivo) e, pra CSV, mapear colunas uma vez por conta/banco.
 *  2. Mostrar a conferência (data/valor/descrição/payee/categoria
 *     sugeridos) antes de mandar qualquer coisa pro servidor — nada é
 *     gravado por adivinhação (§7).
 *
 * ⚠️ **Fatia ④: o Pluggy entrou como TERCEIRA ORIGEM deste MESMO pipeline,
 * ao lado de OFX e CSV — nunca como um caminho paralelo.** `GET
 * /api/pluggy/transactions` devolve `LinhaImportada[]` (o mesmo shape que
 * `parseOfx`/`parseCsv` produzem), `prepararConferencia` ganhou `'pluggy'`
 * como `fonte`, e daí pra frente **tudo já funcionava**: dedup por
 * `imported_id`, sugestão por regra, checkbox por linha, envio em lotes.
 * Zero duplicação de fluxo.
 *
 * ⚠️ **A conferência NÃO é pulável, e não existe sync automático.** Com as
 * duas armadilhas do Pluggy (sinal que depende do tipo da conta; data em
 * UTC contra um app GMT-3 `purchase_date`-cêntrico), conferir linha a
 * linha na primeira vez é a única rede que existe: `uq_tx_imported`
 * impede reimportar por cima, então o desfazer seria
 * `DELETE ... WHERE import_source='pluggy'` ou Time Travel (que restaura o
 * banco INTEIRO).
 */

type PayeeView = PayeeParaSugestao & { kind: string }
type CategoryView = {
  id: string
  name: string
  kind: string
  slug: string | null
}

type LinhaRevisao = {
  imported_id: string
  purchase_date: string
  amount_cents: number
  description: string
  payee_id: string
  category_id: string
  // ⚠️ ATÉ ESTA FATIA, TODA LINHA IMPORTADA NASCIA is_business = 0 —
  // `importTransactions` grava `row.is_business ?? 0` e a tela nunca mandava
  // a chave. Ou seja: a separação PJ/PF, que é a razão de este módulo
  // existir, ficava em branco pra toda fatura importada, e o dono só
  // descobriria conferindo lançamento por lançamento no extrato. É a
  // primeira ação de regra que precisou de um campo novo aqui, e ela tem
  // checkbox próprio por linha porque sugestão continua sendo SUGESTÃO.
  is_business: 0 | 1
  /** Trilha do "por quê" — quais regras casaram, na ordem em que rodaram. */
  regras: RegraAplicada[]
  /** Alguma sugestão apontava pra categoria/favorecido fora da lista. */
  sugestaoDescartada: boolean
  /**
   * Dedupe EXATA: o `imported_id` desta linha já existe nesta conta. Só
   * enxerga a MESMA origem — ver `provavelDuplicata` logo abaixo.
   */
  duplicada: boolean
  /**
   * ⚠️ Dedupe HEURÍSTICA, o que a exata não consegue ver: a linha bate em
   * data (±1 dia) e valor com um lançamento já gravado de OUTRA origem.
   * `null` quando não bate em nada. O critério inteiro, com o lado pro qual
   * ele erra de propósito, mora em `lib/duplicata-provavel.ts` — aqui não
   * se decide nada.
   */
  provavelDuplicata: ColisaoProvavel | null
  marcada: boolean
}

type Passo = 'selecionar' | 'mapear' | 'conferencia' | 'enviando' | 'concluido'

/**
 * As TRÊS origens do mesmo pipeline. `'pluggy'` já era aceito pelo CHECK
 * de `import_source` (`migrations/0001_financas_init.sql:194`) e por
 * `IMPORT_SOURCES` (`src/domain/import.ts`) desde a fatia ② — nenhuma
 * migration foi necessária pra fatia ④, só o caminho que o produz.
 */
type Origem = 'ofx' | 'csv' | 'pluggy'

type ErroPluggy = { code: string; message: string }

/** Um lugar só pro "hoje" local (Teresina, UTC−3), nunca `toISOString()` cru. */
function hoje(): string {
  return todayInTeresina()
}

// Teto de bound params por statement no D1 é problema do SERVIDOR
// (`domain/import.ts` já chunka em 5 linhas/statement dentro de UM
// `db.batch()`) — este número é outra coisa: o tamanho do LOTE que o
// CLIENTE manda por requisição HTTP, pra um extrato de centenas de linhas
// dar progresso visível de verdade em vez de uma única requisição que fica
// pendurada sem feedback até terminar (spec §8: "o import precisa de
// lotes, com o progresso visível").
export const IMPORT_BATCH_SIZE = 40

// `FileReader`, não `Blob.text()` — MEDIDO: o `File` do ambiente de teste
// (jsdom 27, via Vitest) não implementa `Blob.prototype.text()`
// (`typeof file.text === 'undefined'`), só `FileReader.readAsText`.
// `FileReader` também é o caminho universalmente suportado em navegador
// real, então não é uma concessão só pro teste.
function lerArquivoComoTexto(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () =>
      reject(reader.error ?? new Error('Falha ao ler o arquivo'))
    reader.readAsText(arquivo)
  })
}

function tipoArquivo(nome: string): 'ofx' | 'csv' | null {
  const ext = nome.toLowerCase().split('.').pop()
  if (ext === 'ofx' || ext === 'qfx') return 'ofx'
  if (ext === 'csv') return 'csv'
  return null
}

// Só pra PREVIEW da etapa de mapeamento (mostrar as primeiras linhas pro
// dono escolher a coluna) — split ingênuo, sem consciência de aspas. O
// parse de VERDADE usa `parseCsv` (RFC4180-aware) depois que o mapa é
// confirmado; aqui o objetivo é só ajudar a apontar o índice da coluna.
function detectarDelimitadorPreview(linha: string): ',' | ';' {
  const pontoEVirgula = (linha.match(/;/g) ?? []).length
  const virgula = (linha.match(/,/g) ?? []).length
  return pontoEVirgula > virgula ? ';' : ','
}

function amostraCsv(texto: string, n = 5): string[][] {
  const linhas = texto
    .split(/\r\n|\r|\n/)
    .filter((l) => l.trim() !== '')
    .slice(0, n)
  if (linhas.length === 0) return []
  const delim = detectarDelimitadorPreview(linhas[0])
  return linhas.map((l) => l.split(delim))
}

function dataBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size))
  return out
}

// Escape hatch pra forçar uma duplicata (spec §5): reenviar o MESMO
// imported_id faria o próprio dedupe do backend (por account_id+
// imported_id, ver domain/import.ts) pular de novo — a "força" seria um
// no-op silencioso.
//
// ⚠️ O sufixo é LITERAL (':forcado', SEM timestamp/contador em memória) —
// precisa ser DETERMINÍSTICO. Reimportar o MESMO arquivo e forçar a MESMA
// linha de novo (ex.: reimportação acidental do mesmo extrato) tem que
// produzir o MESMO id forçado, pro dedupe do backend reconhecer "isto já
// foi forçado antes" e pular — exatamente como pula qualquer outra
// duplicata. Um sufixo baseado em `Date.now()`/contador de sessão geraria
// um id NOVO a cada força, criando uma terceira, quarta... linha a cada
// reimportação forçada — o oposto do que idempotência significa. Como
// `linha.imported_id` já é o "id natural" desta linha (posição dela dentro
// do arquivo já resolvida em `prepararConferencia`, abaixo), o único dado
// que falta pra tornar o envio único é o próprio fato "isto foi forçado" —
// literal, sem componente variável.
//
// ⚠️ A duplicata PROVÁVEL (heurística, `provavelDuplicata`) NÃO entra
// aqui, de propósito: o id dela não colide com nada no banco — é
// justamente por isso que a heurística existe. Marcá-la de volta manda o
// id natural, e o `:forcado` só serviria pra sujar o `imported_id` de uma
// linha que o backend vai aceitar normalmente.
function idParaEnvio(linha: LinhaRevisao): string {
  return linha.duplicada ? `${linha.imported_id}:forcado` : linha.imported_id
}

async function linhasCsvComId(
  texto: string,
  mapa: MapaColunas,
): Promise<LinhaImportada[]> {
  const linhasCsv = parseCsv(texto, mapa)
  return Promise.all(
    linhasCsv.map(async (l) => ({ ...l, imported_id: await idEstavel(l) })),
  )
}

export function ImportarPage() {
  const [accounts, setAccounts] = useState<AccountView[]>([])
  const [payees, setPayees] = useState<PayeeView[]>([])
  const [categories, setCategories] = useState<CategoryView[]>([])
  // ⚠️ `null` = AINDA CARREGANDO, `[]` = carregou e não há (ou falhou).
  // A distinção não é preciosismo: com `[]` como inicial, escolher o arquivo
  // antes de a resposta chegar produzia uma conferência montada SEM regra
  // nenhuma e SEM alerta — a tela parecia pronta e sugeria errado, em
  // silêncio. MEDIDO com `/api/rules` respondendo 200 porém 3 s depois: a
  // linha vinha com a categoria do favorecido (`c1`) em vez da da regra
  // (`c2`), `[role="alert"]` vazio o tempo todo, e o import fechava assim.
  // Foi regressão introduzida pelo próprio fix que tirou `/api/rules` do
  // `Promise.all` — antes, o `await` garantia a ordem de brinde.
  const [regras, setRegras] = useState<Regra[] | null>(null)
  const [regrasIndisponiveis, setRegrasIndisponiveis] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [accountId, setAccountId] = useState('')
  const [passo, setPasso] = useState<Passo>('selecionar')
  const [origem, setOrigem] = useState<Origem>('ofx')
  const [arquivoErro, setArquivoErro] = useState<string | null>(null)

  // Pluggy (fatia ④). `conexao === null` com `conexaoCarregada === true` é
  // "esta conta ainda não foi conectada" — estado NORMAL, não erro.
  const [conexao, setConexao] = useState<ConexaoPluggy | null>(null)
  const [conexaoCarregada, setConexaoCarregada] = useState(false)
  const [editandoConexao, setEditandoConexao] = useState(false)
  const [formItemId, setFormItemId] = useState('')
  const [formAccountId, setFormAccountId] = useState('')
  const [conexaoErro, setConexaoErro] = useState<string | null>(null)
  const [salvandoConexao, setSalvandoConexao] = useState(false)
  const [pluggyDe, setPluggyDe] = useState(() => janelaPadrao(hoje()).de)
  const [pluggyAte, setPluggyAte] = useState(() => janelaPadrao(hoje()).ate)
  const [sincronizando, setSincronizando] = useState(false)
  const [pluggyErro, setPluggyErro] = useState<ErroPluggy | null>(null)
  const [rejeitadas, setRejeitadas] = useState<LinhaRejeitadaView[]>([])
  // Primeira importação Pluggy NESTA conta — derivado do banco (nenhuma
  // linha com `import_source: 'pluggy'` entre as carregadas), nunca de uma
  // flag/localStorage. Ver `prepararConferencia`.
  const [primeiroPluggy, setPrimeiroPluggy] = useState(false)

  // Etapa de mapeamento (CSV sem mapa salvo)
  const [textoCsv, setTextoCsv] = useState('')
  const [amostra, setAmostra] = useState<string[][]>([])
  const [colData, setColData] = useState('0')
  const [colValor, setColValor] = useState('1')
  const [colDescricao, setColDescricao] = useState('2')
  const [temCabecalho, setTemCabecalho] = useState(false)

  // Conferência
  const [linhas, setLinhas] = useState<LinhaRevisao[]>([])

  // Envio
  const [progresso, setProgresso] = useState<{
    enviado: number
    total: number
  } | null>(null)
  const [resultado, setResultado] = useState<{
    total: number
    imported: number
    skipped: number
  } | null>(null)
  const [envioErro, setEnvioErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    // O que o import PRECISA pra funcionar: conta (pra onde vai), favorecidos
    // e categorias (pra sugerir e pros `<select>` da conferência). Falha aqui
    // é fatal de verdade — sem conta não há o que importar.
    Promise.all([
      api<AccountView[]>('/api/accounts'),
      api<PayeeView[]>('/api/payees'),
      api<CategoryView[]>('/api/categories'),
    ])
      .then(([contas, pys, cats]) => {
        if (!vivo) return
        setAccounts(contas)
        setAccountId((atual) => atual || contas[0]?.id || '')
        setPayees(pys)
        setCategories(cats)
      })
      .catch((e: unknown) => {
        if (vivo) setLoadError(e instanceof ApiError ? e.message : String(e))
      })

    // ⚠️ As REGRAS são buscadas num efeito SEPARADO e NUNCA entram no
    // `Promise.all` acima. Um `Promise.all` junta o destino dos dois: com
    // `/api/rules` fora do ar, o `catch` acima setava `loadError` e a tela
    // inteira virava um `<p role="alert">` — sem `<h1>`, sem select de conta,
    // sem input de arquivo. **Importar não precisa de regra nenhuma**: sem
    // elas a sugestão volta a sair só do `payees.default_category_id`, que é
    // como funcionava antes das regras existirem. Degradado, não morto.
    //
    // ⚠️ E é alcançável AGORA, não em teoria: a migration `0009` (que cria a
    // tabela `rules`) só é aplicada em produção por ação manual do dono —
    // publicar o Worker antes dela faz `GET /api/rules` devolver 500 e
    // derrubaria a tela de import, que hoje funciona. Mesma classe de defeito
    // do achado C2 (a tabela `settings` ausente 500ava TRÊS telas); mesmo
    // padrão de correção de `pages/regras.tsx#carregarMatches`.
    //
    // O que NÃO é feito aqui: engolir em silêncio. `regrasIndisponiveis`
    // avisa na tela que a sugestão veio sem regras — a alternativa seria o
    // dono conferir dezenas de linhas sem categoria nenhuma e concluir que
    // as regras dele pararam de funcionar.
    api<Regra[]>('/api/rules')
      .then((rs) => {
        if (vivo) setRegras(rs)
      })
      .catch(() => {
        if (!vivo) return
        setRegras([])
        setRegrasIndisponiveis(true)
      })

    return () => {
      vivo = false
    }
  }, [])

  // ⚠️ Efeito SEPARADO, por conta, e que NUNCA derruba a tela: a conexão
  // do Pluggy é capacidade OPCIONAL — sem ela o import por arquivo (a
  // capacidade PRINCIPAL desta tela) continua inteiro. Mesma lição já paga
  // aqui com `/api/rules` (uma capacidade opcional que falhava e apagava o
  // `<h1>`, o select de conta e o input de arquivo). `conexaoPluggy` já
  // degrada pra `null` em qualquer falha — o que este efeito garante é que
  // ela nunca entre num `Promise.all` com o resto.
  useEffect(() => {
    if (accountId === '') return
    let vivo = true
    setConexaoCarregada(false)
    setEditandoConexao(false)
    setPluggyErro(null)
    conexaoPluggy(accountId).then((c) => {
      if (!vivo) return
      setConexao(c)
      setFormItemId(c?.item_id ?? '')
      setFormAccountId(c?.account_id ?? '')
      setConexaoCarregada(true)
    })
    return () => {
      vivo = false
    }
  }, [accountId])

  async function prepararConferencia(
    linhasBrutas: LinhaImportada[],
    fonte: Origem,
  ) {
    let existentes: Set<string>
    let existentesCompletos: TxExistente[]
    let jaImportouPluggy: boolean
    try {
      // ⚠️ MESMA requisição de sempre — a checagem heurística de duplicata
      // (abaixo) NÃO acrescentou nenhuma. `listTransactions` já faz
      // `SELECT` das 20 colunas, então `purchase_date`/`amount_cents`/
      // `description`/`import_source` sempre vieram neste payload e eram
      // descartados aqui. Custo medido no D1: `rows_read = 600` com 300
      // lançamentos na conta (2 por linha: índice `idx_tx_account_date` +
      // tabela), idêntico antes e depois. Ver o ⚠️ de custo em
      // `lib/duplicata-provavel.ts`.
      const txs = await api<
        Array<
          TxExistente & {
            imported_id: string | null
          }
        >
      >(`/api/transactions?account_id=${accountId}&limit=500`)
      existentes = new Set(
        txs.map((t) => t.imported_id).filter((id): id is string => id !== null),
      )
      existentesCompletos = txs
      // ⚠️ **A guarda do PRIMEIRO import sai daqui, do dado, sem custar uma
      // requisição a mais nem uma flag a lembrar de limpar.** Esta busca já
      // existia (é a dedupe); `import_source` já vinha no payload. O aviso
      // aparece exatamente enquanto não existe nenhuma linha `pluggy`
      // NESTA conta e some sozinho depois da primeira importação — sem
      // botão de "não mostrar de novo", sem `localStorage` (que mentiria
      // entre o Android e o MacBook) e sem `settings` (que continuaria
      // dizendo "já importou" depois de um restore que apagou as linhas).
      //
      // Limitação herdada e aceita: a busca é capada em 500 linhas (teto de
      // `listTransactions`). Numa conta com mais de 500 lançamentos mais
      // NOVOS que a última importação Pluggy, o aviso reaparece. Erra pro
      // lado de avisar demais — que é o lado certo pra um aviso cujo
      // assunto é dado sem desfazer.
      jaImportouPluggy = txs.some((t) => t.import_source === 'pluggy')
    } catch (err) {
      setArquivoErro(err instanceof ApiError ? err.message : String(err))
      return
    }

    // Disambiguação DETERMINÍSTICA de colisão DENTRO do mesmo arquivo — duas
    // linhas com o mesmo hash no mesmo arquivo (ex.: dois cafés de R$ 8 na
    // mesma padaria no mesmo dia, a limitação documentada do hash — spec
    // §5) recebem `imported_id`s distintos desde a montagem da conferência,
    // nunca só na hora de enviar. `ocorrencia` é a posição (0-based) da
    // linha entre as que compartilham o mesmo id-base NESTE arquivo — pura
    // função da ORDEM DE PARSE, então reimportar o MESMO arquivo produz a
    // MESMA sequência de ids sempre. A 1ª ocorrência mantém o id-base
    // (compatível com o caminho comum, sem sufixo); a 2ª em diante ganha
    // `:occ:<n>` — isso faz as duas linhas nascerem como duas transações
    // DISTINTAS desde já (nenhuma marcada "duplicada" uma da outra), em vez
    // de a 2ª ser silenciosamente descartada pelo dedupe intra-requisição
    // do backend (`seenInThisRequest`, domain/import.ts) só porque as duas
    // chegariam com o mesmo id cru.
    // ⚠️ A SEGUNDA checagem, a que a dedupe exata é estruturalmente
    // incapaz de fazer: bate data (±1 dia) e valor contra lançamentos de
    // OUTRA origem. Roda sobre as linhas BRUTAS, na mesma ordem, e o
    // resultado é posicional — o critério, a justificativa e o lado pro
    // qual ele erra moram em `lib/duplicata-provavel.ts`.
    // ⚠️ Pré-passe do id natural ANTES do palpite, e a ordem importa (achado
    // BAIXO da revisão, que erra pro lado CARO). `detectarProvaveis` CONSOME o
    // candidato que casou (`usado = true`), pra um lançamento gravado não
    // servir de par pra duas linhas. Passando as linhas já-duplicadas junto,
    // uma delas podia comer o único lançamento de outra origem — e o aviso da
    // linha genuinamente NOVA sumia, marcada e sem alerta.
    //
    // MEDIDO por unidade: gravados `[manual 07-10 -1200]`, linhas
    // `[já-importada 07-10 -1200, nova 07-10 -1200]` => `["cafe manual", null]`.
    // A segunda é a nova, e saía sem aviso. Falso NEGATIVO — o lado que o
    // critério declara como o caro (dinheiro contado 2x, sem desfazer barato).
    const ocorrenciaPorIdBase = new Map<string, number>()
    const idsNaturais = linhasBrutas.map((l) => {
      const ocorrencia = ocorrenciaPorIdBase.get(l.imported_id) ?? 0
      ocorrenciaPorIdBase.set(l.imported_id, ocorrencia + 1)
      return ocorrencia === 0
        ? l.imported_id
        : `${l.imported_id}:occ:${ocorrencia}`
    })
    const jaDuplicada = idsNaturais.map((id) => existentes.has(id))

    // Só as linhas que o dono de fato vai considerar entram no palpite — as
    // já-duplicadas não competem por candidato.
    const provaveis = detectarProvaveis(
      linhasBrutas,
      existentesCompletos,
      fonte,
      jaDuplicada,
    )

    const revisao: LinhaRevisao[] = linhasBrutas.map((l, i) => {
      const idNatural = idsNaturais[i]
      const duplicada = jaDuplicada[i]
      // ⚠️ A sugestão vem das REGRAS **e** do `payees.default_category_id`,
      // e QUEM GANHA QUANDO OS DOIS DISCORDAM é a regra — o porquê (e a
      // validação da categoria contra a lista carregada, pelos DOIS
      // caminhos, que é o defeito de `6ba822c` não podendo voltar pelo
      // caminho novo) mora inteiro em `lib/regras-import.ts`. Aqui não se
      // decide nada: uma segunda cópia da precedência divergiria da
      // testada, e o sintoma seria a tela sugerindo diferente do que a tela
      // de regras promete.
      const sugestao = sugerirParaLinha(l, {
        accountId,
        payees,
        categories,
        // Não pode ser `null` aqui: o input de arquivo fica desabilitado
        // até a leitura resolver (ver `regrasCarregando` no JSX). O `?? []`
        // seria o caminho silencioso que este fix existe pra fechar.
        regras: regras ?? [],
      })
      return {
        imported_id: idNatural,
        purchase_date: l.purchase_date,
        amount_cents: l.amount_cents,
        description: l.description,
        payee_id: sugestao.payee_id,
        category_id: sugestao.category_id,
        is_business: sugestao.is_business,
        regras: sugestao.regras,
        sugestaoDescartada: sugestao.sugestaoDescartada,
        duplicada,
        // A heurística nunca sobrepõe a certeza: quando o id já existe, o
        // motivo mostrado é o exato, não o palpite.
        provavelDuplicata: duplicada ? null : (provaveis[i] ?? null),
        // Duplicata aparece DESMARCADA por padrão (spec §5) — o dono vê e
        // pode forçar marcando de novo; linha nova vem marcada, pronta pra
        // confirmar. ⚠️ A PROVÁVEL também nasce desmarcada, pelo mesmo
        // motivo e com o mesmo direito de ser remarcada: a heurística erra,
        // e a tela não pode ser mais confiante que o método.
        marcada: !duplicada && (provaveis[i] ?? null) === null,
      }
    })

    setOrigem(fonte)
    setPrimeiroPluggy(fonte === 'pluggy' && !jaImportouPluggy)
    setLinhas(revisao)
    setResultado(null)
    setEnvioErro(null)
    setPasso('conferencia')
  }

  async function salvarConexao(e: FormEvent) {
    e.preventDefault()
    const item_id = formItemId.trim()
    const account_id = formAccountId.trim()
    if (item_id === '' || account_id === '') {
      setConexaoErro('Informe os dois: o id da conexão (item) e o da conta.')
      return
    }

    setConexaoErro(null)
    setSalvandoConexao(true)
    // `mutarERecarregar` (o 10º call site): a mutação é o `PUT` e a recarga
    // é reler do servidor — releitura de verdade, não cosmética: é ela que
    // mostra o que de fato ficou salvo, em vez de espelhar o formulário e
    // acreditar. Se o PUT passa e o GET cai, a mensagem NÃO pode ler como
    // "não salvou" (o dono reescreveria por cima do que já está certo).
    const r = await mutarERecarregar(
      () => salvarConexaoPluggy(accountId, { item_id, account_id }),
      async () => {
        const salva = await conexaoPluggy(accountId)
        setConexao(salva)
        setEditandoConexao(false)
      },
      'A conexão foi salva, mas não consegui reler pra confirmar — atualize a página. Não salve de novo por precaução: o valor já está gravado.',
    )
    setSalvandoConexao(false)
    if (!r.ok) setConexaoErro(r.mensagem)
  }

  /**
   * ⚠️ **NÃO usa `mutarERecarregar`, e a ausência é decisão.** Isto é uma
   * LEITURA (`GET`) — não há mutação nenhuma no servidor, e o contrato
   * daquele helper é "a ação aconteceu, o recarregamento é que não". Usá-lo
   * aqui faria a tela afirmar que algo foi gravado quando nada foi: o
   * oposto da propriedade que ele existe pra proteger. O que grava
   * continua sendo `enviarConfirmadas`, depois da conferência.
   */
  async function sincronizarPluggy() {
    if (conexao === null) return

    if (!isRealCalendarDate(pluggyDe) || !isRealCalendarDate(pluggyAte)) {
      // Validado no cliente antes de gastar requisição — um
      // `<input type="date">` não produz data inexistente sozinho, mas
      // produz string VAZIA (campo limpo, preenchimento parcial no
      // Android), mesma lição de `pages/transferir.tsx`.
      setPluggyErro({
        code: 'invalid_query',
        message: 'Escolha as duas datas do período (de e até).',
      })
      return
    }
    if (pluggyDe > pluggyAte) {
      setPluggyErro({
        code: 'invalid_query',
        message: 'O início do período não pode ser depois do fim.',
      })
      return
    }

    setPluggyErro(null)
    setArquivoErro(null)
    setSincronizando(true)
    try {
      const params = new URLSearchParams({
        account_id: conexao.account_id,
        item_id: conexao.item_id,
        from: pluggyDe,
        to: pluggyAte,
      })
      const resposta = await api<PluggyTransactionsView>(
        `/api/pluggy/transactions?${params.toString()}`,
      )
      setRejeitadas(resposta.rejeitadas)
      if (resposta.linhas.length === 0 && resposta.rejeitadas.length === 0) {
        // Zero linha NÃO é erro (janela sem movimento é comum) — mas
        // também não pode virar uma tela de conferência vazia, que pareceu
        // ter dado errado. Fica no lugar, dizendo o que aconteceu.
        setPluggyErro({
          code: 'sem_lancamentos',
          message: `O banco não trouxe nenhum lançamento entre ${pluggyDe} e ${pluggyAte}. Isso não é erro — a conexão respondeu normalmente.`,
        })
        return
      }
      await prepararConferencia(resposta.linhas, 'pluggy')
    } catch (err) {
      setPluggyErro(
        err instanceof ApiError
          ? { code: err.code, message: err.message }
          : { code: 'desconhecido', message: String(err) },
      )
    } finally {
      setSincronizando(false)
    }
  }

  async function selecionarArquivo(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo) return
    setArquivoErro(null)

    const tipo = tipoArquivo(arquivo.name)
    if (tipo === null) {
      setArquivoErro('Arquivo não reconhecido — use .ofx, .qfx ou .csv.')
      return
    }

    const texto = await lerArquivoComoTexto(arquivo)

    if (tipo === 'ofx') {
      try {
        await prepararConferencia(parseOfx(texto), 'ofx')
      } catch (err) {
        setArquivoErro(err instanceof Error ? err.message : String(err))
      }
      return
    }

    const mapaExistente = await mapaSalvo(accountId)
    if (mapaExistente) {
      try {
        await prepararConferencia(
          await linhasCsvComId(texto, mapaExistente),
          'csv',
        )
      } catch (err) {
        setArquivoErro(err instanceof Error ? err.message : String(err))
      }
      return
    }

    setTextoCsv(texto)
    setAmostra(amostraCsv(texto))
    setPasso('mapear')
  }

  async function confirmarMapa(e: FormEvent) {
    e.preventDefault()
    const mapa: MapaColunas = {
      data: Number(colData),
      valor: Number(colValor),
      descricao: Number(colDescricao),
      temCabecalho,
    }
    try {
      const comId = await linhasCsvComId(textoCsv, mapa)
      await salvarMapa(accountId, mapa)
      await prepararConferencia(comId, 'csv')
    } catch (err) {
      setArquivoErro(err instanceof Error ? err.message : String(err))
    }
  }

  function atualizarLinha(index: number, patch: Partial<LinhaRevisao>) {
    setLinhas((atual) =>
      atual.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    )
  }

  async function enviarConfirmadas() {
    const confirmadas = linhas.filter((l) => l.marcada)
    setPasso('enviando')
    setEnvioErro(null)
    setProgresso({ enviado: 0, total: confirmadas.length })

    const lotes = chunk(confirmadas, IMPORT_BATCH_SIZE)
    const acumulado = { total: 0, imported: 0, skipped: 0 }

    for (const lote of lotes) {
      try {
        const resultadoLote = await api<{
          total: number
          imported: number
          skipped: number
        }>('/api/transactions/import', {
          method: 'POST',
          body: JSON.stringify({
            account_id: accountId,
            import_source: origem,
            rows: lote.map((l) => ({
              imported_id: idParaEnvio(l),
              purchase_date: l.purchase_date,
              amount_cents: l.amount_cents,
              description: l.description,
              payee_id: l.payee_id || null,
              category_id: l.category_id || null,
              // Mandado SEMPRE (não só quando 1): a coluna é NOT NULL
              // DEFAULT 0 no schema, então omitir seria indistinguível de
              // "PF", e o dono desmarcar um PJ que uma regra marcou tem que
              // chegar ao servidor como uma decisão dele, não como omissão.
              is_business: l.is_business,
            })),
          }),
        })
        acumulado.total += resultadoLote.total
        acumulado.imported += resultadoLote.imported
        acumulado.skipped += resultadoLote.skipped
        setProgresso((p) =>
          p ? { enviado: p.enviado + lote.length, total: p.total } : p,
        )
      } catch (err) {
        setEnvioErro(err instanceof ApiError ? err.message : String(err))
        setResultado(acumulado)
        setPasso('conferencia')
        return
      }
    }

    setResultado(acumulado)
    setPasso('concluido')
  }

  function novaImportacao() {
    setPasso('selecionar')
    setLinhas([])
    setResultado(null)
    setEnvioErro(null)
    setArquivoErro(null)
    setProgresso(null)
    setRejeitadas([])
    setPrimeiroPluggy(false)
    setPluggyErro(null)
  }

  if (loadError) return <p role="alert">{loadError}</p>

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Importar</h1>

      {regrasIndisponiveis ? (
        <p
          role="alert"
          data-testid="regras-indisponiveis"
          className="text-destructive text-sm"
        >
          Não consegui carregar suas regras de categorização — a importação
          continua funcionando, mas as sugestões vêm só do favorecido. Confira
          categoria e PJ/PF linha a linha antes de confirmar.
        </p>
      ) : null}

      {passo === 'selecionar' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ler extrato ou fatura</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="importar-conta">Conta</Label>
              <select
                id="importar-conta"
                className={SELECT_CLASSNAME}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="importar-arquivo">
                Arquivo (.ofx, .qfx ou .csv)
              </Label>
              <input
                id="importar-arquivo"
                type="file"
                accept=".ofx,.qfx,.csv"
                // ⚠️ Travado ATÉ as regras resolverem (sucesso ou falha). Sem
                // isso existe uma janela em que a tela parece pronta e monta
                // a conferência sem regra nenhuma, sem avisar — medido com a
                // resposta chegando 3 s depois. A janela é estreita, e é
                // exatamente por isso que ela passaria despercebida.
                disabled={regras === null}
                onChange={selecionarArquivo}
                className={FILE_INPUT_CLASSNAME}
              />
              {regras === null ? (
                <p
                  role="status"
                  aria-busy="true"
                  data-testid="regras-carregando"
                  className="text-muted-foreground text-xs"
                >
                  Carregando suas regras de categorização…
                </p>
              ) : null}
            </div>
            <p className="text-muted-foreground text-xs">
              O arquivo é lido aqui no navegador — nunca sobe pro servidor. Só
              as linhas que você confirmar na próxima tela são enviadas.
            </p>
            {arquivoErro ? (
              <p role="alert" className="text-destructive text-sm">
                {arquivoErro}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {passo === 'selecionar' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Sincronizar com o banco
              <Ajuda rotulo="Sincronizar com o banco">
                Puxa os lançamentos direto do banco pelo Pluggy, em vez de
                baixar um arquivo. O que vem cai na MESMA tela de conferência do
                .ofx/.csv — nada é gravado antes de você confirmar linha a
                linha. Não existe sincronização automática de propósito: é a
                conferência que separa &quot;importei&quot; de &quot;importei
                errado e não tem volta&quot;.
              </Ajuda>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!conexaoCarregada ? (
              <p
                role="status"
                aria-busy="true"
                data-testid="pluggy-carregando"
                className="text-muted-foreground text-sm"
              >
                Verificando a conexão desta conta…
              </p>
            ) : conexao === null || editandoConexao ? (
              <form onSubmit={salvarConexao} className="space-y-4">
                <p className="text-muted-foreground text-sm">
                  Conecte esta conta no app <strong>Meu Pluggy</strong> e cole
                  aqui os dois identificadores que ele mostra: o da conexão
                  (item) e o da conta/cartão dentro dela. Ficam salvos nesta
                  conta, não no aparelho — conectar no computador e sincronizar
                  pelo celular funciona.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="pluggy-item">
                    Id da conexão (item) no Pluggy
                  </Label>
                  <Input
                    id="pluggy-item"
                    value={formItemId}
                    onChange={(e) => setFormItemId(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pluggy-conta">Id da conta no Pluggy</Label>
                  <Input
                    id="pluggy-conta"
                    value={formAccountId}
                    onChange={(e) => setFormAccountId(e.target.value)}
                  />
                </div>
                {conexaoErro ? (
                  <p
                    role="alert"
                    data-testid="pluggy-conexao-erro"
                    className="text-destructive text-sm"
                  >
                    {conexaoErro}
                  </p>
                ) : null}
                <Button type="submit" disabled={salvandoConexao}>
                  {salvandoConexao ? 'Salvando…' : 'Salvar conexão'}
                </Button>
              </form>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="pluggy-de">De</Label>
                    <Input
                      id="pluggy-de"
                      type="date"
                      value={pluggyDe}
                      onChange={(e) => setPluggyDe(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pluggy-ate">Até</Label>
                    <Input
                      id="pluggy-ate"
                      type="date"
                      value={pluggyAte}
                      onChange={(e) => setPluggyAte(e.target.value)}
                    />
                  </div>
                </div>
                {/* ⚠️ O texto do período NÃO é decoração: é onde a guarda do
                    primeiro import é explicada ANTES do toque. O default de
                    um mês está em `lib/pluggy.ts#janelaPadrao`, e o servidor
                    não tem default nenhum. */}
                <p className="text-muted-foreground text-xs">
                  O período já vem com <strong>um mês</strong>, não com os 12
                  que o banco guarda. Traga aos poucos: uma dezena de linhas dá
                  pra conferir a olho, e a conferência é o que impede um erro de
                  sinal ou de data virar histórico sem volta.
                </p>
                <Button onClick={sincronizarPluggy} disabled={sincronizando}>
                  {sincronizando ? 'Buscando…' : 'Sincronizar com o banco'}
                </Button>
                <p className="text-muted-foreground text-xs">
                  Nada é gravado agora — o que vier passa pela mesma tela de
                  conferência do arquivo.
                </p>
                <button
                  type="button"
                  data-testid="pluggy-trocar-conexao"
                  className={`text-muted-foreground text-xs underline ${ALVO_LINK}`}
                  onClick={() => {
                    setEditandoConexao(true)
                    setConexaoErro(null)
                  }}
                >
                  trocar a conexão desta conta
                </button>
              </>
            )}

            {pluggyErro ? (
              <div className="space-y-1">
                <p
                  role="alert"
                  data-testid="pluggy-erro"
                  className="text-destructive text-sm"
                >
                  {pluggyErro.message}
                </p>
                {/* Cada causa tem uma AÇÃO diferente — e a do item
                    desconectado é a que o dono mais vai ver com o tempo. A
                    mensagem do servidor fica como está; isto é um segundo
                    parágrafo. */}
                {dicaParaErroPluggy(pluggyErro.code) !== null ? (
                  <p
                    data-testid="pluggy-dica"
                    className="text-muted-foreground text-xs"
                  >
                    {dicaParaErroPluggy(pluggyErro.code)}
                  </p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {passo === 'selecionar' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fatura em PDF?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              Banco que só entrega fatura em PDF não tem botão aqui — o caminho
              é rodar um comando no seu Mac, que gera um CSV. Esse CSV entra
              pela mesma tela, do mesmo jeito que .ofx/.csv.
            </p>
            <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
              <code>node apps/financas/scripts/pdf-import.mjs fatura.pdf</code>
            </pre>
            <p className="text-sm font-medium">
              Nenhum servidor precisa estar ligado. O Ollama roda só durante
              esse comando, no seu Mac — termina, gera o CSV, e você pode
              desligar tudo antes de vir importar aqui.
            </p>
            <p className="text-muted-foreground text-xs">
              Por que é um comando e não um botão: o Ollama precisa de GPU/Metal
              pra rodar, e nenhum tipo de instância do Cloudflare Containers
              oferece GPU — a extração não pode rodar no servidor.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {passo === 'mapear' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Mapear colunas do CSV
              <Ajuda rotulo="Mapeamento de colunas">
                Não adivinhamos qual coluna é qual — bancos mudam de layout, e
                adivinhar errado corrompe a importação em silêncio. Mapeie uma
                vez pra este banco; da próxima vez esta etapa some.
              </Ajuda>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table
                data-testid="preview-csv"
                className="w-full border-collapse text-xs"
              >
                <tbody>
                  {amostra.map((linha, i) => (
                    <tr key={i}>
                      {linha.map((celula, j) => (
                        <td
                          key={j}
                          className="border-b py-1 pr-2 whitespace-nowrap"
                        >
                          {celula}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form onSubmit={confirmarMapa} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="mapa-data">Coluna da data</Label>
                <select
                  id="mapa-data"
                  className={SELECT_CLASSNAME}
                  value={colData}
                  onChange={(e) => setColData(e.target.value)}
                >
                  {(amostra[0] ?? []).map((_, i) => (
                    <option key={i} value={i}>
                      Coluna {i} — {amostra[0]?.[i]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mapa-valor">Coluna do valor</Label>
                <select
                  id="mapa-valor"
                  className={SELECT_CLASSNAME}
                  value={colValor}
                  onChange={(e) => setColValor(e.target.value)}
                >
                  {(amostra[0] ?? []).map((_, i) => (
                    <option key={i} value={i}>
                      Coluna {i} — {amostra[0]?.[i]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mapa-descricao">Coluna da descrição</Label>
                <select
                  id="mapa-descricao"
                  className={SELECT_CLASSNAME}
                  value={colDescricao}
                  onChange={(e) => setColDescricao(e.target.value)}
                >
                  {(amostra[0] ?? []).map((_, i) => (
                    <option key={i} value={i}>
                      Coluna {i} — {amostra[0]?.[i]}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className={CHECKBOX_CLASSNAME}
                  checked={temCabecalho}
                  onChange={(e) => setTemCabecalho(e.target.checked)}
                />
                Primeira linha é cabeçalho
              </label>
              {arquivoErro ? (
                <p role="alert" className="text-destructive text-sm">
                  {arquivoErro}
                </p>
              ) : null}
              <Button type="submit">Usar este mapeamento</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {passo === 'conferencia' || passo === 'enviando' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Conferir importação
              <Ajuda rotulo="Duplicata">
                São duas checagens diferentes. A primeira é exata: o id da linha
                já existe nesta conta. Ela só funciona dentro da MESMA origem —
                OFX, CSV, banco e lançamento manual usam ids de esquemas
                diferentes (ou nenhum), então a mesma compra vinda por duas
                portas nunca colide. A segunda é um palpite pra cobrir isso:
                mesma conta, mesmo valor, data com até 1 dia de diferença, e um
                lançamento já gravado de outra origem. As duas erram nos dois
                sentidos — dois cafés de R$ 8 no mesmo dia podem aparecer como
                duplicata sendo reais. Nada é descartado: as linhas só nascem
                desmarcadas, e marcar de volta importa normalmente.
              </Ajuda>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* ⚠️ Aparece SÓ na primeira importação Pluggy desta conta (ver
                `prepararConferencia`), e some sozinho depois — nenhuma flag,
                nenhum botão de dispensar. As duas coisas que ele manda
                conferir são exatamente as duas armadilhas do adaptador:
                sinal e data. */}
            {primeiroPluggy ? (
              <p
                role="alert"
                data-testid="pluggy-primeiro-import"
                className="text-destructive text-sm"
              >
                Esta é a <strong>primeira importação pelo banco</strong> nesta
                conta. Confira duas coisas linha a linha antes de confirmar: o{' '}
                <strong>sinal</strong> (gasto tem que aparecer em vermelho,
                estorno/entrada em verde) e a <strong>data</strong> (compras
                feitas à noite são as que mais escorregam de dia). Depois de
                gravado não dá pra reimportar por cima pra corrigir.
              </p>
            ) : null}

            {origem === 'pluggy' && rejeitadas.length > 0 ? (
              <div
                data-testid="pluggy-rejeitadas"
                className="text-muted-foreground space-y-1 text-xs"
              >
                <p>
                  {rejeitadas.length} lançamento(s) vieram do banco e{' '}
                  <strong>não entram nesta lista</strong>:
                </p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {rejeitadas.map((r) => (
                    <li key={`${r.id}-${r.index}`}>{r.motivo}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* ⚠️ A FRASE TEM QUE DIZER A VERDADE. Ela era "N já parecem
                importadas — desmarcadas por padrão", afirmação que só vale
                sobre `imported_id` e portanto só dentro da MESMA origem: a
                mesma compra vinda por OFX e por Pluggy dava "0 já parecem
                importadas" com o checkbox PRÉ-MARCADO (medido no D1 e na
                tela). Agora ela separa as duas checagens, diz sobre o que
                cada uma vale, e chama o palpite de palpite. */}
            <div className="text-muted-foreground space-y-1 text-sm">
              <p data-testid="conferencia-resumo">
                {linhas.length} linha(s) encontrada(s).{' '}
                {linhas.filter((l) => l.duplicada).length} com id já importado
                nesta conta;{' '}
                {linhas.filter((l) => l.provavelDuplicata !== null).length} com
                data (±1 dia) e valor batendo em lançamento de OUTRA origem —
                todas essas vêm desmarcadas.
              </p>
              <p data-testid="conferencia-limite-dedupe">
                A checagem por id só enxerga a MESMA origem: OFX, CSV, banco e
                lançamento manual dão ids diferentes (ou nenhum) para a mesma
                compra. A segunda é um palpite — confira e marque de volta o que
                for legítimo.
              </p>
            </div>

            <div className="divide-y">
              {linhas.map((linha, i) => (
                <div
                  key={linha.imported_id + i}
                  data-testid={`linha-${i}`}
                  className="space-y-2 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className={CHECKBOX_CLASSNAME}
                        checked={linha.marcada}
                        disabled={passo === 'enviando'}
                        onChange={(e) =>
                          atualizarLinha(i, { marcada: e.target.checked })
                        }
                      />
                      {dataBR(linha.purchase_date)}
                    </label>
                    <span
                      className={
                        linha.amount_cents < 0
                          ? 'text-destructive text-sm font-medium tabular-nums'
                          : 'text-success text-sm font-medium tabular-nums'
                      }
                    >
                      {formatBRL(linha.amount_cents)}
                    </span>
                  </div>
                  {linha.duplicada ? (
                    <div
                      data-testid={`duplicada-${i}`}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <Badge variant="destructive">Já importada</Badge>
                      <span className="text-muted-foreground text-xs">
                        Desmarcada por padrão. Marque para forçar.
                      </span>
                    </div>
                  ) : null}
                  {/* ⚠️ O motivo fica VISÍVEL e nomeia a linha com que
                      colide — data, valor, descrição e de onde ela veio.
                      Sem isso o dono não tem como julgar o palpite, e um
                      aviso que ele não consegue julgar é um aviso que ele
                      aprende a ignorar. O checkbox continua dele. */}
                  {linha.provavelDuplicata ? (
                    <div
                      data-testid={`provavel-duplicata-${i}`}
                      className="space-y-1"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">Talvez duplicada</Badge>
                        <span className="text-muted-foreground text-xs">
                          Desmarcada por padrão. Marque se for uma compra
                          diferente.
                        </span>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        Mesmo valor e{' '}
                        {linha.provavelDuplicata.diasDeDiferenca === 0
                          ? 'mesma data'
                          : '1 dia de diferença'}{' '}
                        de um lançamento que já existe, vindo de{' '}
                        {rotuloOrigem(linha.provavelDuplicata.origem)}:{' '}
                        <strong>
                          {dataBR(linha.provavelDuplicata.purchase_date)} ·{' '}
                          {formatBRL(linha.provavelDuplicata.amount_cents)} ·{' '}
                          {linha.provavelDuplicata.description}
                        </strong>
                        {linha.provavelDuplicata.descricaoBate
                          ? ' — a descrição também bate.'
                          : ' — a descrição é outra, o que é normal entre origens diferentes.'}
                      </p>
                    </div>
                  ) : null}
                  <p className="text-sm">{linha.description}</p>
                  {linha.regras.length > 0 ? (
                    <p
                      data-testid={`regras-${i}`}
                      className="text-muted-foreground text-xs"
                    >
                      {explicarRegras(linha.regras)}
                    </p>
                  ) : null}
                  {linha.sugestaoDescartada ? (
                    // "A regra não casou" e "a regra casou e a categoria
                    // dela sumiu" deixam a mesma tela (campo vazio) por
                    // motivos opostos — só um deles pede ação do dono.
                    <p
                      data-testid={`sugestao-descartada-${i}`}
                      role="alert"
                      className="text-destructive text-xs"
                    >
                      Uma sugestão apontava para uma categoria ou favorecido que
                      não está mais na lista (arquivado ou removido) — foi
                      descartada. Escolha abaixo.
                    </p>
                  ) : null}
                  <div className="grid grid-cols-1 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor={`payee-${i}`}>Payee sugerido</Label>
                      <select
                        id={`payee-${i}`}
                        data-testid={`payee-${i}`}
                        className={SELECT_CLASSNAME}
                        value={linha.payee_id}
                        disabled={passo === 'enviando'}
                        onChange={(e) =>
                          atualizarLinha(i, { payee_id: e.target.value })
                        }
                      >
                        <option value="">Sem payee</option>
                        {payees.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`categoria-${i}`}>
                        Categoria sugerida
                      </Label>
                      <select
                        id={`categoria-${i}`}
                        data-testid={`categoria-${i}`}
                        className={SELECT_CLASSNAME}
                        value={linha.category_id}
                        disabled={passo === 'enviando'}
                        onChange={(e) =>
                          atualizarLinha(i, { category_id: e.target.value })
                        }
                      >
                        <option value="">Sem categoria</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* Checkbox, não badge: a sugestão de PJ vinda de uma
                        regra continua sendo SUGESTÃO, e o dono precisa poder
                        desmarcar antes de gravar — igual à categoria e ao
                        favorecido. */}
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        data-testid={`pj-${i}`}
                        className={CHECKBOX_CLASSNAME}
                        checked={linha.is_business === 1}
                        disabled={passo === 'enviando'}
                        onChange={(e) =>
                          atualizarLinha(i, {
                            is_business: e.target.checked ? 1 : 0,
                          })
                        }
                      />
                      PJ (despesa da empresa)
                    </label>
                  </div>
                </div>
              ))}
            </div>

            {passo === 'enviando' && progresso ? (
              <p role="status" data-testid="progresso" className="text-sm">
                Enviando… {progresso.enviado} de {progresso.total} linhas.
              </p>
            ) : null}

            {envioErro ? (
              <p role="alert" className="text-destructive text-sm">
                {envioErro}
              </p>
            ) : null}

            <Button
              onClick={enviarConfirmadas}
              disabled={passo === 'enviando' || linhas.every((l) => !l.marcada)}
            >
              {passo === 'enviando'
                ? 'Enviando…'
                : `Confirmar importação (${linhas.filter((l) => l.marcada).length})`}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {passo === 'concluido' && resultado ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Importação concluída</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p data-testid="resultado-resumo" className="text-sm">
              {resultado.imported} importadas, {resultado.skipped} já existiam
              (puladas).
            </p>
            <Button onClick={novaImportacao}>Nova importação</Button>
          </CardContent>
        </Card>
      ) : null}
    </section>
  )
}
