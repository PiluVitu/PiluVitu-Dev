import { useCallback, useEffect, useRef, useState } from 'react'
import { formatBRL } from '@piluvitu/tools/money'
import { Ajuda } from '@piluvitu/ui/ajuda'
import { Button } from '@piluvitu/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import { api, ApiError } from '../api'
import { rotuloCompetencia } from '../lib/commitments'
import { NUMERO_HEROI, ROTULO } from '../lib/tipografia'
import { competenciaAtual, formatDateTimeTeresina } from '../lib/dates'
import {
  dicaParaErroDeGeracao,
  formatInsightAge,
  insightAgeDays,
  isStaleInsight,
  respostaTemTexto,
  STALE_THRESHOLD_DAYS,
  type GerarInsightResposta,
  type InsightNumbersView,
  type InsightView,
} from '../lib/insight'

/**
 * Fatia ⑨, Task 5 — a tela de insight. Propriedade que ela existe pra
 * sustentar (ver brief/CLAUDE.md § "Insight de IA"): **funciona sem AI**.
 * `numbers` (os fatos calculados) e `insight` (o texto gerado no Mac) são
 * buscados em DOIS `useEffect` independentes, de propósito — nunca um
 * `Promise.all` só. Se os dois estivessem no mesmo `Promise.all`, uma
 * falha (ou mesmo o caso NORMAL de "o comando nunca rodou") do lado do
 * texto derrubaria o lado dos números junto, exatamente a dependência que
 * este design existe pra evitar (o app nunca depende do Mac estar ligado).
 *
 * ⚠️ Nenhum número renderizado nesta tela vem de `insight.texto` — todo
 * valor numérico exibido é lido de `numbers` (a resposta EXATA de
 * `GET /api/insights/numbers`, que nunca lê a tabela `insights`).
 * `insight.texto` é renderizado só como PROSA, dentro de um único
 * parágrafo (`data-testid="insight-texto"`), nunca interpretado/parseado.
 *
 * ⚠️ **O botão "Gerar insight deste mês" não muda nada disso.** Ele fala
 * com `POST /api/insights/generate` (Worker → túnel → promeia no Mac →
 * Ollama); o navegador NUNCA fala com o Mac (carregaria o `PROMEIA_TOKEN`,
 * e token no cliente é token público — ver o cabeçalho de
 * `apps/financas/src/lib/promeia.ts`). Se o botão falhar por qualquer
 * motivo, o card "Números" ao lado continua exatamente como está: o erro é
 * escrito só dentro do bloco do botão, nunca lançado, nunca propagado.
 */

/**
 * Intervalo entre releituras de `GET /api/insights/latest` depois de um
 * 202. Medido na spike: a geração leva **20,3-32,8 s** — 5 s dá ~4 a 6
 * checagens dentro do caso normal, sem transformar a espera em uma rajada
 * de requisições contra o D1.
 */
export const POLL_INTERVALO_MS = 5_000

/**
 * ⚠️ **O polling PRECISA de fim.** Teto de ~90 s — quase 3× o pior caso
 * medido (32,8 s, modelo frio), com folga pro túnel e pra publicação. Ao
 * estourar, a tela diz a verdade (`MENSAGEM_SEM_CONFIRMACAO`) em vez de
 * girar pra sempre: um spinner eterno é pior que um erro, porque não
 * ensina nada — o dono ficaria olhando uma tela que não sabe distinguir
 * "está demorando" de "o Ollama nem estava aberto".
 */
export const POLL_LIMITE_MS = 90_000

/**
 * Fim honesto do polling: NÃO afirma que falhou (o promeia pode ter
 * publicado logo depois — ele publica sozinho, ver `routes/insights.ts`),
 * e NÃO afirma que deu certo. Diz o que de fato se sabe: não houve
 * confirmação, e o que conferir.
 */
export const MENSAGEM_SEM_CONFIRMACAO =
  'Não recebi confirmação de que o texto ficou pronto — ele pode não ter sido gerado. Confira se o Ollama está aberto no Mac e recarregue a página daqui a pouco.'

/**
 * Mutação OK, recarga não. ⚠️ **Nunca pode ler como falha da geração** —
 * mesma regra de `lib/mutar-e-recarregar.ts` (ver por que aquele módulo
 * não é chamado aqui, no comentário de `gerar()` abaixo).
 */
export const MENSAGEM_GERADO_SEM_RECARGA =
  'O insight foi gerado, mas não consegui recarregar a tela — atualize a página pra ver o texto novo. Não clique de novo: gerar outro custa mais 20-35 s de GPU no Mac.'

/**
 * ⚠️ **Não dá pra gerar sem saber o que já existe.** Ver `gerar()` abaixo:
 * o polling só distingue "chegou texto novo" de "continua o de antes"
 * comparando `generated_at` contra uma LINHA DE BASE — sem ela, o insight
 * de ontem passa por resultado do clique de agora, e a tela afirma um
 * sucesso que não houve. Quando a releitura falha, o certo é **não gerar**:
 * nada é gasto (nem os 20-35 s de GPU), nada é afirmado.
 */
export const MENSAGEM_BASELINE_INDISPONIVEL =
  'Não consegui ler o insight atual antes de gerar — sem isso eu não teria como saber se o texto que aparecesse seria novo ou o de antes. Nada foi gerado. Confira a conexão e tente de novo.'

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function InsightPage() {
  const [mes, setMes] = useState(() => competenciaAtual())

  const [numbers, setNumbers] = useState<InsightNumbersView | null>(null)
  const [numbersError, setNumbersError] = useState<string | null>(null)

  const [insight, setInsight] = useState<InsightView | null>(null)
  const [insightError, setInsightError] = useState<string | null>(null)
  const [insightLoaded, setInsightLoaded] = useState(false)

  const [gerando, setGerando] = useState(false)
  // ⚠️ Fase SEPARADA de `gerando`, e a separação é o ponto (achado da revisão
  // do fix round). `gerar()` relê a linha de base ANTES de pedir qualquer
  // coisa ao Mac; enquanto essa leitura não volta, NADA foi gerado. Marcar
  // `gerando` já ali fazia a tela afirmar "Gerando… leva de 20 a 35 segundos"
  // com ZERO chamadas de geração feitas — medido por probe, com a releitura
  // pendurada. E `api()` não tem timeout de cliente, então numa rede instável
  // (o Android que motivou a correção da baseline) a tela afirmaria isso
  // indefinidamente. O botão precisa travar nas duas fases; só a MENSAGEM é
  // que não pode mentir sobre em qual delas estamos.
  const [preparando, setPreparando] = useState(false)
  const [geracaoErro, setGeracaoErro] = useState<{
    mensagem: string
    dica: string | null
  } | null>(null)
  const [geracaoAviso, setGeracaoAviso] = useState<string | null>(null)

  // Guarda SÍNCRONA contra dois disparos em paralelo — duas gerações
  // custariam duas rodadas de GPU e dois textos pro mesmo mês.
  // ⚠️ MEDIDO por mutação: quem os testes pegam é o `disabled` do botão
  // (removê-lo derruba 2 casos); remover ESTA ref não derruba nenhum,
  // porque o React não despacha `click` em botão desabilitado — ou seja,
  // o DOM não consegue reproduzir o único cenário que ela cobre (dois
  // cliques no MESMO tick, antes do re-render aplicar o `disabled`).
  // Fica pelo que custa (uma linha) contra o que evita, não por prova.
  const gerandoRef = useRef(false)
  // Nada de `setState` depois de desmontar (o polling vive até 90 s).
  const vivoRef = useRef(true)
  useEffect(() => {
    vivoRef.current = true
    return () => {
      vivoRef.current = false
    }
  }, [])

  useEffect(() => {
    let vivo = true
    setNumbers(null)
    setNumbersError(null)
    api<InsightNumbersView>(`/api/insights/numbers?competence=${mes}`)
      .then((data) => {
        if (vivo) setNumbers(data)
      })
      .catch((e: unknown) => {
        if (vivo) {
          setNumbersError(e instanceof ApiError ? e.message : String(e))
        }
      })
    return () => {
      vivo = false
    }
  }, [mes])

  /**
   * Lê o insight publicado e **devolve o que leu** — o retorno é o que
   * torna a leitura utilizável como linha de base do polling (ver
   * `gerar()`), sem depender do `insight` do estado, que pode estar
   * desatualizado ou nunca ter sido preenchido.
   *
   * LANÇA em caso de falha — quem chama decide o que a falha significa: no
   * mount é "não consegui mostrar o texto"; antes de gerar é "não sei o que
   * já existe, então não gero"; logo depois de gerar é "gerou, mas não
   * recarreguei" (três leituras diferentes do MESMO erro).
   */
  const carregarInsight = useCallback(async (): Promise<InsightView | null> => {
    const data = await api<InsightView | null>('/api/insights/latest')
    if (!vivoRef.current) return data
    setInsight(data)
    setInsightError(null)
    setInsightLoaded(true)
    return data
  }, [])

  // Busca independente do bloco de números acima (ver comentário do
  // componente). Falhar aqui (rede fora, 5xx) não pode esconder os
  // números — só esconde a leitura em texto, que é exatamente o que
  // "funciona sem AI" quer dizer.
  useEffect(() => {
    carregarInsight().catch((e: unknown) => {
      if (!vivoRef.current) return
      setInsightError(e instanceof ApiError ? e.message : String(e))
      setInsightLoaded(true)
    })
  }, [carregarInsight])

  /**
   * Depois do 202: relê `latest` até `generated_at` MUDAR em relação ao
   * que já havia — comparar o carimbo, e não "existe algum insight", é o
   * que impede um insight antigo de passar por resultado novo (o caso
   * comum: já existe leitura de ontem na tela).
   *
   * Erro no meio da espera não encerra nada: o trabalho segue no Mac, e o
   * ciclo seguinte tenta de novo. Só o TETO encerra.
   */
  async function aguardarPublicacao(anterior: string | null): Promise<void> {
    const limite = Date.now() + POLL_LIMITE_MS
    while (Date.now() < limite) {
      await esperar(POLL_INTERVALO_MS)
      if (!vivoRef.current) return

      let novo: InsightView | null
      try {
        novo = await api<InsightView | null>('/api/insights/latest')
      } catch {
        continue
      }
      if (!vivoRef.current) return

      if (novo !== null && novo.generated_at !== anterior) {
        setInsight(novo)
        setInsightError(null)
        setInsightLoaded(true)
        return
      }
    }
    setGeracaoAviso(MENSAGEM_SEM_CONFIRMACAO)
  }

  /**
   * O botão. `POST /api/insights/generate` → 200 (texto pronto, relê e
   * mostra) ou 202 (`{status:'gerando'}`, entra em polling).
   *
   * ⚠️ **A PRIMEIRA coisa que ele faz é reler `latest` — a linha de base do
   * polling nasce AQUI, não do estado da tela.** Sem isso, um mount cujo
   * `latest` falhou (503 `auth_unavailable`, rede instável no Android —
   * caminho real e documentado) deixava a base como `null` com o botão
   * habilitado, e o primeiro ciclo do polling aceitava QUALQUER insight —
   * o de ontem, já publicado, virava "resultado" do clique de agora: o erro
   * some da tela, "gerando" some, e a tela afirma um sucesso que não houve.
   * Se a releitura falhar, **nada é gerado** (`MENSAGEM_BASELINE_INDISPONIVEL`):
   * o clique não custa GPU e a tela não afirma nada que não possa verificar.
   * De brinde, fecha a janela mount→clique: um insight publicado nesse meio
   * (o Mac também publica sozinho) entra na base em vez de ser confundido
   * com o resultado.
   *
   * ⚠️ **Descartada a alternativa "exigir `generated_at` posterior ao
   * instante do clique": ela compara DOIS RELÓGIOS que nunca combinaram.**
   * `generated_at` é sempre o relógio do SERVIDOR (`nowIsoUtc()`, nunca
   * aceito do corpo do POST — ver `domain/insights.ts`), e o instante do
   * clique é o relógio do CLIENTE, que num celular pode estar minutos ou
   * horas fora. Cliente atrasado aceitaria o insight de ontem como novo
   * (o bug de volta, agora silencioso); cliente adiantado rejeitaria o
   * insight legítimo e todo clique terminaria nos 90 s do teto. Trocaria
   * uma falha rara por uma sistemática, e dependente de um relógio que
   * este app não controla.
   *
   * ⚠️ **`lib/mutar-e-recarregar.ts` foi avaliado e NÃO serve aqui.** O
   * contrato dele descarta exatamente as duas coisas em que este fluxo se
   * ramifica: o PAYLOAD da mutação (é ele quem diz se existe algo a
   * recarregar — no 202 não existe ainda, quem busca é o polling) e o
   * `code` do erro (é ele que separa dois 503 que mandam o dono pra lados
   * opostos: `promeia_disabled` × `promeia_unreachable`). Usá-lo exigiria
   * duas variáveis de saída por closure mais uma "recarga" que é no-op
   * metade das vezes — forçar, não reusar. O que ELE existe pra impedir
   * fica preservado aqui, explícito: mutação e recarga em `try`
   * SEPARADOS, e a falha da recarga vira `MENSAGEM_GERADO_SEM_RECARGA`
   * (um aviso que diz que gerou), nunca a mensagem de erro da geração.
   */
  async function gerar(): Promise<void> {
    if (gerandoRef.current) return
    gerandoRef.current = true
    setPreparando(true)
    setGeracaoErro(null)
    setGeracaoAviso(null)

    try {
      // Linha de base do polling: RELIDA do servidor, nunca herdada do
      // estado da tela (que pode nunca ter carregado). Falhar aqui encerra
      // o clique sem gerar nada — ver o ⚠️ do bloco acima.
      let anterior: string | null
      try {
        anterior = (await carregarInsight())?.generated_at ?? null
      } catch {
        if (!vivoRef.current) return
        setGeracaoErro({ mensagem: MENSAGEM_BASELINE_INDISPONIVEL, dica: null })
        return
      }
      if (!vivoRef.current) return

      // Só AQUI a tela pode dizer "Gerando…": a base está resolvida e o POST
      // vai de fato sair. Antes disto, nada foi pedido ao Mac.
      setPreparando(false)
      setGerando(true)

      let resposta: GerarInsightResposta
      try {
        resposta = await api<GerarInsightResposta>('/api/insights/generate', {
          method: 'POST',
          body: JSON.stringify({ competence: mes }),
        })
      } catch (e: unknown) {
        if (!vivoRef.current) return
        // A mensagem do servidor é repassada INTEIRA (é ela que distingue
        // "abra o Ollama" de "rode ollama pull X"); a dica é um segundo
        // parágrafo, nunca uma reescrita.
        setGeracaoErro({
          mensagem: e instanceof ApiError ? e.message : String(e),
          dica: e instanceof ApiError ? dicaParaErroDeGeracao(e.code) : null,
        })
        return
      }

      if (respostaTemTexto(resposta)) {
        // 200: o promeia já publicou antes de responder — só falta ler.
        try {
          await carregarInsight()
        } catch {
          if (!vivoRef.current) return
          setGeracaoAviso(MENSAGEM_GERADO_SEM_RECARGA)
        }
        return
      }

      // 202: nada se perdeu — o promeia publica sozinho, abortar o fetch
      // não interrompe o trabalho dele.
      await aguardarPublicacao(anterior)
    } finally {
      gerandoRef.current = false
      // As DUAS fases zeram aqui: sair pelo `return` da base indisponível
      // deixaria `preparando` preso em `true` e o botão travado pra sempre.
      if (vivoRef.current) {
        setPreparando(false)
        setGerando(false)
      }
    }
  }

  const numbersCarregando = numbers === null && numbersError === null

  return (
    <section className="space-y-6" data-testid="pagina-insight">
      {/* O `<h1>` saiu daqui pra top bar (`App.tsx`); a Ajuda ficou. */}
      <div className="flex items-center gap-3">
        <p className="text-muted-foreground text-sm">
          Os números do mês, mais a leitura escrita pelo modelo local.
        </p>
        <Ajuda rotulo="Insight">
          Os números abaixo são CALCULADOS — consulta exata contra o
          livro-caixa, disponíveis sempre, mesmo que o comando nunca tenha
          rodado no Mac. Só o texto por baixo deles é gerado por um modelo de IA
          local (Ollama), rodando no MacBook do dono — nenhum número exibido
          nesta tela vem do modelo.
        </Ajuda>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-base">
            <span>Números de {rotuloCompetencia(mes)}</span>
            <label className="flex items-center gap-2 text-sm font-normal">
              <span className="text-muted-foreground">Mês</span>
              <input
                type="month"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                className="border-input focus-visible:ring-ring flex h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:ring-1 focus-visible:outline-hidden"
              />
            </label>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {numbersError ? (
            <p role="alert" className="text-destructive text-sm">
              {numbersError}
            </p>
          ) : numbersCarregando ? (
            <p aria-busy="true" className="text-muted-foreground text-sm">
              Carregando…
            </p>
          ) : numbers ? (
            <NumerosCalculados numbers={numbers} />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leitura</CardTitle>
        </CardHeader>
        <CardContent>
          {insightError ? (
            <p role="alert" className="text-destructive text-sm">
              {insightError}
            </p>
          ) : !insightLoaded ? (
            <p aria-busy="true" className="text-muted-foreground text-sm">
              Carregando…
            </p>
          ) : insight === null ? (
            <p
              data-testid="sem-insight"
              className="text-muted-foreground text-sm"
            >
              Nenhuma leitura foi gerada ainda. Use o botão abaixo — o texto é
              escrito por um modelo local no Mac e publicado aqui quando fica
              pronto. Os números acima já funcionam sem ele, só o texto que
              falta.
            </p>
          ) : (
            <LeituraGerada insight={insight} />
          )}

          {/*
            O botão fica FORA da cadeia acima (erro/carregando/vazio/texto)
            de propósito: é o único jeito de sair do estado de erro do card
            sem trocar de tela — e é por isso que ele continua HABILITADO
            depois de uma leitura inicial que falhou. Quem garante a linha
            de base do polling nesse caso é a releitura dentro de `gerar()`,
            não este `disabled` (que só evita clicar com a leitura inicial
            ainda em voo, gastando uma requisição a mais à toa).
          */}
          <div className="mt-4 space-y-2 border-t pt-4">
            <Button
              type="button"
              data-testid="botao-gerar"
              disabled={gerando || preparando || !insightLoaded}
              onClick={() => {
                void gerar()
              }}
            >
              {gerando
                ? 'Gerando…'
                : preparando
                  ? 'Conferindo…'
                  : 'Gerar insight deste mês'}
            </Button>

            {gerando ? (
              <p
                role="status"
                aria-busy="true"
                data-testid="gerando-status"
                className="text-muted-foreground text-sm"
              >
                Gerando… o texto é escrito no Mac e leva de 20 a 35 segundos.
                Pode deixar esta tela aberta — o resultado aparece sozinho.
              </p>
            ) : null}

            {geracaoErro ? (
              <div role="alert" data-testid="geracao-erro" className="text-sm">
                <p className="text-destructive">{geracaoErro.mensagem}</p>
                {geracaoErro.dica ? (
                  <p
                    data-testid="geracao-dica"
                    className="text-muted-foreground mt-1"
                  >
                    {geracaoErro.dica}
                  </p>
                ) : null}
              </div>
            ) : null}

            {geracaoAviso ? (
              <p
                role="status"
                data-testid="geracao-aviso"
                className="text-muted-foreground text-sm"
              >
                {geracaoAviso}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}

/**
 * Só valores de `numbers` — nunca de `insight.texto`. `Math.abs(...)`
 * porque `total_cents`/categorias chegam com o sinal cru de `byCategory`
 * (negativo, despesa) — "gastei -R$ 900,00" é confuso numa tela sobre
 * quanto saiu, mesma convenção de `BlocoCategorias.tsx`.
 */
function NumerosCalculados({ numbers }: { numbers: InsightNumbersView }) {
  return (
    <div className="space-y-3 text-sm">
      {/*
        ⚠️ Era um `<strong>` de 14px no meio da frase "Total gasto: X" — o
        número que a tela existe pra explicar com o mesmo peso do rótulo que
        o nomeia. Virou manchete: `ROTULO` (versalete mono, a assinatura do
        admin) + `NUMERO_HEROI` (30px).

        ⚠️ NÃO virou `NumeroCard`: ele é um `Card`, e isto vive DENTRO do
        card "Números de <mês>", cujo cabeçalho carrega o seletor que define
        qual mês está sendo somado. Card dentro de Card aqui seria moldura
        sobre moldura; tirar o número pra fora o colocaria ACIMA do controle
        que o governa. O que se reusa é a tipografia — que é onde mora a
        linguagem.
      */}
      <div>
        <p className={ROTULO}>Total gasto</p>
        <p data-testid="insight-total" className={cn('mt-1', NUMERO_HEROI)}>
          {formatBRL(Math.abs(numbers.total_cents))}
        </p>
      </div>

      <p data-testid="insight-variacao">
        {numbers.variation_pct === null ? (
          <>
            Sem base de comparação: não houve gasto registrado em{' '}
            {rotuloCompetencia(numbers.previous_competence)}.
          </>
        ) : (
          <>
            {numbers.variation_cents >= 0 ? 'Aumento' : 'Redução'} de{' '}
            <strong className="text-foreground">
              {formatBRL(Math.abs(numbers.variation_cents))} (
              {Math.abs(numbers.variation_pct)}%)
            </strong>{' '}
            em relação a {rotuloCompetencia(numbers.previous_competence)}.
          </>
        )}
      </p>

      {numbers.top_categories.length === 0 ? (
        <p className="text-muted-foreground">
          Nenhum gasto em {rotuloCompetencia(numbers.competence)}.
        </p>
      ) : (
        <ol data-testid="insight-top-categorias" className="space-y-1">
          {numbers.top_categories.map((row, i) => (
            <li
              key={row.category_id ?? 'sem-categoria'}
              data-testid={`insight-categoria-${i}`}
            >
              {row.category_name}:{' '}
              <strong className="text-foreground tabular-nums">
                {formatBRL(Math.abs(row.total_cents))}
              </strong>
            </li>
          ))}
        </ol>
      )}

      {numbers.biggest_increase ? (
        <p data-testid="insight-maior-crescimento">
          O que mais cresceu:{' '}
          <strong className="text-foreground">
            {numbers.biggest_increase.category_name}
          </strong>{' '}
          — de {formatBRL(Math.abs(numbers.biggest_increase.previous_cents))}{' '}
          para {formatBRL(Math.abs(numbers.biggest_increase.current_cents))}.
        </p>
      ) : null}
    </div>
  )
}

/**
 * A prosa gerada no Mac + a data/idade — nunca um número novo. `antigo`
 * decide SÓ estilo/aviso, nunca esconde o texto (spec: "frescor, não
 * silêncio" — um insight velho continua visível, só não pode passar por
 * atual).
 */
function LeituraGerada({ insight }: { insight: InsightView }) {
  const dias = insightAgeDays(insight.generated_at)
  const antigo = isStaleInsight(insight.generated_at)

  return (
    <div className="space-y-2">
      <p
        data-testid="insight-geracao"
        className={cn(
          'text-sm',
          antigo ? 'text-destructive font-semibold' : 'text-muted-foreground',
        )}
      >
        Referente a {rotuloCompetencia(insight.periodo)} · gerado em{' '}
        {formatDateTimeTeresina(insight.generated_at)} ({formatInsightAge(dias)}
        )
      </p>

      {antigo ? (
        <p
          role="alert"
          data-testid="insight-alerta-desatualizado"
          className="text-destructive text-sm font-medium"
        >
          Desatualizado — gerado há mais de {STALE_THRESHOLD_DAYS} dias. Os
          números acima já podem ter mudado desde então; rode o comando no Mac
          de novo pra atualizar o texto.
        </p>
      ) : null}

      <p
        data-testid="insight-texto"
        className="text-foreground text-sm whitespace-pre-wrap"
      >
        {insight.texto}
      </p>

      <p className="text-muted-foreground text-xs">Modelo: {insight.modelo}</p>
    </div>
  )
}
