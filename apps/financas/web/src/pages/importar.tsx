import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import type { LinhaImportada } from '@piluvitu/tools/import'
import { parseCsv, type MapaColunas } from '@piluvitu/tools/import/csv'
import { idEstavel } from '@piluvitu/tools/import/id'
import { parseOfx } from '@piluvitu/tools/import/ofx'
import { formatBRL } from '@piluvitu/tools/money'
import { Ajuda } from '@piluvitu/ui/ajuda'
import { Button } from '@piluvitu/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import { Label } from '@piluvitu/ui/label'
import { api, ApiError } from '../api'
import { CHECKBOX_CLASSNAME, SELECT_CLASSNAME } from '../lib/form-classes'
import { mapaSalvo, salvarMapa } from '../lib/import-settings'
import { sugerirPayee, type PayeeParaSugestao } from '../lib/payee-suggest'
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
// no-op silencioso. Disambigua com um sufixo, só na linha marcada de
// propósito depois de já ter sido sinalizada como duplicata.
let contadorForcado = 0
function idParaEnvio(linha: LinhaRevisao): string {
  if (!linha.duplicada) return linha.imported_id
  contadorForcado++
  return `${linha.imported_id}:forcado:${Date.now()}:${contadorForcado}`
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

    const revisao: LinhaRevisao[] = linhasBrutas.map((l) => {
      const duplicada = existentes.has(l.imported_id)
      const sugestao = sugerirPayee(l.description, payees)
      return {
        imported_id: l.imported_id,
        purchase_date: l.purchase_date,
        amount_cents: l.amount_cents,
        description: l.description,
        payee_id: sugestao?.id ?? '',
        category_id: sugestao?.default_category_id ?? '',
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

    const mapaExistente = mapaSalvo(accountId)
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
      salvarMapa(accountId, mapa)
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
                className="text-sm"
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
                          ? 'text-destructive text-sm font-medium'
                          : 'text-success text-sm font-medium'
                      }
                    >
                      {formatBRL(linha.amount_cents)}
                    </span>
                  </div>
                  {linha.duplicada ? (
                    <p
                      data-testid={`duplicada-${i}`}
                      className="text-destructive text-xs"
                    >
                      Já importada — desmarcada por padrão. Marque para forçar.
                    </p>
                  ) : null}
                  <p className="text-sm">{linha.description}</p>
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

            <Button onClick={enviarConfirmadas} disabled={passo === 'enviando'}>
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
