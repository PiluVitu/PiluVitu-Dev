import 'server-only'

/** Username na API pública do dev.to (artigos e cartão). Override: `NEXT_PUBLIC_DEVTO_USERNAME`. */
export function getDevToUsername(): string {
  return process.env.NEXT_PUBLIC_DEVTO_USERNAME?.trim() || 'piluvitu'
}

/** URL do artigo mais recente (primeiro da lista da API). */
export async function getLatestDevToArticleUrl(): Promise<string | null> {
  const username = getDevToUsername()
  try {
    const res = await fetch(
      `https://dev.to/api/articles?username=${encodeURIComponent(username)}&per_page=1`,
      { next: { revalidate: 300 } },
    )
    if (!res.ok) return null
    const data = (await res.json()) as Array<{ url?: string }>
    return data[0]?.url ?? null
  } catch {
    return null
  }
}
