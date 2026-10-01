#!/usr/bin/env bash
# Uso: conferir-tag.sh <tag> <commit ou objeto da tag>, na raiz do repo, com origin/main buscado.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

tag=${1:?uso: conferir-tag.sh <tag> <commit>}
sha=${2:?uso: conferir-tag.sh <tag> <commit>}
versao=$(node -p "require('./apps/botai/package.json').version")

if [ "$tag" != "botai-v$versao" ]; then
  echo "::error::A tag $tag não bate com a versão de apps/botai/package.json (esperado botai-v$versao)."
  exit 1
fi
if ! git merge-base --is-ancestor "$sha^{commit}" origin/main; then
  echo "::error::O commit $sha da tag $tag não está na main."
  exit 1
fi
echo "Tag $tag confere com apps/botai/package.json e está na main."
