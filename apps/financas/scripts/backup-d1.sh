#!/usr/bin/env bash
#
# Export lógico do D1 de produção, comprimido, com rotação.
#
# Por que existe: o D1 tem Time Travel embutido, mas ele (a) restaura o banco
# INTEIRO para um instante, nunca uma tabela ou linha, (b) é destrutivo para
# tudo escrito depois daquele ponto, e (c) vive dentro da Cloudflare — não
# cobre "perdi a conta". Este script é a cópia que sai de lá.
#
# R2 foi descartado de propósito: cadastrar R2 exige verificação de cartão, que
# é justamente o que tirou o Cloudflare Access do projeto. O destino é o disco
# local; sincronizar a pasta com iCloud/Drive fica a critério de quem roda.
#
# Uso:
#   ./scripts/backup-d1.sh
#
# Variáveis (todas opcionais):
#   FINANCAS_D1_NAME     nome do banco no D1        (default: piluvitu-financas)
#   FINANCAS_BACKUP_DIR  pasta de destino           (default: ~/Backups/financas)
#   FINANCAS_BACKUP_KEEP quantos arquivos manter    (default: 30)
#   WRANGLER_BIN         como invocar o wrangler    (default: pnpm exec wrangler)
set -euo pipefail

DB="${FINANCAS_D1_NAME:-piluvitu-financas}"
DEST="${FINANCAS_BACKUP_DIR:-$HOME/Backups/financas}"
KEEP="${FINANCAS_BACKUP_KEEP:-30}"
WRANGLER="${WRANGLER_BIN:-pnpm exec wrangler}"

# KEEP=0 apagaria o backup recém-criado junto com os antigos. Recusar é melhor
# que obedecer: quem escreve 0 quase sempre queria "não rotacionar".
case "$KEEP" in
  '' | *[!0-9]*) echo "erro: FINANCAS_BACKUP_KEEP precisa ser inteiro, veio '$KEEP'" >&2; exit 2 ;;
esac
if [ "$KEEP" -lt 1 ]; then
  echo "erro: FINANCAS_BACKUP_KEEP precisa ser >= 1, veio '$KEEP'" >&2
  exit 2
fi

mkdir -p "$DEST"

# UTC no nome, formato que ordena lexicograficamente == cronologicamente (mesma
# razão dos timestamps do schema). A rotação depende disso.
CARIMBO="$(date -u +%Y%m%dT%H%M%SZ)"
FINAL="$DEST/financas-$CARIMBO.sql.gz"

# Área de trabalho fora de $DEST: um download pela metade não pode nem parecer
# um backup, nem ser contado pela rotação.
TRABALHO="$(mktemp -d)"
trap 'rm -rf "$TRABALHO"' EXIT
CRU="$TRABALHO/dump.sql"

echo "==> exportando $DB (--remote)"
# shellcheck disable=SC2086  # $WRANGLER é um comando com argumentos, split é intencional
$WRANGLER d1 export "$DB" --remote --output="$CRU"

# Três checagens antes de aceitar o arquivo como backup. Sem elas, um export
# vazio ou truncado entra na pasta e a rotação descarta um backup BOM para
# abrir espaço — o modo de falha que transforma backup em perda de dado.
if [ ! -s "$CRU" ]; then
  echo "erro: export saiu vazio, nada foi gravado e nada foi rotacionado" >&2
  exit 1
fi
if ! grep -q 'CREATE TABLE' "$CRU"; then
  echo "erro: export não contém 'CREATE TABLE' — provavelmente truncado" >&2
  exit 1
fi

gzip -c "$CRU" > "$TRABALHO/dump.sql.gz"
if ! gzip -t "$TRABALHO/dump.sql.gz"; then
  echo "erro: gzip do export não passa no teste de integridade" >&2
  exit 1
fi

# mv dentro do mesmo filesystem é atômico; o arquivo aparece em $DEST inteiro
# ou não aparece. Por isso o mktemp -d acima não serve — ele pode cair em outro
# volume — então copia-e-renomeia dentro do próprio $DEST.
cp "$TRABALHO/dump.sql.gz" "$FINAL.parcial"
mv "$FINAL.parcial" "$FINAL"
echo "==> gravado $FINAL ($(wc -c < "$FINAL" | tr -d ' ') bytes)"

# Rotação só DEPOIS de existir um backup novo e válido. Ordem invertida
# (rotacionar antes de exportar) apagaria o mais antigo mesmo quando o export
# falha, corroendo o histórico a cada execução quebrada.
existentes=()
for arquivo in "$DEST"/financas-*.sql.gz; do
  [ -e "$arquivo" ] || continue
  existentes+=("$arquivo")
done

# O glob já devolve ordenado por nome, e o nome é o carimbo UTC.
excedente=$(( ${#existentes[@]} - KEEP ))
if [ "$excedente" -gt 0 ]; then
  for (( i = 0; i < excedente; i++ )); do
    rm -f "${existentes[$i]}"
    echo "==> rotacionado (removido) ${existentes[$i]}"
  done
else
  echo "==> rotação: ${#existentes[@]} arquivo(s), teto $KEEP, nada a remover"
fi
