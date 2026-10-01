#!/usr/bin/env bash
# Chamado pelo job `lojas` do botai-release.yml; ver "Publicação" no apps/botai/CLAUDE.md.
set -euo pipefail

: "${EVENTO:?EVENTO: o github.event_name}"
: "${VERSAO:?VERSAO: a versão do apps/botai/package.json}"
: "${PASTA_ZIPS:?PASTA_ZIPS: a pasta do artifact botai-zips}"

chrome="$PASTA_ZIPS/botai-$VERSAO-chrome.zip"
firefox="$PASTA_ZIPS/botai-$VERSAO-firefox.zip"
fontes="$PASTA_ZIPS/botai-$VERSAO-sources.zip"
opera="$PASTA_ZIPS/botai-$VERSAO-opera.zip"

for zip in "$chrome" "$firefox" "$fontes" "$opera"; do
  if [ ! -f "$zip" ]; then
    echo "::error::Falta $zip no artifact botai-zips."
    exit 1
  fi
done

case "$EVENTO" in
  pull_request) modo=nenhuma ;;
  push) modo=submeter ;;
  workflow_dispatch) modo=${ENTRADA_LOJAS:-nenhuma} ;;
  *)
    echo "::error::Evento sem modo definido: $EVENTO."
    exit 1
    ;;
esac

case "$modo" in
  nenhuma)
    echo "::notice::Chrome: wxt submit --chrome-zip $chrome"
    echo "::notice::Firefox: wxt submit --firefox-zip $firefox --firefox-sources-zip $fontes"
    echo "::notice::Edge: wxt submit --edge-zip $chrome"
    echo "::notice::Opera: envio manual de $opera (a loja não tem API oficial)"
    exit 0
    ;;
  dry-run | submeter) ;;
  *)
    echo "::error::Modo desconhecido: $modo (use nenhuma, dry-run ou submeter)."
    exit 1
    ;;
esac

if [ "$modo" = submeter ]; then
  case "${ORIGEM_REF:-}" in
    refs/heads/main | refs/tags/botai-v*) ;;
    *)
      echo "::error::submeter só roda a partir da main ou de uma tag botai-v* (veio de ${ORIGEM_REF:-ref vazia})."
      exit 1
      ;;
  esac
fi

# 0 = todos os secrets da loja existem; 1 = nenhum; parcial é erro de cadastro.
secrets_da_loja() {
  local loja=$1 presentes=0 total=0 nome
  shift
  for nome in "$@"; do
    total=$((total + 1))
    if [ -n "${!nome:-}" ]; then presentes=$((presentes + 1)); fi
  done
  if [ "$presentes" -eq 0 ]; then return 1; fi
  if [ "$presentes" -lt "$total" ]; then
    echo "::error::$loja: só parte dos secrets ($*) está cadastrada no environment lojas-botai."
    exit 1
  fi
  return 0
}

args=()
lojas=""

if secrets_da_loja Chrome CHROME_SERVICE_ACCOUNT_PRIVATE_KEY; then
  args+=(--chrome-zip "$chrome")
  lojas="$lojas Chrome"
  if [ "${ADIAR_CHROME:-}" = true ]; then
    export CHROME_PUBLISH_TYPE=STAGED_PUBLISH
  else
    unset CHROME_PUBLISH_TYPE
  fi
else
  unset CHROME_API_VERSION CHROME_EXTENSION_ID CHROME_PUBLISHER_ID \
    CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL CHROME_SERVICE_ACCOUNT_PRIVATE_KEY CHROME_PUBLISH_TYPE
fi

if secrets_da_loja Firefox FIREFOX_JWT_ISSUER FIREFOX_JWT_SECRET; then
  args+=(--firefox-zip "$firefox" --firefox-sources-zip "$fontes")
  lojas="$lojas Firefox"
else
  unset FIREFOX_EXTENSION_ID FIREFOX_CHANNEL FIREFOX_COMPATIBILITY FIREFOX_JWT_ISSUER FIREFOX_JWT_SECRET
fi

if secrets_da_loja Edge EDGE_CLIENT_ID EDGE_API_KEY; then
  args+=(--edge-zip "$chrome")
  lojas="$lojas Edge"
else
  unset EDGE_PRODUCT_ID EDGE_CLIENT_ID EDGE_API_KEY
fi

if [ -z "$lojas" ]; then
  echo "::notice::Nenhuma loja com secrets no environment lojas-botai: nada a submeter."
  exit 0
fi

if [ "$modo" = dry-run ]; then args+=(--dry-run); fi
echo "::notice::$modo:$lojas"
exec pnpm exec wxt submit "${args[@]}"
