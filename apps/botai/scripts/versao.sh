#!/usr/bin/env bash
# Chamado por `make versao-botai V=x.y.z`; ver "Publicação" no apps/botai/CLAUDE.md.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

nova=${1:?uso: make versao-botai V=x.y.z}
if ! [[ "$nova" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "V=$nova não é x.y.z: as lojas só aceitam versão numérica." >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "Há mudanças não commitadas: o PR de versão sai de uma árvore limpa." >&2
  exit 1
fi

git fetch --quiet origin main
atual=$(git show origin/main:apps/botai/package.json | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).version")
if ! node -e '
  const [a, b] = process.argv.slice(1).map((v) => v.split(".").map(Number))
  process.exit((a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) > 0 ? 0 : 1)
' "$nova" "$atual"; then
  echo "V=$nova precisa ser maior que a versão da main ($atual): as lojas recusam versão repetida ou menor." >&2
  exit 1
fi

branch="chore/botai-v$nova"
git switch --quiet -c "$branch" origin/main
(cd apps/botai && pnpm version "$nova" --no-git-tag-version)
git add apps/botai/package.json
git commit --quiet -m "chore(botai): versão $nova"
git push --quiet -u origin "$branch"
gh pr create --base main --head "$branch" \
  --title "chore(botai): versão $nova" \
  --body "Sobe o Botaí para $nova. Depois do merge, na main: make release-botai."
