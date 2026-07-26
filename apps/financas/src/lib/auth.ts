/**
 * Factory do Better Auth para o Worker de finanças. Login social Google,
 * D1 nativo (env.DB, sem adapter de terceiro — o adapter Kysely embutido
 * detecta o binding por duck-typing e monta seu próprio D1SqliteDialect).
 * Single-user: databaseHooks.user.create.before é a 1ª de duas camadas de
 * allowlist (a 2ª, sobre sessão já existente, é decidirAcesso em
 * session.ts, Task 3).
 */
import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'

export type AuthBindings = {
  DB: D1Database
  BETTER_AUTH_URL: string
  BETTER_AUTH_SECRET: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  ALLOWED_EMAIL: string
}

/**
 * DESVIO DELIBERADO do brief: `ReturnType<typeof betterAuth>` cru resolve
 * para `Auth<BetterAuthOptions>` (o genérico na sua constraint mais larga,
 * já que `betterAuth` não está aplicado a nenhum argumento ali). O objeto
 * de config passado dentro de `createAuth` é um literal mais específico que
 * `BetterAuthOptions` (`database` obrigatório onde lá é opcional, entre
 * outras diferenças), e `Auth<T>` usa `T` em posição contravariante (via
 * `DBAdapter<T>`/`PluginContext<T>`).
 *
 * MEDIDO (`tsc --noEmit` com um arquivo de teste descartável, as duas
 * direções): `Auth<{...literal...}>` NÃO é atribuível a
 * `Auth<BetterAuthOptions>` ("$context incompatível") — e a volta também
 * falha (`Auth<BetterAuthOptions>` não é atribuível a `Auth<{...literal}>`,
 * "database é opcional lá, obrigatório aqui"). NÃO é uma relação de
 * subtipo onde um é "mais específico" que o outro — os dois tipos são
 * MUTUAMENTE não-atribuíveis (invariância, não covariância/contravariância
 * limpa). Consequência prática pra quem for tipar uma segunda instância ou
 * um mock: anotar com `Auth` (este alias) só funciona pra algo que veio de
 * `createAuth`/`betterAuth` com ESTA MESMA config literal — um valor tipado
 * como `ReturnType<typeof betterAuth>` cru, ou uma instância com config
 * diferente, não se atribui aqui mesmo sendo "outro Better Auth".
 *
 * `ReturnType<typeof createAuth>`, declarado abaixo da função (hoisting de
 * tipo cobre a referência), captura o tipo específico que `betterAuth`
 * realmente infere para ESTA config — sem essa troca o arquivo não compila.
 */
export type Auth = ReturnType<typeof createAuth>

/**
 * A mensagem do APIError VIRA o código de erro na URL: o callback faz
 * result.error.split(' ').join('_') e redireciona para
 * <errorCallbackURL>?error=<mensagem>. Por isso é slug: minúsculo, sem
 * acento, sem espaço.
 */
export const CODIGO_BARRADO = 'nao_autorizado'

/**
 * Fail closed, igual ao requireAccess que saiu: allowlist vazia barra todo
 * mundo.
 *
 * ⚠️ `permitido` (`ALLOWED_EMAIL`) é UM e-mail só, NUNCA uma lista CSV — ao
 * contrário do `ACCESS_ALLOWED_EMAILS` que esta variável substitui
 * (CSV, `.split(',')` em `index.ts`, ver `access.ts`). A comparação abaixo é
 * de STRING INTEIRA: `isAllowedEmail('dono@exemplo.com',
 * 'dono@exemplo.com,outro@exemplo.com')` dá `false` — o dono fica barrado
 * também, não só o e-mail estranho. Continua fail-closed (não é brecha de
 * segurança), mas o sintoma na prática é indistinguível de "o login do
 * Google quebrou": nenhum e-mail passa, nem o certo. Se um dia isto
 * precisar de mais de um e-mail, é uma troca deliberada de assinatura
 * (`permitido: string[]`), não um `.split(',')` encaixado aqui por hábito
 * do módulo anterior.
 */
export function isAllowedEmail(email: unknown, permitido: string): boolean {
  const alvo = (permitido ?? '').trim().toLowerCase()
  if (alvo.length === 0) return false
  return typeof email === 'string' && email.trim().toLowerCase() === alvo
}

export function assertEmailPermitido(email: unknown, permitido: string): void {
  if (!isAllowedEmail(email, permitido)) {
    throw new APIError('FORBIDDEN', { message: CODIGO_BARRADO })
  }
}

/**
 * Memoização por identidade do objeto `env`. Motivo: o teto do free tier é
 * 10 ms de CPU por invocação, e construir a instância envolve montar
 * schemas zod e o pipeline de plugins. WeakMap (e não variável solta)
 * porque o env do teste é um objeto diferente do env de produção: chaveado
 * pelo objeto, um não envenena o outro, e nada vaza quando o isolate morre.
 * env tem identidade estável entre requests do mesmo isolate — medido
 * (spike S6b) contra um Worker real via SELF.fetch.
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
// Anotar `: Auth` aqui criaria uma referência circular (`Auth` é definido a
// partir do retorno INFERIDO desta função).
export function createAuth(env: AuthBindings) {
  // MEDIDO contra o pacote instalado (better-auth@1.6.25,
  // dist/context/create-context.mjs:70-80): SEM secret, o Better Auth NÃO
  // lança — ele cai pro default hardcoded no PRÓPRIO PACOTE
  // ('better-auth-secret-12345678901234567890', linha 78) e só lançaria
  // depois (validateSecret, linhas 38-44) se `isProduction` fosse `true`,
  // o que NUNCA acontece num Worker (não há `NODE_ENV`, mesmo fato que já
  // justifica `rateLimit.enabled: true` explícito, abaixo). A antiga versão
  // deste comentário afirmava "a falta lança BetterAuthError no boot" — não
  // reproduz: MEDIDO que nem `secret` nem `baseURL` ausentes lançam sozinhos
  // (baseURL ausente só gera `logger.warn`, linha 64). Sem este guard
  // explícito, esquecer `wrangler secret put BETTER_AUTH_SECRET` publicaria
  // em produção assinando toda sessão e todo cookie de state/PKCE do OAuth
  // com essa constante pública no código-fonte da lib — deploy e login
  // pareceriam saudáveis, sem erro nem log, e qualquer um capaz de ler o
  // pacote no npm poderia forjar uma assinatura válida.
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

    // baseURL: SEM guard explícito de propósito — a falta só gera
    // `logger.warn` (create-context.mjs:64), não é fatal pra própria lib
    // (embora quebre o cookie same-site em produção, ver CLAUDE.md/Deploy).
    // secret: com o `throw` acima, chega aqui sempre não-vazio.
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,

    // O secure/prefixo __Secure- do cookie sai do baseURL começar com
    // https:// — isProduction é SEMPRE falso no Worker (não há NODE_ENV).
    // Por isso baseURL não é opcional aqui.
    //
    // A MESMA constatação (isProduction sempre falso) tem uma segunda
    // consequência que não dava pra deixar implícita: o default do
    // rate limit do Better Auth é `enabled: options.rateLimit?.enabled ??
    // isProduction` (medido em node_modules/better-auth/dist/context/
    // create-context.mjs:171) — sem `enabled` explícito aqui, o rate limit
    // fica DESLIGADO em produção, sempre, porque isProduction nunca vira
    // true num Worker. Sem throttle, `POST /api/auth/sign-in/social` grava
    // uma linha em `verification` por chamada e `GET /api/auth/get-session`
    // faz uma leitura por chamada — um script sem sessão alguma esgota a
    // cota diária de escrita do D1 free tier (100k/dia) e a de requests do
    // Worker (100k/dia) e derruba o módulo do próprio dono.
    rateLimit: {
      enabled: true,
      // window em SEGUNDOS (não ms — unidade do próprio Better Auth).
      // 60s/20 requisições é folgado pro uso real (usuário único, SPA
      // chamando get-session em navegação normal) e aperta um script sem
      // sessão nenhuma.
      //
      // ⚠️ Este par NÃO é o que governa `/sign-in/*`. O Better Auth tem uma
      // regra especial embutida por prefixo de rota que tem precedência
      // sobre esta config: `/sign-in` roda com window 10 / max 3
      // (rate-limiter/index.mjs:370-383, aplicada em :288-291). Ou seja, o
      // sign-in social é protegido MAIS apertado do que os números acima, e
      // não por eles — o que este bloco de fato cobre é o resto
      // (`get-session`, `callback`, etc.). Não reescrever esses valores
      // achando que afrouxam ou apertam o login.
      window: 60,
      max: 20,
      // 'database' pediria uma tabela `rateLimit` própria — migration 0003
      // nova, e migration aqui é forward-only, então essa decisão fica de
      // fora de um fix round. 'memory' é o único storage disponível sem
      // schema novo.
      //
      // ⚠️ 'memory' é POR ISOLATE, não é um contador global. Cada isolate
      // do Worker (Cloudflare pode subir mais de um sob carga, em colos
      // diferentes ou até no mesmo colo) tem seu próprio Map em memória —
      // um atacante distribuído por N isolates recebe, na prática, N vezes
      // o teto acima. Isto é uma mitigação PARCIAL (eleva o custo de um
      // script ingênuo batendo num isolate só), não um teto rígido de
      // tráfego — não tratar como se fosse.
      storage: 'memory',
    },

    // MEDIDO rodando a suíte com rateLimit.enabled: true pela primeira vez:
    // sem isto, o Better Auth loga "Rate limiting could not determine a
    // client IP and is falling back to a single shared per-path bucket" e
    // usa UMA bucket só, compartilhada por TODO MUNDO que bate no mesmo
    // path — não é "por IP" nenhum, é um teto único e global por rota, que
    // o dono e um atacante dividem entre si. Causa raiz: a lista default de
    // headers do Better Auth pra resolver IP é só `['x-forwarded-for']`
    // (node_modules/@better-auth/core/dist/utils/ip.mjs) — não inclui
    // `cf-connecting-ip`. Num Worker que atende requisição pública direto
    // (não um subrequest same-zone Worker-a-Worker), `CF-Connecting-IP` é
    // quem a borda da Cloudflare seta com o IP real do cliente e SOBRESCREVE
    // antes do Worker rodar — não é algo que o requisitante externo consiga
    // forjar. `X-Forwarded-For` não tem essa garantia aqui. Sem esta linha,
    // o comentário acima sobre "aperta um script, não trava o dono" seria
    // FALSO: o balde compartilhado bate no dono e no atacante igual.
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

    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            assertEmailPermitido(user.email, env.ALLOWED_EMAIL)
            return { data: user }
          },
        },
      },
    },
  })
}
