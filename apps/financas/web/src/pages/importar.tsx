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
import { Label } from '@piluvitu/ui/label'
import { api, ApiError } from '../api'
import {
  CHECKBOX_CLASSNAME,
  FILE_INPUT_CLASSNAME,
  SELECT_CLASSNAME,
} from '../lib/form-classes'
import { mapaSalvo, salvarMapa } from '../lib/import-settings'
import { type PayeeParaSugestao } from '../lib/payee-suggest'
import { explicarRegras, sugerirParaLinha } from '../lib/regras-import'
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
  duplicada: boolean
  marcada: boolean
}

type Passo = 'selecionar' | 'mapear' | 'conferencia' | 'enviando' | 'concluido'

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
  const [regras, setRegras] = useState<Regra[]>([])
  const [regrasIndisponiveis, setRegrasIndisponiveis] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [accountId, setAccountId] = useState('')
  const [passo, setPasso] = useState<Passo>('selecionar')
  const [origem, setOrigem] = useState<'ofx' | 'csv'>('ofx')
  const [arquivoErro, setArquivoErro] = useState<string | null>(null)

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

  async function prepararConferencia(
    linhasBrutas: LinhaImportada[],
    fonte: 'ofx' | 'csv',
  ) {
    let existentes: Set<string>
    try {
      const txs = await api<Array<{ imported_id: string | null }>>(
        `/api/transactions?account_id=${accountId}&limit=500`,
      )
      existentes = new Set(
        txs.map((t) => t.imported_id).filter((id): id is string => id !== null),
      )
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
    const ocorrenciaPorIdBase = new Map<string, number>()
    const revisao: LinhaRevisao[] = linhasBrutas.map((l) => {
      const ocorrencia = ocorrenciaPorIdBase.get(l.imported_id) ?? 0
      ocorrenciaPorIdBase.set(l.imported_id, ocorrencia + 1)
      const idNatural =
        ocorrencia === 0 ? l.imported_id : `${l.imported_id}:occ:${ocorrencia}`

      const duplicada = existentes.has(idNatural)
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
        regras,
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
        // Duplicata aparece DESMARCADA por padrão (spec §5) — o dono vê e
        // pode forçar marcando de novo; linha nova vem marcada, pronta pra
        // confirmar.
        marcada: !duplicada,
      }
    })

    setOrigem(fonte)
    setLinhas(revisao)
    setResultado(null)
    setEnvioErro(null)
    setPasso('conferencia')
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
                onChange={selecionarArquivo}
                className={FILE_INPUT_CLASSNAME}
              />
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
                Duas compras genuinamente diferentes com mesma data, mesmo valor
                e mesma descrição (dois cafés de R$ 8 na mesma padaria no mesmo
                dia) geram o mesmo id — a segunda aparece marcada como duplicata
                mesmo sendo real. Marque de novo pra forçar a importação dela.
              </Ajuda>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              {linhas.length} linha(s) encontrada(s).{' '}
              {linhas.filter((l) => l.duplicada).length} já parecem importadas —
              desmarcadas por padrão.
            </p>

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
