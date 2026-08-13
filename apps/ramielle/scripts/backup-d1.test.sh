#!/usr/bin/env bash
#
# Testes de backup-d1.sh (ramielle). Mesmo padrão de
# apps/financas/scripts/backup-d1.test.sh — shell testando shell de
# propósito, porque a suíte do Worker roda no Miniflare (workers pool), onde
# não existe `node:child_process`: não há como um teste de lá disparar um
# processo.
#
# O wrangler é substituído por um stub no PATH, então nada aqui toca a rede,
# a Cloudflare ou o D1 de verdade.
#
# Uso: ./scripts/backup-d1.test.sh
set -uo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
ALVO="$AQUI/backup-d1.sh"

passou=0
falhou=0

ok() { passou=$((passou + 1)); echo "  ok — $1"; }
nok() { falhou=$((falhou + 1)); echo "  FALHOU — $1"; }

checar() { # checar <descrição> <esperado> <obtido>
  if [ "$2" = "$3" ]; then ok "$1"; else nok "$1 (esperado '$2', obtido '$3')"; fi
}

# Cada cenário ganha uma sandbox: um stub de wrangler com comportamento
# programável e uma pasta de destino vazia.
montar_sandbox() { # montar_sandbox <modo-do-stub>
  SANDBOX="$(mktemp -d)"
  mkdir -p "$SANDBOX/bin" "$SANDBOX/dest"
  cat > "$SANDBOX/bin/wrangler-falso" <<STUB
#!/usr/bin/env bash
# Descobre o --output= e escreve nele conforme o modo.
saida=''
for arg in "\$@"; do
  case "\$arg" in --output=*) saida="\${arg#--output=}" ;; esac
done
case "$1" in
  ok)          printf 'CREATE TABLE voting_sessions (id INTEGER);\nINSERT INTO voting_sessions VALUES (1);\n' > "\$saida" ;;
  vazio)       : > "\$saida" ;;
  truncado)    printf 'PRAGMA foreign_keys=OFF;\n-- cortado no meio\n' > "\$saida" ;;
  falha)       echo 'boom' >&2; exit 1 ;;
  ddl_apenas)  printf 'CREATE TABLE voting_sessions (id INTEGER);\n' > "\$saida" ;;
esac
STUB
  chmod +x "$SANDBOX/bin/wrangler-falso"
}

limpar_sandbox() { rm -rf "$SANDBOX"; }

rodar_backup() { # rodar_backup [KEEP]
  RAMIELLE_BACKUP_DIR="$SANDBOX/dest" \
  RAMIELLE_BACKUP_KEEP="${1:-30}" \
  WRANGLER_BIN="$SANDBOX/bin/wrangler-falso" \
    bash "$ALVO" > "$SANDBOX/saida.log" 2>&1
}

contar_backups() {
  local n=0
  for f in "$SANDBOX"/dest/ramielle-*.sql.gz; do [ -e "$f" ] && n=$((n + 1)); done
  echo "$n"
}

echo "backup-d1.sh (ramielle)"

# --- 1. caminho feliz -------------------------------------------------------
montar_sandbox ok
rodar_backup 30
checar "export bem-sucedido sai com 0" 0 "$?"
checar "gravou exatamente 1 backup" 1 "$(contar_backups)"
for f in "$SANDBOX"/dest/ramielle-*.sql.gz; do
  if gzip -t "$f" 2>/dev/null; then ok "o .gz gerado é íntegro"; else nok "o .gz gerado está corrompido"; fi
  if gzip -dc "$f" | grep -q 'CREATE TABLE voting_sessions'; then
    ok "o conteúdo do dump sobrevive ao gzip"
  else
    nok "o conteúdo do dump não sobreviveu ao gzip"
  fi
done
limpar_sandbox

# --- 2. export vazio não vira backup ---------------------------------------
montar_sandbox vazio
rodar_backup 30
checar "export vazio sai diferente de 0" 1 "$?"
checar "export vazio não grava backup" 0 "$(contar_backups)"
limpar_sandbox

# --- 3. export truncado não vira backup ------------------------------------
montar_sandbox truncado
rodar_backup 30
checar "export sem CREATE TABLE sai diferente de 0" 1 "$?"
checar "export truncado não grava backup" 0 "$(contar_backups)"
limpar_sandbox

# --- 4. o modo de falha que transforma backup em perda de dado --------------
# Um export que falha NÃO pode rotacionar. Se rotacionasse antes de exportar,
# cada execução quebrada comeria o backup mais antigo até não sobrar nenhum.
montar_sandbox falha
for i in 1 2 3; do
  : | gzip -c > "$SANDBOX/dest/ramielle-2026010${i}T000000Z.sql.gz"
done
rodar_backup 3
checar "export que falha sai diferente de 0" 1 "$?"
checar "export que falha preserva os backups antigos" 3 "$(contar_backups)"
limpar_sandbox

# --- 5. rotação mantém os N mais recentes ----------------------------------
montar_sandbox ok
# 5 backups antigos + o novo = 6; com KEEP=3 devem sobrar os 3 mais recentes.
for i in 1 2 3 4 5; do
  : | gzip -c > "$SANDBOX/dest/ramielle-2026010${i}T000000Z.sql.gz"
done
rodar_backup 3
checar "rotação sai com 0" 0 "$?"
checar "rotação mantém exatamente KEEP arquivos" 3 "$(contar_backups)"
if [ -e "$SANDBOX/dest/ramielle-20260101T000000Z.sql.gz" ]; then
  nok "rotação deveria ter removido o mais antigo"
else
  ok "rotação remove o mais antigo primeiro"
fi
if [ -e "$SANDBOX/dest/ramielle-20260105T000000Z.sql.gz" ]; then
  ok "rotação preserva o antigo mais recente"
else
  nok "rotação removeu um arquivo que deveria ficar"
fi
limpar_sandbox

# --- 6. KEEP inválido é recusado, não obedecido ----------------------------
# KEEP=0 apagaria o backup recém-criado junto com os antigos.
for invalido in 0 -1 abc; do
  montar_sandbox ok
  rodar_backup "$invalido"
  checar "KEEP='$invalido' é recusado com código 2" 2 "$?"
  checar "KEEP='$invalido' não grava backup" 0 "$(contar_backups)"
  limpar_sandbox
done

# --- 7. destino inexistente é criado ---------------------------------------
montar_sandbox ok
rm -rf "$SANDBOX/dest"
rodar_backup 30
checar "cria a pasta de destino se ela não existir" 0 "$?"
checar "grava o backup na pasta recém-criada" 1 "$(contar_backups)"
limpar_sandbox

# --- 8. dump truncado ENTRE o DDL e os INSERTs não passa como backup (M4) --
# As três checagens de sempre (não-vazio, tem CREATE TABLE, gzip íntegro)
# aceitariam esse dump — só tem CREATE TABLE, perdeu os INSERTs. Só a
# comparação de tamanho contra o backup mais recente pega isso.
montar_sandbox ddl_apenas
{
  echo 'CREATE TABLE voting_sessions (id INTEGER);'
  for i in $(seq 1 500); do echo "INSERT INTO voting_sessions VALUES ($i);"; done
} | gzip -c > "$SANDBOX/dest/ramielle-20260101T000000Z.sql.gz"
rodar_backup 30
checar "dump DDL-only (bem menor que o anterior) é recusado com código diferente de 0" 1 "$?"
checar "dump DDL-only não vira backup novo (só o antigo continua lá)" 1 "$(contar_backups)"
if gzip -dc "$SANDBOX/dest/ramielle-20260101T000000Z.sql.gz" | grep -q '500'; then
  ok "o backup anterior (com os INSERTs) continua intacto, sem rotação"
else
  nok "o backup anterior foi corrompido ou substituído"
fi
limpar_sandbox

# --- 9. primeira execução da vida (sem backup anterior) não tem com o que
#        comparar — continua aceitando um dump pequeno normalmente ----------
montar_sandbox ddl_apenas
rodar_backup 30
checar "sem backup anterior, dump pequeno (aqui, só DDL) ainda é aceito" 0 "$?"
checar "grava o único backup possível de comparar" 1 "$(contar_backups)"
limpar_sandbox

echo
echo "$passou passaram, $falhou falharam"
[ "$falhou" -eq 0 ]
