#!/usr/bin/env bash
# Chamado por `make release-botai`, na main, depois do merge do PR de versão; ver "Publicação" no apps/botai/CLAUDE.md.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

git fetch --quiet --tags origin main
if [ -n "$(git status --porcelain)" ]; then
  echo "Há mudanças não commitadas: o release sai de uma árvore limpa." >&2
  exit 1
fi
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "HEAD não é a origin/main: rode git switch main && git pull antes do release." >&2
  exit 1
fi

versao=$(node -p "require('./apps/botai/package.json').version")
tag="botai-v$versao"
if git rev-parse --quiet --verify "refs/tags/$tag" >/dev/null; then
  echo "A tag $tag já existe: suba a versão com make versao-botai V=x.y.z." >&2
  exit 1
fi

git tag -a "$tag" -m "Botaí $versao"
git push --quiet origin "$tag"
echo "Tag $tag enviada: o botai-release.yml gera o GitHub Release e espera a aprovação do job lojas."
