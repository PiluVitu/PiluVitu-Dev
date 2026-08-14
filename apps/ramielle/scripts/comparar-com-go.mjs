#!/usr/bin/env node
//
// Harness de comparação lado a lado — API Go (apps/api) × Worker ramielle
// (apps/ramielle). Fatia ④ (cutover), Task 4. Critério de aceitação do
// spec (§11): "votação migrada responde igual à do Go — comparação lado a
// lado antes de aposentar". Até aqui os 394+91 testes do ramielle provam
// paridade CONTRA MOCK; este script é o que prova contra os dois serviços
// de verdade, com o MESMO dado.
//
// ⚠️ Fix round 1 (revisão do coordenador): a primeira versão deste harness
// tinha um defeito medido por reprodução — "os dois lados recusaram" (cookie
// expirado ⇒ 401 nos dois, conta não-admin ⇒ 403 nos dois) saía como
// `Resumo: 7/7 rotas iguais`, exit 0, sem ter comparado NADA de útil. Duas
// defesas novas, ver o corpo do arquivo: (1) pré-voo que aborta ANTES de
// qualquer outra chamada se `GET /auth/me` não for 200+admin nos dois lados
// (mata os cenários mais prováveis); (2) um terceiro estado
// `'nao-comparado'` em `compararRespostas`, pra quando os dois lados
// recusam de forma IDÊNTICA por qualquer outro motivo (Sheets desligado nos
// dois, serviço fora do ar nos dois) — nunca contado como "igual".
//
// ---------------------------------------------------------------------------
// PRÉ-REQUISITO DE EXECUÇÃO — sem isto o resultado não diz nada
// ---------------------------------------------------------------------------
//
// (a) OS DOIS LADOS PRECISAM DOS MESMOS DADOS. O SQLite local da Go e o D1
//     local do ramielle não têm o mesmo conteúdo por padrão. Use o gerador
//     da Task 3 (scripts/gerar-import.mjs) pra congelar uma cópia do
//     histórico real da Go num D1 LOCAL ISOLADO, e aponte os DOIS serviços
//     pra essa MESMA foto — nunca contra o volume de produção
//     (infra_api-data) e nunca com `--remote`:
//
//     1. cp /caminho/do/volume/infra_api-data/votacao.db* /scratchpad/  \
//          # copie .db E .db-wal juntos, num diretório GRAVÁVEL — nunca
//          # aponte direto pro mount read-only (ver scripts/gerar-import.mjs)
//
//     2. pnpm --filter @piluvitu/ramielle run gerar-import -- \
//          /scratchpad/votacao.db --saida /scratchpad/import.sql
//
//     3. pnpm --filter @piluvitu/ramielle exec wrangler d1 migrations apply \
//          piluvitu-ramielle --local --persist-to /scratchpad/d1-cutover-cmp
//        pnpm --filter @piluvitu/ramielle exec wrangler d1 execute \
//          piluvitu-ramielle --local --persist-to /scratchpad/d1-cutover-cmp \
//          --file /scratchpad/import.sql
//
//     4. Suba o ramielle apontando pro MESMO --persist-to:
//          pnpm --filter @piluvitu/ramielle exec wrangler dev --port 8788 \
//            --persist-to /scratchpad/d1-cutover-cmp
//
//     5. Suba a Go apontando pra MESMA cópia congelada (não o volume de
//        produção — evita um voto real durante a comparação mudar os dados
//        de um lado e não do outro, o que pareceria "divergência" sem ser):
//          SQLITE_PATH=/scratchpad/votacao.db make dev-api
//
// (b) AUTENTICAÇÃO. Quase toda rota exige sessão, e a Go (session store
//     próprio) e o ramielle (Better Auth) usam mecanismos diferentes.
//     Automatizar dois logins Google reais não é viável aqui — o dono loga
//     MANUALMENTE em cada serviço (Google de verdade) e copia o cabeçalho
//     `Cookie` INTEIRO (DevTools → Network → qualquer request autenticado →
//     Request Headers → Cookie) pras env vars COOKIE_GO/COOKIE_RAMIELLE
//     abaixo. A CONTA logada PRECISA estar em ADMIN_EMAILS dos DOIS lados —
//     5 das 8 rotas comparadas são admin-only, e com só 2 cookies (um por
//     serviço, não um por nível de privilégio) a única forma de cobrir as 8
//     é a mesma conta ser admin nos dois. É o cenário real do dono (único
//     admin hoje nas duas configs). **O script CONFIRMA isto sozinho, no
//     pré-voo, antes de gastar uma chamada nas outras 7 rotas** — não é só
//     um aviso em prosa (ver `preVoo` abaixo).
//
// (c) SÓ ROTAS GET. POST/DELETE mudam estado — chamar
//     `POST /votacao/sessions` nos dois lados criaria sessão de verdade, na
//     Go no banco real do dono. Este script NUNCA chama rota de escrita.
//
// ⚠️ O COOKIE É CREDENCIAL: só entra via env var, nunca por flag (evita
// aparecer em `ps`/histórico do shell), nunca é logado, nunca é escrito em
// arquivo, nunca aparece no relatório de diferenças (o relatório mostra só
// os CORPOS das respostas, nunca os headers da requisição).
//
// Uso:
//   COOKIE_GO='piluvitu_session=...' \
//   COOKIE_RAMIELLE='better-auth.session_token=...' \
//     pnpm --filter @piluvitu/ramielle run comparar-com-go
//
// Exit code: 0 = as 8 rotas comparadas batem, de fato comparadas (nenhuma
// pulada, nenhuma "os dois recusaram igual"). 1 = alguma divergência real,
// alguma rota pulada, alguma rota não-comparada, ou falha ao executar a
// comparação (rede, JSON inválido, etc.). 2 = uso incorreto (opção/cookie
// ausente). 3 = pré-voo falhou (cookie inválido/expirado, ou conta sem
// admin, num dos dois lados ou nos dois).
//
// Zero dependência nova: `fetch` nativo do Node.
// ---------------------------------------------------------------------------

import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// ---------------------------------------------------------------------------
// 0. Total de rotas comparadas — usado como PISO explícito no relatório
//    (I2 da revisão), não derivado silenciosamente de `resultados.length`.
//    `GET /auth/me` (pré-voo) + `GET /votacao/sessions` + as 3 sem id
//    (categorias, admin/users, admin/backups) + as 3 com id (detalhe,
//    resultados, votos) = 8.
// ---------------------------------------------------------------------------

export const ROTAS_ESPERADAS = 8

// ---------------------------------------------------------------------------
// 1. Normalização — cada regra listada aqui, com o motivo. NENHUMA outra
//    normalização existe neste arquivo; tudo o mais é comparado byte a byte.
// ---------------------------------------------------------------------------

/**
 * Campos que legitimamente saem em DUAS representações de data equivalentes
 * — allowlist EXPLÍCITA (não um regex de sufixo "_at"/"At"), porque uma
 * regra de normalização "esperta demais" é exatamente o jeito deste tipo de
 * ferramenta mentir (ver cabeçalho do brief da task). Cada nome aqui é um
 * campo MEDIDO nas respostas reais dos endpoints comparados:
 *
 *   - `CreatedAt`/`ClosedAt` — PascalCase, saem em `session` (GET /sessions,
 *     GET /sessions/{id}) via sessionToWire (src/lib/wire.ts) e em `backups[]`
 *     (GET /admin/backups) via backupToWire.
 *   - `created_at` — snake_case, sai em `users[]` (GET /admin/users) e em
 *     `votes[]` (GET /sessions/{id}/votes).
 *
 * O MOTIVO da divergência de representação (não de VALOR) é conhecido e
 * documentado em apps/ramielle/CLAUDE.md § "closed_at vai ter DUAS
 * codificações": a Go grava `CURRENT_TIMESTAMP` (`2026-05-19 12:00:00`,
 * espaço) e serializa RFC3339 na leitura; o ramielle grava `nowIsoUtc()`
 * (`...T...Z`) e normaliza via `toIsoUtc` na leitura — os DOIS lados
 * deveriam convergir pro MESMO instante depois de lidos, mas a
 * representação intermediária pode variar conforme o dado foi gravado por
 * qual serviço originalmente (import preserva o valor cru da Go).
 */
const CAMPOS_DE_TIMESTAMP = new Set([
  'CreatedAt',
  'ClosedAt',
  'created_at',
])

/**
 * Normaliza um timestamp pro instante ISO canônico (`toISOString()`).
 * Reimplementação standalone de `src/lib/dates.ts#toIsoUtc` — este script
 * roda via `node` puro (sem loader de TypeScript), então não pode importar
 * de `src/`; a lógica é replicada, não redesenhada.
 *
 * Devolve `null` quando `valor` não é uma string de data reconhecível — o
 * CHAMADOR nunca trata "não consegui normalizar" como "são iguais": um
 * `null` aqui faz a comparação cair no caminho padrão (comparação literal),
 * nunca silencia a diferença.
 */
export function normalizarTimestamp(valor) {
  if (typeof valor !== 'string') return null
  const bruto = valor.trim()
  if (bruto === '') return null
  const comT = bruto.includes('T') ? bruto : bruto.replace(' ', 'T')
  const comZona = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(comT) ? comT : `${comT}Z`
  const data = new Date(comZona)
  if (Number.isNaN(data.getTime())) return null
  return data.toISOString()
}

// ---------------------------------------------------------------------------
// 2. Comparador profundo — puro, sem I/O. É o que o teste (Step 3) mutila
//    pra provar detecção.
// ---------------------------------------------------------------------------

function tipoDe(valor) {
  if (valor === undefined) return 'undefined'
  if (valor === null) return 'null'
  if (Array.isArray(valor)) return 'array'
  return typeof valor
}

/**
 * Compara `a` (Go) × `b` (ramielle) recursivamente, empilhando uma
 * mensagem legível em `divergencias` pra cada diferença encontrada.
 * `caminho` é só pra mensagem (ex.: "data.session.CreatedAt").
 *
 * Comportamento por tipo:
 *  - `undefined` de um lado só (chave ausente) × valor presente no outro:
 *    "campo ausente"/"campo extra" — NUNCA tratado como igual.
 *  - tipos diferentes (`null` × string, `object` × `array`, etc.): sempre
 *    diverge — é assim que `null` × `""` é pego (mesmo tipo primitivo
 *    "parecido" pro humano, tipos JS DIFERENTES: 'null' × 'string').
 *  - arrays: compara por ÍNDICE (a ordem já é paridade comprovada nas rotas
 *    portadas — ver apps/ramielle/CLAUDE.md — então uma ordem diferente
 *    aqui é ela mesma uma divergência real, não algo a tolerar).
 *  - objetos: união das chaves dos dois lados; campo de timestamp
 *    (allowlist acima) é normalizado ANTES de comparar, e só quando os DOIS
 *    lados normalizam com sucesso — senão cai no comparativo padrão.
 */
export function diffProfundo(caminho, a, b, divergencias) {
  if (a === b) return

  const tipoA = tipoDe(a)
  const tipoB = tipoDe(b)

  if (tipoA !== tipoB) {
    if (tipoA === 'undefined') {
      divergencias.push(
        `${caminho}: campo ausente na Go, presente no ramielle (${JSON.stringify(b)})`,
      )
      return
    }
    if (tipoB === 'undefined') {
      divergencias.push(
        `${caminho}: campo presente na Go (${JSON.stringify(a)}), ausente no ramielle`,
      )
      return
    }
    divergencias.push(
      `${caminho}: tipos diferentes — Go=${JSON.stringify(a)} (${tipoA}), ramielle=${JSON.stringify(b)} (${tipoB})`,
    )
    return
  }

  if (tipoA === 'array') {
    if (a.length !== b.length) {
      divergencias.push(
        `${caminho}: tamanho de array diferente — Go=${a.length}, ramielle=${b.length}`,
      )
    }
    const maior = Math.max(a.length, b.length)
    for (let i = 0; i < maior; i++) {
      diffProfundo(`${caminho}[${i}]`, a[i], b[i], divergencias)
    }
    return
  }

  if (tipoA === 'object') {
    const chaves = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const chave of chaves) {
      const subCaminho = `${caminho}.${chave}`
      const temA = Object.prototype.hasOwnProperty.call(a, chave)
      const temB = Object.prototype.hasOwnProperty.call(b, chave)

      if (!temA) {
        divergencias.push(
          `${subCaminho}: campo ausente na Go, presente no ramielle (${JSON.stringify(b[chave])})`,
        )
        continue
      }
      if (!temB) {
        divergencias.push(
          `${subCaminho}: campo presente na Go (${JSON.stringify(a[chave])}), ausente no ramielle`,
        )
        continue
      }

      if (
        CAMPOS_DE_TIMESTAMP.has(chave) &&
        typeof a[chave] === 'string' &&
        typeof b[chave] === 'string'
      ) {
        const normA = normalizarTimestamp(a[chave])
        const normB = normalizarTimestamp(b[chave])
        if (normA !== null && normB !== null) {
          if (normA !== normB) {
            divergencias.push(
              `${subCaminho} (timestamp, instantes diferentes): Go=${normA}, ramielle=${normB} (brutos: ${JSON.stringify(a[chave])} / ${JSON.stringify(b[chave])})`,
            )
          }
          continue
        }
        // Um dos dois não normalizou — cai pro comparativo padrão abaixo,
        // nunca silencia.
      }

      diffProfundo(subCaminho, a[chave], b[chave], divergencias)
    }
    return
  }

  // Primitivo (string/number/boolean) e `a !== b` já confirmado no topo.
  divergencias.push(`${caminho}: Go=${JSON.stringify(a)}, ramielle=${JSON.stringify(b)}`)
}

/**
 * `notifications[]` NUNCA passa pela normalização de timestamp (não tem
 * campo de data) — comparada campo a campo (`type`/`code`/`message`/
 * `field`), incluindo `message` SEMPRE literal. ⚠️ `apps/web` usa
 * `primary.message` direto em `toast.error` (`lib/votacao/api-client.ts`) —
 * uma mensagem diferente é uma tela diferente pro usuário. Já foi violado
 * nesta migração (10/10 mensagens divergiram numa fatia anterior, só a
 * revisão final pegou) — por isso `message` nunca é normalizada nem tratada
 * como "cosmética".
 *
 * ⚠️ **M2 da revisão: `field` também compara.** Antes deste fix round, uma
 * notification de erro de validação com `field:'title'` de um lado e
 * ausente (ou um `field` diferente) do outro passava batida — `data` usa
 * união de chaves pra isso, mas `notifications[]` comparava só 3 dos 4
 * campos do shape (`lib/envelope.ts`/`internal/httpx/respond.go`). Hoje é
 * ponto cego LATENTE (só `POST /votacao/sessions` emite `field`, e escrita
 * não é comparada por este harness) — corrigido mesmo assim, porque o valor
 * inteiro deste comparador é não ter pontos cegos conhecidos.
 */
function compararNotifications(notifsGo, notifsRamielle, divergencias) {
  const maior = Math.max(notifsGo.length, notifsRamielle.length)
  for (let i = 0; i < maior; i++) {
    const na = notifsGo[i]
    const nb = notifsRamielle[i]
    if (na === undefined) {
      divergencias.push(
        `notifications[${i}]: só existe no ramielle (${JSON.stringify(nb)})`,
      )
      continue
    }
    if (nb === undefined) {
      divergencias.push(
        `notifications[${i}]: só existe na Go (${JSON.stringify(na)})`,
      )
      continue
    }
    if (na.type !== nb.type) {
      divergencias.push(
        `notifications[${i}].type: Go=${JSON.stringify(na.type)}, ramielle=${JSON.stringify(nb.type)}`,
      )
    }
    if (na.code !== nb.code) {
      divergencias.push(
        `notifications[${i}].code: Go=${JSON.stringify(na.code)}, ramielle=${JSON.stringify(nb.code)}`,
      )
    }
    if (na.message !== nb.message) {
      divergencias.push(
        `notifications[${i}].message: Go=${JSON.stringify(na.message)}, ramielle=${JSON.stringify(nb.message)}`,
      )
    }
    if (na.field !== nb.field) {
      divergencias.push(
        `notifications[${i}].field: Go=${JSON.stringify(na.field)}, ramielle=${JSON.stringify(nb.field)}`,
      )
    }
  }
}

/** `2xx` — o único intervalo tratado como "a rota respondeu com sucesso". */
export function ehStatusDeSucesso(status) {
  return status >= 200 && status <= 299
}

/**
 * `resposta` é `{status, body}` — `body` já o envelope `{ok,data,notifications}`
 * decodificado (ou `null`, se a resposta não tinha corpo).
 *
 * Compara, nesta ordem: status HTTP, `ok`, `notifications[]` (type/code/
 * message/field, literal), e `data` (profundo, com a normalização seletiva
 * de timestamp). Devolve `{rota, estado, divergencias}` — nunca lança.
 *
 * `estado` é um de:
 *   - `'igual'`         — nenhuma divergência.
 *   - `'diff'`          — pelo menos uma divergência real (`divergencias`
 *                         não-vazio).
 *   - `'nao-comparado'` — **I1 da revisão (Important):** os dois lados
 *     recusaram de forma IDÊNTICA (status fora de `2xx` nos DOIS, e mesmo
 *     assim sem divergência nenhuma entre eles). Isto NÃO é "igual" — é
 *     evidência de que a RODADA é inválida (cookie expirado, conta sem
 *     admin, Sheets desligado nos dois lados, serviço fora do ar), não de
 *     que os dois serviços concordam em comportamento. Medido por
 *     reprodução: sem este estado, cookie expirado nos dois lados saía como
 *     `Resumo: 4/4 rotas iguais, 1 pulada` — ZERO rotas de fato comparadas,
 *     exit 0. A condição exige `divergencias.length === 0` (nunca
 *     confundida com um par assimétrico tipo 401×403 — isso ainda é
 *     `'diff'`, porque o status diverge e já teria caído em `divergencias`
 *     antes desta checagem).
 */
export function compararRespostas(nomeRota, respostaGo, respostaRamielle) {
  const divergencias = []

  if (respostaGo.status !== respostaRamielle.status) {
    divergencias.push(
      `status: Go=${respostaGo.status}, ramielle=${respostaRamielle.status}`,
    )
  }

  const okGo = respostaGo.body?.ok
  const okRamielle = respostaRamielle.body?.ok
  if (okGo !== okRamielle) {
    divergencias.push(`ok: Go=${JSON.stringify(okGo)}, ramielle=${JSON.stringify(okRamielle)}`)
  }

  compararNotifications(
    respostaGo.body?.notifications ?? [],
    respostaRamielle.body?.notifications ?? [],
    divergencias,
  )

  diffProfundo('data', respostaGo.body?.data ?? null, respostaRamielle.body?.data ?? null, divergencias)

  const ambosRecusaram =
    !ehStatusDeSucesso(respostaGo.status) && !ehStatusDeSucesso(respostaRamielle.status)

  if (ambosRecusaram && divergencias.length === 0) {
    return {
      rota: nomeRota,
      estado: 'nao-comparado',
      divergencias: [],
      motivo: `os dois lados recusaram de forma idêntica (status ${respostaGo.status}) — não prova paridade, só que os dois falham igual (cookie expirado? conta sem admin? dependência externa fora do ar nos dois lados?)`,
    }
  }

  return {
    rota: nomeRota,
    estado: divergencias.length === 0 ? 'igual' : 'diff',
    divergencias,
  }
}

// ---------------------------------------------------------------------------
// 3. Pré-voo — I1.2 da revisão. Roda ANTES de qualquer uma das 8
//    comparações: confirma que os DOIS cookies autenticam como ADMIN nos
//    dois lados via `GET /auth/me` (a rota de menor custo, e a que M3 pediu
//    pra entrar na comparação de qualquer forma — "vem de graça"). Aborta
//    cedo, sem gastar as outras 7 chamadas, nos dois cenários mais
//    prováveis de "verde falso": cookie expirado (401 nos dois) e conta
//    não-admin (403/`is_admin:false` nas admin-only).
// ---------------------------------------------------------------------------

/**
 * Devolve `{ok:true, go, ramielle}` (as duas respostas de `GET /auth/me`,
 * reaproveitadas pelo chamador como a comparação #1 do relatório) quando os
 * DOIS lados respondem `200` com `data.is_admin === true`; senão
 * `{ok:false, motivo}` com uma mensagem que cita QUAL lado falhou e PORQUE —
 * nunca o cookie (a mensagem só referencia status/`is_admin`, nunca o
 * cabeçalho da requisição).
 */
export async function preVoo(fetchImpl, goUrl, ramielleUrl, cookieGo, cookieRamielle) {
  const { go, ramielle } = await buscarPar(
    fetchImpl,
    goUrl,
    ramielleUrl,
    '/auth/me',
    cookieGo,
    cookieRamielle,
  )

  const problemas = []
  if (go.status !== 200) {
    problemas.push(
      `Go: GET /auth/me devolveu ${go.status} (esperado 200) — cookie provavelmente expirado/inválido.`,
    )
  }
  if (ramielle.status !== 200) {
    problemas.push(
      `ramielle: GET /auth/me devolveu ${ramielle.status} (esperado 200) — cookie provavelmente expirado/inválido.`,
    )
  }
  if (go.status === 200 && go.body?.data?.is_admin !== true) {
    problemas.push(
      'Go: a conta autenticada NÃO é admin (is_admin !== true) — a conta usada pro cookie precisa estar em ADMIN_EMAILS na Go.',
    )
  }
  if (ramielle.status === 200 && ramielle.body?.data?.is_admin !== true) {
    problemas.push(
      'ramielle: a conta autenticada NÃO é admin (is_admin !== true) — a conta usada pro cookie precisa estar em ADMIN_EMAILS no ramielle.',
    )
  }

  if (problemas.length > 0) {
    return { ok: false, motivo: problemas.join(' ') }
  }
  return { ok: true, go, ramielle }
}

// ---------------------------------------------------------------------------
// 4. I/O — chamadas HTTP e orquestração das 8 rotas. Só GET (acréscimo c).
// ---------------------------------------------------------------------------

/** As 3 rotas que não dependem de um id de sessão descoberto em tempo de execução. */
const ROTAS_SEM_ID = [
  ['GET /votacao/categorias', '/votacao/categorias'],
  ['GET /admin/users', '/admin/users'],
  ['GET /admin/backups', '/admin/backups'],
]

/** As 3 rotas de detalhe, nome + sufixo de caminho (a partir de `/votacao/sessions/<id>`). */
const SUFIXOS_ROTAS_COM_ID = [
  { nome: 'GET /votacao/sessions/{id}', sufixo: '' },
  { nome: 'GET /votacao/sessions/{id}/results', sufixo: '/results' },
  { nome: 'GET /votacao/sessions/{id}/votes', sufixo: '/votes' },
]

function rotasComId(id) {
  return SUFIXOS_ROTAS_COM_ID.map(({ nome, sufixo }) => [
    nome,
    `/votacao/sessions/${id}${sufixo}`,
  ])
}

/**
 * Chama `baseUrl + caminho` com o cookie dado. Lança se a resposta não for
 * JSON válido (envelope quebrado é, em si, uma divergência séria — não
 * silenciada como "resposta vazia").
 */
export async function chamar(fetchImpl, baseUrl, caminho, cookie) {
  const resposta = await fetchImpl(`${baseUrl}${caminho}`, {
    headers: cookie ? { cookie } : {},
  })
  const texto = await resposta.text()
  let body = null
  if (texto !== '') {
    try {
      body = JSON.parse(texto)
    } catch (err) {
      throw new Error(
        `${baseUrl}${caminho} (status ${resposta.status}) não devolveu JSON válido: ${err.message}`,
      )
    }
  }
  return { status: resposta.status, body }
}

async function buscarPar(fetchImpl, goUrl, ramielleUrl, caminho, cookieGo, cookieRamielle) {
  const [go, ramielle] = await Promise.all([
    chamar(fetchImpl, goUrl, caminho, cookieGo),
    chamar(fetchImpl, ramielleUrl, caminho, cookieRamielle),
  ])
  return { go, ramielle }
}

/**
 * Extrai o `ID` da primeira sessão devolvida por `GET /votacao/sessions` da
 * Go — usado como id real pras 3 rotas de detalhe (`/sessions/{id}`,
 * `/results`, `/votes`), em vez de exigir que o dono descubra e passe um id
 * manualmente. `null` quando não há nenhuma sessão (dataset vazio, ou a
 * própria chamada falhou) — as rotas de detalhe são então PULADAS (com
 * aviso explícito no relatório, uma entrada por rota — M6/I2 da revisão),
 * nunca comparadas com um id inventado.
 */
export function extrairPrimeiroIdDeSessao(bodyGo) {
  const sessions = bodyGo?.data?.sessions
  if (!Array.isArray(sessions) || sessions.length === 0) return null
  const id = sessions[0]?.ID
  return typeof id === 'number' ? id : null
}

/**
 * Roda o pré-voo e, se ele passar, as 8 comparações (Step 1 + M3 + I1.2).
 * Devolve `{ok:false, motivo}` quando o pré-voo falha (nenhuma das 8
 * chamadas é feita) ou `{ok:true, resultados}` com a lista de resultados —
 * cada um `{rota, estado, divergencias}` (`estado` = `'igual'`/`'diff'`/
 * `'nao-comparado'`) ou `{rota, estado:'pulada', divergencias:[], motivo}`
 * (uma entrada POR rota pulada, nunca uma agregada — I2 da revisão: sem
 * isto, `ROTAS_ESPERADAS` deixa de bater com `resultados.length` quando
 * faltam sessões, e o piso fica difícil de verificar).
 */
export async function executarComparacao(opts, deps = {}) {
  const { fetchImpl = fetch } = deps
  const { goUrl, ramielleUrl, cookieGo, cookieRamielle } = opts

  const resultadoPreVoo = await preVoo(fetchImpl, goUrl, ramielleUrl, cookieGo, cookieRamielle)
  if (!resultadoPreVoo.ok) {
    return { ok: false, motivo: resultadoPreVoo.motivo }
  }

  const resultados = []

  // M3 — GET /auth/me "vem de graça" do pré-voo: é o GET de maior risco de
  // shape desta migração (o único que atravessa os dois sistemas de auth
  // diferentes), e já foi chamado acima só pra gating. Reaproveitado aqui
  // como a comparação #1, em vez de descartado.
  resultados.push(compararRespostas('GET /auth/me', resultadoPreVoo.go, resultadoPreVoo.ramielle))

  const parSessions = await buscarPar(
    fetchImpl,
    goUrl,
    ramielleUrl,
    '/votacao/sessions',
    cookieGo,
    cookieRamielle,
  )
  resultados.push(
    compararRespostas('GET /votacao/sessions', parSessions.go, parSessions.ramielle),
  )

  for (const [nome, caminho] of ROTAS_SEM_ID) {
    const par = await buscarPar(fetchImpl, goUrl, ramielleUrl, caminho, cookieGo, cookieRamielle)
    resultados.push(compararRespostas(nome, par.go, par.ramielle))
  }

  const idSessao = extrairPrimeiroIdDeSessao(parSessions.go.body)
  if (idSessao === null) {
    const motivo =
      'PULADO — a Go não devolveu nenhuma sessão em /votacao/sessions (dataset vazio, ou a chamada falhou). Rode o import da Task 3 antes de comparar.'
    for (const { nome } of SUFIXOS_ROTAS_COM_ID) {
      resultados.push({ rota: nome, estado: 'pulada', divergencias: [], motivo })
    }
  } else {
    for (const [nome, caminho] of rotasComId(idSessao)) {
      const par = await buscarPar(fetchImpl, goUrl, ramielleUrl, caminho, cookieGo, cookieRamielle)
      resultados.push(compararRespostas(nome, par.go, par.ramielle))
    }
  }

  return { ok: true, resultados }
}

// ---------------------------------------------------------------------------
// 5. Relatório (Step 2) — legível, nunca ecoa cookie/header nenhum (só os
//    CORPOS das respostas, que é o que `compararRespostas` já devolve).
// ---------------------------------------------------------------------------

/**
 * `esperado` é o PISO explícito (I2 da revisão) — por default `ROTAS_ESPERADAS`
 * (8), nunca derivado silenciosamente de `resultados.length` (que um bug de
 * orquestração poderia encolher sem que ninguém notasse). Devolve
 * `{texto, deveFalhar}`: `deveFalhar` é `true` quando há QUALQUER divergência
 * real, QUALQUER rota não-comparada (os dois recusaram igual), QUALQUER
 * rota pulada, OU quando NADA foi de fato comparado (`comparadas.length ===
 * 0`) — uma rodada que não validou nada não é evidência de paridade
 * nenhuma. Antes deste fix round só o primeiro caso zerava o exit code;
 * provado por mutação (ver o relatório da task) que os outros três
 * produziam `exit 0` silenciosamente.
 */
export function formatarRelatorio(resultados, esperado = ROTAS_ESPERADAS) {
  const linhas = []
  for (const r of resultados) {
    if (r.estado === 'pulada') {
      linhas.push(`AVISO ${r.rota}`)
      linhas.push(`      ${r.motivo}`)
      continue
    }
    if (r.estado === 'nao-comparado') {
      linhas.push(`NAO-COMPARADO ${r.rota}`)
      linhas.push(`      ${r.motivo}`)
      continue
    }
    if (r.estado === 'igual') {
      linhas.push(`OK    ${r.rota}`)
      continue
    }
    linhas.push(`DIFF  ${r.rota}`)
    for (const d of r.divergencias) {
      linhas.push(`      - ${d}`)
    }
  }

  const comparadas = resultados.filter((r) => r.estado === 'igual' || r.estado === 'diff')
  const divergentes = resultados.filter((r) => r.estado === 'diff')
  const naoComparadas = resultados.filter((r) => r.estado === 'nao-comparado')
  const puladas = resultados.filter((r) => r.estado === 'pulada')

  linhas.push('')
  linhas.push(
    `Resumo: ${comparadas.length - divergentes.length}/${comparadas.length} rotas iguais` +
      ` — esperado ${esperado}, comparadas ${comparadas.length}` +
      (naoComparadas.length > 0 ? `, não-comparadas ${naoComparadas.length}` : '') +
      (puladas.length > 0 ? `, puladas ${puladas.length}` : '') +
      '.',
  )

  const deveFalhar =
    divergentes.length > 0 ||
    naoComparadas.length > 0 ||
    puladas.length > 0 ||
    comparadas.length === 0

  return { texto: linhas.join('\n'), deveFalhar }
}

// ---------------------------------------------------------------------------
// 6. CLI
// ---------------------------------------------------------------------------

/** M4 da revisão — sufixo obrigatório, o MESMO que o `.gitignore` cobre (`*.report.txt`). */
const SUFIXO_RELATORIO_OBRIGATORIO = '.report.txt'

export function parseArgs(argv) {
  const args = {
    goUrl: 'http://localhost:8080',
    ramielleUrl: 'http://localhost:8788',
    relatorio: undefined,
    help: false,
    error: null,
  }

  for (let i = 0; i < argv.length; i++) {
    const atual = argv[i]
    if (atual === '--help' || atual === '-h') {
      args.help = true
      continue
    }
    if (atual === '--go-url') {
      const valor = argv[i + 1]
      if (valor === undefined) {
        args.error = `a opção ${atual} precisa de um valor`
        return args
      }
      args.goUrl = valor
      i++
      continue
    }
    if (atual === '--ramielle-url') {
      const valor = argv[i + 1]
      if (valor === undefined) {
        args.error = `a opção ${atual} precisa de um valor`
        return args
      }
      args.ramielleUrl = valor
      i++
      continue
    }
    if (atual === '--relatorio') {
      const valor = argv[i + 1]
      if (valor === undefined) {
        args.error = `a opção ${atual} precisa de um valor`
        return args
      }
      // M4 — força o sufixo em vez de só avisar: um caminho que não bate
      // com o glob do .gitignore (`*.report.txt`) nasceria RASTREÁVEL por
      // padrão, e o relatório carrega e-mail/nome de quem votou (rotas
      // admin). Recusar aqui é mais forte que confiar em quem digita o
      // comando lembrar da convenção.
      if (!valor.endsWith(SUFIXO_RELATORIO_OBRIGATORIO)) {
        args.error = `--relatorio precisa terminar em "${SUFIXO_RELATORIO_OBRIGATORIO}" (o padrão que o .gitignore cobre) — recebido "${valor}"`
        return args
      }
      args.relatorio = valor
      i++
      continue
    }
    args.error = `opção desconhecida: ${atual}`
    return args
  }

  return args
}

function usage() {
  return `Uso: COOKIE_GO='...' COOKIE_RAMIELLE='...' node scripts/comparar-com-go.mjs [opções]

Compara 8 rotas GET (auth/votação/admin) entre a API Go (apps/api) e o
Worker ramielle rodando localmente, com os MESMOS dados (ver o cabeçalho
deste arquivo pro pré-requisito de import). Só leitura — nunca chama rota
de escrita, nunca usa --remote.

Antes de comparar, roda um PRÉ-VOO (GET /auth/me nos dois lados): aborta
com exit 3 se qualquer lado não responder 200+admin — em vez de deixar
"cookie expirado"/"conta sem admin" virar um falso "tudo igual" nas rotas
seguintes.

Variáveis de ambiente OBRIGATÓRIAS (nunca por flag — evita cookie em
histórico de shell/\`ps\`):
  COOKIE_GO         Cabeçalho Cookie inteiro de uma sessão ADMIN na Go.
  COOKIE_RAMIELLE   Cabeçalho Cookie inteiro de uma sessão ADMIN no ramielle.

Opções:
  --go-url <url>        Base URL da Go (default: http://localhost:8080)
  --ramielle-url <url>  Base URL do ramielle (default: http://localhost:8788)
  --relatorio <arquivo> Também grava o relatório neste caminho — TEM que
                        terminar em "${SUFIXO_RELATORIO_OBRIGATORIO}" (mesmo padrão do
                        .gitignore; default: só imprime no stdout). ⚠️ O
                        relatório pode conter e-mail/nome de quem votou
                        (rotas admin) — nunca commitar.
  --help, -h            Mostra esta ajuda

Exit code: 0 = as 8 rotas comparadas batem de verdade. 1 = alguma
divergência, rota pulada, rota não-comparada, ou nada foi comparado, ou
falha ao comparar. 2 = uso incorreto. 3 = pré-voo falhou.
`
}

export async function run(argv, deps = {}) {
  const {
    log = console.log,
    logError = console.error,
    fetchImpl = fetch,
    env = process.env,
    executarComparacaoImpl = executarComparacao,
  } = deps

  const args = parseArgs(argv)
  if (args.help) {
    log(usage())
    return 0
  }
  if (args.error) {
    logError(`erro: ${args.error}`)
    log(usage())
    return 2
  }

  const cookieGo = env.COOKIE_GO
  const cookieRamielle = env.COOKIE_RAMIELLE
  if (!cookieGo || !cookieRamielle) {
    logError(
      'erro: defina COOKIE_GO e COOKIE_RAMIELLE (o cabeçalho Cookie inteiro de uma sessão ADMIN em cada lado — ver --help).',
    )
    log(usage())
    return 2
  }

  log(`==> comparando ${args.goUrl} (Go) x ${args.ramielleUrl} (ramielle)`)

  let resultado
  try {
    resultado = await executarComparacaoImpl(
      { goUrl: args.goUrl, ramielleUrl: args.ramielleUrl, cookieGo, cookieRamielle },
      { fetchImpl },
    )
  } catch (err) {
    logError(`erro ao comparar: ${err.message}`)
    return 1
  }

  if (!resultado.ok) {
    logError(`erro: pré-voo falhou — ${resultado.motivo}`)
    log('')
    log(
      'Corrija a autenticação (relogue nos dois serviços, confirme ADMIN_EMAILS nos dois lados) e rode de novo.',
    )
    return 3
  }

  const { texto, deveFalhar } = formatarRelatorio(resultado.resultados)
  log(texto)

  if (args.relatorio) {
    try {
      writeFileSync(args.relatorio, `${texto}\n`)
      log('')
      log(`==> relatório também gravado em ${args.relatorio}`)
    } catch (err) {
      logError(`erro: não consegui gravar "${args.relatorio}": ${err.message}`)
      return 1
    }
  }

  return deveFalhar ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const codigoDeSaida = await run(process.argv.slice(2))
  process.exitCode = codigoDeSaida
}
