/**
 * A ponte entre as duas tabelas de usuário deste D1.
 *
 * `user` (singular, migration 0002) é do Better Auth — contrato da lib,
 * PK TEXT, uma linha por identidade autenticada. `users` (plural, migration
 * 0001) é do domínio da votação — PK INTEGER (a que `votes`/`voting_sessions`
 * referenciam via FK), com `google_sub` UNIQUE e `is_admin`. Nada na migration
 * liga uma na outra; é este arquivo quem faz isso, a cada request autenticado
 * (`lib/session.ts#requireAuth`/`requireAdmin` chamam `upsertVotacaoUser`).
 *
 * ⚠️ `googleSub` aqui é o claim `sub` DE VERDADE do Google (o mesmo valor que
 * `users.google_sub` já guarda no SQLite da API Go) — não um id interno de
 * lib nenhum. Este módulo é AGNÓSTICO ao valor: ele só grava o que recebe;
 * quem resolve esse valor (buscando `account.accountId` por
 * `providerId='google'`, com fallback pro id do Better Auth quando não há
 * conta Google vinculada — caminho que só existe em teste, via
 * `emailAndPassword`) é `resolveSession`, em `lib/session.ts` (comentário lá
 * é o dono do assunto — ver o porquê de precisar ser o `sub` real, que é a
 * fatia ④ importar o histórico de votação da API Go casando por esta coluna:
 * gravar outra coisa duplicaria usuário e orfanizaria voto antigo).
 */

export type VotacaoUser = {
  id: number
  googleSub: string
  email: string
  name: string
  picture: string | null
  isAdmin: boolean
  createdAt: string
}

export type UpsertVotacaoUserInput = {
  googleSub: string
  email: string
  name: string
  picture?: string | null
  /**
   * ⚠️ Quem decide este valor é o CHAMADOR (`lib/session.ts`, via
   * `isAdminEmail(email, env.ADMIN_EMAILS)`), a cada request — nunca esta
   * função. `upsertVotacaoUser` só grava o que recebe; ela não lê
   * `ADMIN_EMAILS` nem tem opinião sobre quem é admin. Isso é o que faz
   * trocar `ADMIN_EMAILS` mudar o resultado do PRÓXIMO request, sem exigir
   * novo login — is_admin nunca é lido do banco como verdade.
   */
  isAdmin: boolean
}

type UsersRow = {
  id: number
  google_sub: string
  email: string
  name: string
  picture: string | null
  is_admin: number
  created_at: string
}

function rowToVotacaoUser(row: UsersRow): VotacaoUser {
  return {
    id: row.id,
    googleSub: row.google_sub,
    email: row.email,
    name: row.name,
    picture: row.picture,
    isAdmin: row.is_admin === 1,
    createdAt: row.created_at,
  }
}

/**
 * Casa por `google_sub` (UNIQUE, migration 0001). Já existe ⇒ atualiza
 * `email`/`name`/`picture`/`is_admin` (SEMPRE sobrescreve com o valor
 * recebido, nunca faz merge preservando o que já estava no banco — mesma
 * semântica do `UpsertUser` do Go, `apps/api/internal/votacao/users.go`).
 * Não existe ⇒ insere uma linha nova. `created_at` nunca é tocado num
 * update (fica de fora do `SET`), só é gravado pelo `DEFAULT
 * CURRENT_TIMESTAMP` da migration no INSERT original.
 *
 * `INSERT ... RETURNING id` é o mecanismo MEDIDO como funcional no D1 na
 * Task 2 (`schema.test.ts`) — usado aqui só pra obter o `id` da linha
 * afetada (nova ou existente); os demais campos vêm de um SELECT logo
 * depois, mesmo padrão em duas etapas do `UpsertUser`/`GetUserByGoogleSub`
 * do Go, para não apostar sem medição própria que `RETURNING` com colunas
 * extras sobrevive a um `ON CONFLICT DO UPDATE`.
 */
export async function upsertVotacaoUser(
  db: D1Database,
  input: UpsertVotacaoUserInput,
): Promise<VotacaoUser> {
  const picture = input.picture ?? null
  const isAdminInt = input.isAdmin ? 1 : 0

  const upserted = await db
    .prepare(
      `INSERT INTO users (google_sub, email, name, picture, is_admin)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(google_sub) DO UPDATE SET
         email    = excluded.email,
         name     = excluded.name,
         picture  = excluded.picture,
         is_admin = excluded.is_admin
       RETURNING id`,
    )
    .bind(input.googleSub, input.email, input.name, picture, isAdminInt)
    .first<{ id: number }>()

  if (upserted === null) {
    throw new Error(
      'upsertVotacaoUser: INSERT ... RETURNING id não devolveu linha',
    )
  }

  const row = await db
    .prepare(
      `SELECT id, google_sub, email, name, picture, is_admin, created_at
         FROM users
        WHERE id = ?`,
    )
    .bind(upserted.id)
    .first<UsersRow>()

  if (row === null) {
    throw new Error('upsertVotacaoUser: linha não encontrada após o upsert')
  }

  return rowToVotacaoUser(row)
}
