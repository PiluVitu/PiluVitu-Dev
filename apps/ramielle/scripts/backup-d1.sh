#!/usr/bin/env bash
#
# Export lógico do D1 do ramielle (votação), comprimido, com rotação — MESMO
# desenho de apps/financas/scripts/backup-d1.sh (ler aquele arquivo primeiro
# pro raciocínio completo: por que Time Travel não basta, por que R2 foi
# descartado — exige verificação de cartão, o mesmo motivo que tirou o
# Cloudflare Access do finanças —, por que a rotação roda só DEPOIS de um
# backup novo e válido existir. Não repetido aqui: cada fato mora num único
# arquivo, regra da raiz do CLAUDE.md).
#
# Por que um IRMÃO, e não o script do finanças generalizado: os dois scripts
# são quase idênticos byte a byte, mas o do finanças embute o prefixo
# "financas-" tanto no NOME do arquivo gerado quanto no glob de
# rotação/comparação de tamanho — e o teste dele (backup-d1.test.sh) tem
# esse glob hardcoded nos 9 cenários. Generalizar exigiria uma variável de
# PREFIXO a mais ali e re-rodar os 9 cenários pra não regredir o finanças.
# Um irmão com nome de variável próprio (RAMIELLE_* em vez de FINANCAS_*) é
# mais barato e não arrisca o script já em produção do finanças. Mesmo
# padrão de apps/ramielle/scripts/ já ter os próprios scripts específicos
# (gerar-import.mjs, comparar-com-go.mjs) em vez de generalizar algo do
# finanças pra servir aos dois.
#
# ⚠️ URGÊNCIA REAL, NÃO TEÓRICA: hoje o D1 remoto do ramielle está VAZIO —
# não há histórico nenhum pra perder ainda, então rodar isto agora é barato
# de testar sem risco. DEPOIS do import do histórico real da Go (fatia ④,
# runbook em docs/superpowers/runbooks/2026-08-12-cutover-ramielle.md, passo
# "Import"), o D1 passa a guardar o ÚNICO registro de votação existente — e
# sem este script agendado, esse histórico fica sem NENHUMA cópia fora da
# Cloudflare. Agendar (mesma técnica launchd/cron de "Agendar diariamente"
# em apps/financas/CLAUDE.md, só trocando o caminho do repo e o nome do
# script pra este arquivo) faz parte do runbook, não é opcional.
#
# Uso:
#   ./scripts/backup-d1.sh
#
# Variáveis (todas opcionais):
#   RAMIELLE_D1_NAME     nome do banco no D1        (default: piluvitu-ramielle)
#   RAMIELLE_BACKUP_DIR  pasta de destino           (default: ~/Backups/ramielle)
#   RAMIELLE_BACKUP_KEEP quantos arquivos manter    (default: 30)
#   WRANGLER_BIN         como invocar o wrangler    (default: pnpm exec wrangler)
set -euo pipefail

DB="${RAMIELLE_D1_NAME:-piluvitu-ramielle}"
DEST="${RAMIELLE_BACKUP_DIR:-$HOME/Backups/ramielle}"
KEEP="${RAMIELLE_BACKUP_KEEP:-30}"
WRANGLER="${WRANGLER_BIN:-pnpm exec wrangler}"

# KEEP=0 apagaria o backup recém-criado junto com os antigos. Recusar é melhor
# que obedecer: quem escreve 0 quase sempre queria "não rotacionar".
case "$KEEP" in
  '' | *[!0-9]*) echo "erro: RAMIELLE_BACKUP_KEEP precisa ser inteiro, veio '$KEEP'" >&2; exit 2 ;;
esac
if [ "$KEEP" -lt 1 ]; then
  echo "erro: RAMIELLE_BACKUP_KEEP precisa ser >= 1, veio '$KEEP'" >&2
  exit 2
fi

mkdir -p "$DEST"

# UTC no nome, formato que ordena lexicograficamente == cronologicamente (mesma
# razão dos timestamps do schema). A rotação depende disso.
CARIMBO="$(date -u +%Y%m%dT%H%M%SZ)"
FINAL="$DEST/ramielle-$CARIMBO.sql.gz"

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

# ⚠️ Guarda de dump só-DDL (achado da revisão final da fatia ④). As checagens
# acima aceitam um export truncado ENTRE o CREATE TABLE e o primeiro INSERT:
# tem conteúdo, tem 'CREATE TABLE', comprime sem erro. A comparação de tamanho
# lá embaixo pegaria isso — mas ela é PULADA quando não há backup anterior, e
# a primeira execução da vida deste script é exatamente o passo 11 do runbook
# de cutover, logo depois do import, quando o D1 vira o ÚNICO registro do
# histórico. Um "backup" só-DDL ali significa acreditar que tem cópia e não
# ter. Este script nunca é legitimamente rodado contra um banco vazio (o
# runbook o roda depois do import), então exigir INSERT é seguro.
if ! grep -q 'INSERT INTO' "$CRU"; then
  echo "erro: export tem 'CREATE TABLE' mas nenhum 'INSERT INTO' — dump só-DDL (truncado antes das linhas), recusado, nada rotacionado. Se o banco estiver legitimamente vazio, não há o que fazer backup." >&2
  exit 1
fi

gzip -c "$CRU" > "$TRABALHO/dump.sql.gz"
if ! gzip -t "$TRABALHO/dump.sql.gz"; then
  echo "erro: gzip do export não passa no teste de integridade" >&2
  exit 1
fi

# Mesma guarda M4 do finanças: as três checagens acima (não-vazio, tem
# CREATE TABLE, gzip íntegro) aceitam um dump truncado DEPOIS do DDL e ANTES
# ou NO MEIO dos INSERTs — tem conteúdo, tem 'CREATE TABLE', comprime sem
# erro. Comparar o tamanho descomprimido contra o backup mais recente já
# existente é a única checagem que flagra ISSO especificamente. Sem backup
# anterior (primeira execução da vida) não há com o que comparar — esse
# caminho continua aceitando, igual antes.
ANTERIOR="$(ls -1 "$DEST"/ramielle-*.sql.gz 2>/dev/null | sort | tail -n 1 || true)"
if [ -n "$ANTERIOR" ]; then
  TAMANHO_ANTERIOR="$(gzip -dc "$ANTERIOR" | wc -c | tr -d ' ')"
  TAMANHO_NOVO="$(wc -c < "$CRU" | tr -d ' ')"
  if [ "$TAMANHO_ANTERIOR" -gt 0 ] && [ "$TAMANHO_NOVO" -lt $(( TAMANHO_ANTERIOR / 2 )) ]; then
    echo "erro: export novo ($TAMANHO_NOVO bytes descomprimidos) é menos da metade do backup mais recente ($TAMANHO_ANTERIOR bytes, $(basename "$ANTERIOR")) — recusado, nada rotacionado. Pode ser um dump truncado entre o DDL e os INSERTs." >&2
    exit 1
  fi
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
for arquivo in "$DEST"/ramielle-*.sql.gz; do
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
