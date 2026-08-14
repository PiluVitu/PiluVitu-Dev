/**
 * Factory do Better Auth para o Worker ramielle. Login social Google, D1
 * nativo (env.DB, sem adapter de terceiro — o adapter Kysely embutido
 * detecta o binding por duck-typing e monta seu próprio D1SqliteDialect,
 * mesmo mecanismo já medido em apps/financas/src/lib/auth.ts).
 *
 * ⚠️ A DIFERENÇA QUE DECIDE ESTE ARQUIVO, em relação ao espelho do finanças:
 * a votação é LIVRE (spec §7). O finanças é fail-closed de usuário único
 * (`databaseHooks.user.create.before` bloqueando todo e-mail fora de
 * `ALLOWED_EMAIL`) — aqui NÃO existe esse hook. Copiar o hook do finanças
 * bloquearia todo mundo menos o dono e mataria a feature: a votação existe
 * para várias pessoas, qualquer conta Google entra e vota.
 *
 * Quem decide ADMIN é `isAdminEmail` (abaixo) — exportada, e
 * DELIBERADAMENTE NÃO usada dentro de `createAuth`. O guard de admin roda a
 * cada request (Task 4), não na criação do usuário: o Better Auth não tem
 * noção de allowlist fora do hook de criação, então um privilégio gravado
 * no cadastro não acompanharia uma troca de `ADMIN_EMAILS` feita depois.
 */
import { betterAuth } from 'better-auth'
import { allowedOrigins } from './cors'

export type AuthBindings = {
  DB: D1Database
  BETTER_AUTH_URL: string
  BETTER_AUTH_SECRET: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  /**
   * ⚠️ CSV DE VERDADE aqui — ao contrário do `ALLOWED_EMAIL` do finanças
   * (um e-mail só, comparação de string inteira, CSV não casa com nada). O
   * Go (`apps/api`) sempre tratou `ADMIN_EMAILS` como lista; `isAdminEmail`
   * abaixo espelha esse contrato. Não carregar o hábito do finanças pra cá.
   */
  ADMIN_EMAILS: string
  /**
   * A MESMA binding que `index.ts#Bindings` já declara pro CORS
   * (`lib/cors.ts#allowedOrigins`) — repetida no tipo aqui (não na
   * documentação: o contrato de formato/default é só em `cors.ts`) porque
   * `createAuth` agora lê este valor pra montar `trustedOrigins` (I2 da
   * revisão final, ver o comentário na config abaixo). Opcional pelo mesmo
   * motivo de lá: `undefined` em runtime quando a binding não está setada.
   */
  CORS_ALLOWED_ORIGINS?: string
  /**
   * Fatia ③, Task 2 — as três bindings do cliente do Sheets
   * (`lib/gsheets.ts`, consumido por `GET /votacao/categorias` em
   * `routes/votacao.ts`). Vivem aqui pelo MESMO motivo de
   * `CORS_ALLOWED_ORIGINS` acima: `AuthBindings` é, na prática, o tipo
   * `Bindings` inteiro do Worker (`index.ts` faz `export type Bindings =
   * AuthBindings`), não só o que `createAuth` usa — não vale a pena um
   * segundo tipo só pra três campos. Todas OPCIONAIS: `undefined` em
   * runtime é o estado normal até o dono rodar `wrangler secret put` (ver
   * `apps/ramielle/CLAUDE.md` § Pendências do dono). A rota trata a
   * ausência de `GOOGLE_SA_JSON` OU `GSHEETS_MOVIES_SPREADSHEET_ID` como
   * "sheets desligado" (503 `sheets_disabled`) — mesma paridade do Go
   * (`cmd/api/main.go:61-72`: sem `GSHEETS_MOVIES_SPREADSHEET_ID`, o
   * cliente nunca é construído; o handler responde 503 quando é `nil`).
   */
  /** O JSON INTEIRO da service account — nunca `vars` do wrangler.jsonc (texto claro commitado), sempre `wrangler secret put`. */
  GOOGLE_SA_JSON?: string
  GSHEETS_MOVIES_SPREADSHEET_ID?: string
  /** Default `'A2:F'` aplicado em `routes/votacao.ts` quando ausente/vazia — mesmo fallback do Go (`cmd/api/main.go:63-65`). */
  GSHEETS_MOVIES_RANGE?: string
  /**
   * Fatia do Atelier — o serviço promeia (Python, no MacBook do dono, atrás
   * do túnel), que faz a inferência de `proofread`/`refine`.
   *
   * ⚠️ `PROMEIA_TOKEN` é **secret**, nunca `vars` do `wrangler.jsonc` (texto
   * claro, commitado). É ele que impede que qualquer um que descubra o
   * hostname do túnel rode inferência na GPU do dono (§3 do spec) — e o
   * navegador NUNCA o vê, porque o fluxo é navegador → ramielle → promeia.
   *
   * Opcionais pelo mesmo motivo das bindings acima: ausentes é o estado
   * normal até o `wrangler secret put`. Sem as duas, as rotas do Atelier
   * respondem `503 promeia_disabled` — feature desligada, não quebrada
   * (mesmo padrão do `sheets_disabled`).
   */
  PROMEIA_URL?: string
  PROMEIA_TOKEN?: string
  /**
   * Fatia ③, Task 4 — chave do TMDb (`lib/tmdb.ts`, consumida por `POST
   * /votacao/sessions`). Opcional pelo MESMO motivo das três de cima:
   * ausente é o estado normal até `wrangler secret put TMDB_API_KEY`. Sem
   * ela, a rota cria a sessão SEM buscar pôsteres — nunca um erro (mesma
   * paridade do Go: `h.deps.Posters == nil` faz `fetchPosters` devolver os
   * filmes sem pôster/tmdbId, `handlers/votacao/sessions.go:124-129`).
   */
  TMDB_API_KEY?: string
  /**
   * Fatia de distribuição de artigo (`.superpowers/sdd/2026-08-13-ramielle-distribuicao/`,
   * Task 4) — as 7 credenciais dos 4 adapters de plataforma
   * (`lib/publishers/{devto,hashnode,bluesky,mastodon}.ts`), lidas por
   * `routes/distribution.ts#montarPublishers`. TODAS opcionais — ausente é
   * o estado normal até `wrangler secret put <NOME>` (ver `apps/ramielle/CLAUDE.md`
   * § Pendências do dono). **NENHUMA vai em `wrangler.jsonc#vars`** — são
   * credenciais de terceiro (texto claro commitado seria uma exposição
   * real), sempre `wrangler secret put`, mesmo padrão de `PROMEIA_TOKEN`/
   * `TMDB_API_KEY` acima.
   *
   * ⚠️ **Armadilha 9 do plano da fatia — replicada de propósito, não
   * endurecer.** MEDIDO em `apps/api/cmd/api/main.go:93-105`: das 3
   * plataformas que precisam de DUAS credenciais (Hashnode, Bluesky,
   * Mastodon), o Go só valida a PRIMEIRA (`HASHNODE_API_TOKEN`,
   * `BLUESKY_HANDLE`, `MASTODON_INSTANCE_URL`) antes de construir o
   * publisher — a segunda pode estar ausente/vazia e o publisher é
   * construído do mesmo jeito, falhando só na hora de publicar de verdade.
   * Exigir as duas mudaria comportamento OBSERVÁVEL (uma plataforma
   * "meio-configurada" deixaria de contar pro `len(pubs) > 0`/`pubs.length
   * === 0` que decide `503 distribution_unavailable`).
   */
  DEVTO_API_KEY?: string
  HASHNODE_API_TOKEN?: string
  /** Segunda credencial do Hashnode — NÃO validada isoladamente, ver a armadilha 9 acima. */
  HASHNODE_PUBLICATION_ID?: string
  BLUESKY_HANDLE?: string
  /** Segunda credencial do Bluesky — NÃO validada isoladamente, ver a armadilha 9 acima. */
  BLUESKY_APP_PASSWORD?: string
  MASTODON_INSTANCE_URL?: string
  /** Segunda credencial do Mastodon — NÃO validada isoladamente, ver a armadilha 9 acima. */
  MASTODON_ACCESS_TOKEN?: string
}

/**
 * DESVIO DELIBERADO do brief: `ReturnType<typeof betterAuth>` cru resolve
 * para `Auth<BetterAuthOptions>` (o genérico na sua constraint mais larga),
 * não para o tipo específico desta config — MEDIDO e documentado em
 * apps/financas/src/lib/auth.ts (`tsc --noEmit` nas duas direções: os dois
 * tipos são mutuamente não-atribuíveis, por invariância). Mesma correção
 * aqui: `Auth` referencia `ReturnType<typeof createAuth>` (hoisting de tipo
 * cobre a referência), e `createAuth` não anota retorno explícito (evita a
 * referência circular).
 */
export type Auth = ReturnType<typeof createAuth>

/**
 * `ADMIN_EMAILS` é CSV: `"a@x.com,b@x.com"`. Comparação por e-mail
 * individual (trim + lowercase), igual ao Go — nunca string inteira como o
 * `ALLOWED_EMAIL` do finanças. Fail-closed: CSV vazio/ausente não admite
 * ninguém (`undefined` é o valor real em runtime de uma binding não
 * setada — o tipo `string` é só uma promessa de compile-time).
 *
 * Exportada e NUNCA chamada dentro de `createAuth` — ver o comentário no
 * topo do arquivo. `isAdminEmail` é consumida pelo guard de request da
 * Task 4, a cada chamada, contra o valor CORRENTE de `ADMIN_EMAILS`.
 */
export function isAdminEmail(
  email: string | null | undefined,
  csv: string | undefined,
): boolean {
  if (typeof email !== 'string') return false
  const alvo = email.trim().toLowerCase()
  if (alvo.length === 0) return false

  const lista = (csv ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0)

  return lista.includes(alvo)
}

/**
 * Memoização por identidade do objeto `env` — mesmo raciocínio MEDIDO em
 * apps/financas/src/lib/auth.ts: montar a instância (schemas zod + pipeline
 * de plugins) custa CPU, e o teto do free tier é 10 ms/invocação.
 * `WeakMap` (não variável solta) porque o `env` de teste é outro objeto do
 * `env` de produção — chaveado pelo objeto, um não envenena o outro, e nada
 * vaza quando o isolate morre. `env` tem identidade estável entre requests
 * do mesmo isolate (medido no finanças, spike S6b, via `SELF.fetch`).
 */
const instancias = new WeakMap<AuthBindings, Auth>()

export function getAuth(env: AuthBindings): Auth {
  const quente = instancias.get(env)
  if (quente) return quente
  const nova = createAuth(env)
  instancias.set(env, nova)
  return nova
}

// Sem anotação de retorno de propósito: ver o comentário de `Auth` acima.
export function createAuth(env: AuthBindings) {
  // MEDIDO contra o pacote instalado (better-auth@1.6.25,
  // dist/context/create-context.mjs:70-80, mesma medição já documentada no
  // finanças): SEM secret, o Better Auth NÃO lança — cai pro default
  // hardcoded no PRÓPRIO PACOTE ('better-auth-secret-12345678901234567890')
  // e só lançaria depois (validateSecret) se `isProduction` fosse `true`,
  // o que NUNCA acontece num Worker (não há `NODE_ENV`). Sem este guard
  // explícito, esquecer `wrangler secret put BETTER_AUTH_SECRET`
  // publicaria em produção assinando toda sessão e todo cookie de
  // state/PKCE do OAuth com essa constante pública no código-fonte da lib
  // — deploy e login pareceriam saudáveis, sem erro nem log.
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error(
      'BETTER_AUTH_SECRET ausente — configure via `wrangler secret put BETTER_AUTH_SECRET` (produção) ou `.dev.vars` (local). O Better Auth não falha sozinho nesse caso.',
    )
  }

  return betterAuth({
    // Binding cru: o adapter Kysely detecta D1 por duck-typing
    // ('batch' in db && 'exec' in db && 'prepare' in db) e monta o
    // D1SqliteDialect interno. Não existe adapter para instalar.
    database: env.DB,

    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,

    // ⚠️ Explícito, não default — MEDIDO no finanças: sem config,
    // `trustedOrigins` é SÓ a origem de `BETTER_AUTH_URL`
    // (better-auth/dist/context/helpers.mjs:72-75). O apps/web vive numa
    // origem DIFERENTE da API (ramielle.piluvitu.com.br vs. piluvitu.com.br) —
    // sem esta linha, `POST /api/auth/sign-in/social` chamado a partir do
    // apps/web responde 403 (origem não confiável) e o login nunca
    // completa.
    //
    // I2 (revisão final): a lista de origens ERA hardcoded aqui
    // (`['https://piluvitu.com.br', 'http://localhost:3333']`), duplicando
    // a mesma decisão que `lib/cors.ts#allowedOrigins`/`wrangler.jsonc#vars.
    // CORS_ALLOWED_ORIGINS` já tomam pro CORS — duas fontes de verdade pra
    // "quem pode falar com este Worker" que já tinham divergido em produção
    // (o CORS foi apertado pra só `piluvitu.com.br`, esta lista continuou
    // com `localhost` incluso). ⚠️ Isto NÃO era "paridade com o Go" — a Go
    // em produção TAMBÉM não aceita localhost (`infra/docker-compose.yml`
    // sobrescreve `CORS_ALLOWED_ORIGINS` só com a origem de produção); a
    // suposta paridade nunca existiu, era só as duas listas deste Worker
    // divergindo entre si. Corrigido derivando UMA lista da outra, em vez
    // de mantê-las separadas: `allowedOrigins()` já resolve exatamente o
    // que este Worker aceita (default com localhost em dev, só
    // `piluvitu.com.br` quando `CORS_ALLOWED_ORIGINS` de produção está
    // setada) — `trustedOrigins` passa a ser sempre um superconjunto do que
    // o CORS já permite, nunca divergente dele.
    trustedOrigins: [
      env.BETTER_AUTH_URL,
      ...allowedOrigins(env.CORS_ALLOWED_ORIGINS),
    ],

    // MEDIDO no finanças (mesma versão da lib): o default do rate limit é
    // `enabled: options.rateLimit?.enabled ?? isProduction`
    // (create-context.mjs:171) — e `isProduction` é SEMPRE falso num
    // Worker (não há `NODE_ENV`). Sem `enabled: true` explícito, o rate
    // limit fica DESLIGADO em produção pra sempre.
    //
    // ⚠️ Aqui isso é MAIS crítico que no finanças: a votação é LIVRE —
    // qualquer conta Google passa a poder criar linha em `user`/`account`
    // neste D1, não só o dono. Sem throttle, um script sem sessão nenhuma
    // esgota a cota diária de escrita do D1 free tier (100k/dia) e a de
    // requests do Worker (100k/dia). Os valores abaixo são os mesmos
    // herdados do finanças, não afrouxados.
    //
    // ⚠️ I4 (revisão final): CORRIGIDO — este rateLimit é a ÚNICA barreira
    // só pra `/api/auth/*` (onde ele de fato roda, no `onRequest` do router
    // do Better Auth). Ele NÃO cobre `/auth/me`/`/auth/logout` nem as rotas
    // de votação da fatia ②: `lib/session.ts#resolveSession` chama
    // `auth.api.getSession(...)` DIRETO (a chamada programática, não
    // `auth.handler(...)`), que nunca passa pelo `onRequest` — mesmo achado
    // já documentado no `apps/financas/CLAUDE.md`. Toda rota GUARDADA por
    // `requireAuth`/`requireAdmin` roda sem throttle nenhum.
    //
    // Some-se a isto: TODO request autenticado é uma ESCRITA no D1, não só
    // uma leitura — 4 operações (`getSession`, `buscarGoogleSub`, o upsert
    // INCONDICIONAL de `upsertVotacaoUser`, e o SELECT de volta), sendo a
    // do upsert uma escrita sempre (mesmo quando nada mudou — ver
    // `domain/users.ts`). Com a votação livre, uma conta descartável
    // batendo em `/auth/me` sem limite gera 1 row-written por request.
    //
    // ⚠️ NÃO tornar o upsert condicional pra "economizar" essa escrita:
    // `ON CONFLICT DO UPDATE ... WHERE <nada mudou>` faz `RETURNING id` NÃO
    // devolver linha, e `upsertVotacaoUser` lança nesse caso (ver
    // `domain/users.ts`). Isto é decisão de fatia futura, não desta leva.
    rateLimit: {
      enabled: true,
      // window em SEGUNDOS (unidade do próprio Better Auth).
      //
      // ⚠️ Este par NÃO governa `/sign-in/*` — o Better Auth tem uma regra
      // especial embutida por prefixo de rota, com precedência sobre esta
      // config: `/sign-in` roda com window 10 / max 3
      // (rate-limiter/index.mjs:370-383). O bloco abaixo cobre o resto
      // (`get-session`, `callback`, etc.).
      window: 60,
      max: 20,
      // `/get-session` sozinho divide o balde de 20/60s acima com toda
      // rota que NÃO é `/sign-in*` (customRules não filtra por método,
      // chave é (ip, path) — rate-limiter/index.mjs:274-322) — mesmo
      // achado MEDIDO no finanças. Um front chamando `get-session` no
      // mount + a cada foco de aba esgota os 20 rápido; aqui, com votação
      // livre, isso vale ainda mais (mais usuários reais chamando a mesma
      // rota).
      customRules: {
        '/get-session': { window: 60, max: 120 },
      },
      // 'memory': única opção sem schema novo (migration é forward-only).
      //
      // ⚠️ É POR ISOLATE, não um contador global — mitigação PARCIAL, não
      // um teto rígido de tráfego (mesma ressalva do finanças).
      storage: 'memory',
    },

    // MEDIDO no finanças: sem isto, o Better Auth cai pra um bucket
    // ÚNICO e GLOBAL por rota (a lista default de headers pra resolver IP
    // é só `['x-forwarded-for']`, que não inclui `cf-connecting-ip`) — o
    // que tornaria o rateLimit acima inútil como defesa por-atacante:
    // qualquer votante real e um script malicioso dividiriam o MESMO
    // balde. `CF-Connecting-IP` é setado pela borda da Cloudflare e
    // sobrescrito antes do Worker rodar — não forjável pelo requisitante.
    advanced: {
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip'],
      },
    },

    telemetry: { enabled: false },
    emailAndPassword: { enabled: false },

    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        prompt: 'select_account',
      },
    },

    // NENHUM databaseHooks aqui — de propósito. Ver o comentário no topo
    // do arquivo: a votação é livre, qualquer e-mail Google completa o
    // cadastro. Não copiar o hook de allowlist do finanças.
  })
}
