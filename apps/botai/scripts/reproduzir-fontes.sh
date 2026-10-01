#!/usr/bin/env bash
# Faz o que o revisor da AMO faz: reconstrói o pacote do Firefox a partir do zip de fontes, numa pasta
# limpa, e compara byte a byte. Roda no job pacotes do botai-release.yml e no Docker node:24.14.0.
# Uso: reproduzir-fontes.sh <botai-X-sources.zip> <botai-X-firefox.zip>
set -euo pipefail

fontes=$(realpath "$1")
esperado=$(realpath "$2")
pasta_esperada=$(dirname "$esperado")/firefox-mv3
revisor=$(mktemp -d)
trap 'rm -rf "$revisor"' EXIT

cd "$revisor"
unzip -q "$fontes"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack enable
pnpm_fixado=$(node -p "require('./package.json').packageManager.split('@')[1]")
test "$(pnpm --version)" = "$pnpm_fixado"
CI=1 pnpm install --frozen-lockfile
pnpm --filter @pilutech/botai exec wxt zip -b firefox

versao=$(node -p "require('./apps/botai/package.json').version")
diff -r "$pasta_esperada" apps/botai/.output/firefox-mv3
cmp "$esperado" "apps/botai/.output/botai-$versao-firefox.zip"
echo "IDENTICO: botai-$versao-firefox.zip"
