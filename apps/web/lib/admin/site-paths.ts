/**
 * O app web vive em `apps/web` dentro do monorepo PiluVitu-Dev. Os caminhos que o
 * admin lê/grava no **repo do site** via API do GitHub (conteúdo YAML + mídia) são
 * relativos à raiz do repo, então levam este prefixo. O Keystatic reader usa
 * `process.cwd()` (= apps/web) e por isso continua com caminhos `content/...` sem
 * prefixo; já a engine do admin (Octokit) fala com a raiz do repo.
 *
 * O repo do blog (`piluvitu-blog`) é single-package — NÃO usa este prefixo.
 */
export const SITE_PATH_PREFIX = 'apps/web'

/** Prefixa um caminho do app web com a raiz do monorepo (para o repo do site). */
export function sitePath(p: string): string {
  return `${SITE_PATH_PREFIX}/${p}`
}
