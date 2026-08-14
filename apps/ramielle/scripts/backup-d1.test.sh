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

# --- stub de curl, pro registro no painel admin (ROADMAP.md § 1) -----------
# Um curl-falso programável por $MODO_CURL: grava se foi chamado (marca) e
# com que corpo (-d), e decide a saída (status HTTP em stdout via -w, ou
# saindo != 0 pra simular falha de transporte). Nada aqui toca a rede.
montar_curl_stub() {
  cat > "$SANDBOX/bin/curl-falso" <<'STUB'
#!/usr/bin/env bash
corpo=''
prev=''
for arg in "$@"; do
  if [ "$prev" = "-d" ]; then corpo="$arg"; fi
  prev="$arg"
done
: > "$CURL_LOG_MARCA"
echo "$corpo" > "$CURL_LOG_BODY"
case "${MODO_CURL:-sucesso}" in
  sucesso)    printf '201' ;;
  http-erro)  printf '403' ;;
  rede-falha) exit 7 ;;
esac
STUB
  chmod +x "$SANDBOX/bin/curl-falso"
}

rodar_backup_sem_registro() {
  RAMIELLE_BACKUP_DIR="$SANDBOX/dest" \
  RAMIELLE_BACKUP_KEEP=30 \
  WRANGLER_BIN="$SANDBOX/bin/wrangler-falso" \
  RAMIELLE_CURL_BIN="$SANDBOX/bin/curl-falso" \
  CURL_LOG_MARCA="$SANDBOX/curl-chamado.marca" \
  CURL_LOG_BODY="$SANDBOX/curl-body.log" \
    bash "$ALVO" > "$SANDBOX/saida.log" 2>&1
}

rodar_backup_com_registro() { # rodar_backup_com_registro <modo-curl>
  RAMIELLE_BACKUP_DIR="$SANDBOX/dest" \
  RAMIELLE_BACKUP_KEEP=30 \
  WRANGLER_BIN="$SANDBOX/bin/wrangler-falso" \
  RAMIELLE_CURL_BIN="$SANDBOX/bin/curl-falso" \
  RAMIELLE_ADMIN_COOKIE='cookie-de-teste' \
  MODO_CURL="$1" \
  CURL_LOG_MARCA="$SANDBOX/curl-chamado.marca" \
  CURL_LOG_BODY="$SANDBOX/curl-body.log" \
    bash "$ALVO" > "$SANDBOX/saida.log" 2>&1
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

# --- 9. primeira execução da vida (sem backup anterior): um dump SÓ-DDL tem
#        que ser RECUSADO mesmo assim ------------------------------------------
# ⚠️ Este cenário fixava o comportamento OPOSTO até a revisão final da fatia ④
# ("sem backup anterior, dump pequeno ainda é aceito", exit 0). Era um buraco
# real: a comparação de tamanho é pulada quando não há backup anterior, e a
# PRIMEIRA execução da vida deste script é exatamente o passo 11 do runbook de
# cutover — logo depois do import, quando o D1 vira o único registro do
# histórico. Um "backup" só-DDL ali significa o dono acreditar que tem cópia e
# não ter. A guarda `grep -q 'INSERT INTO'` fecha isso.
montar_sandbox ddl_apenas
rodar_backup 30
checar "sem backup anterior, dump SÓ-DDL é RECUSADO (não vira falso backup)" 1 "$?"
checar "nada foi gravado" 0 "$(contar_backups)"
limpar_sandbox

# --- 10. primeira execução da vida com dump LEGÍTIMO continua sendo aceita ---
# Contraprova do cenário 9: a guarda nova recusa só-DDL, não recusa um backup
# pequeno e válido. Sem este teste, um fix que recusasse tudo passaria.
montar_sandbox ok
rodar_backup 30
checar "sem backup anterior, dump COM INSERT é aceito" 0 "$?"
checar "grava o primeiro backup" 1 "$(contar_backups)"
limpar_sandbox

# --- 11. sem RAMIELLE_ADMIN_COOKIE, o registro no painel é PULADO — curl
#         nunca é chamado, e o backup em disco não é afetado ---------------
montar_sandbox ok
montar_curl_stub
rodar_backup_sem_registro
checar "sem cookie, o backup ainda sai com 0" 0 "$?"
checar "sem cookie, o backup ainda é gravado" 1 "$(contar_backups)"
if [ -e "$SANDBOX/curl-chamado.marca" ]; then
  nok "sem cookie, curl NÃO deveria ter sido chamado"
else
  ok "sem cookie, curl nunca é chamado (registro pulado de verdade, não só 'falha silenciosa')"
fi
if grep -q 'registro no painel pulado' "$SANDBOX/saida.log"; then
  ok "avisa que o registro foi pulado"
else
  nok "não avisou que o registro foi pulado"
fi
limpar_sandbox

# --- 12. registro bem-sucedido (curl devolve 201) --------------------------
montar_sandbox ok
montar_curl_stub
rodar_backup_com_registro sucesso
checar "registro bem-sucedido: script sai com 0" 0 "$?"
checar "registro bem-sucedido: backup gravado" 1 "$(contar_backups)"
if [ -e "$SANDBOX/curl-chamado.marca" ]; then
  ok "curl foi chamado"
else
  nok "curl deveria ter sido chamado (RAMIELLE_ADMIN_COOKIE estava configurado)"
fi
if grep -q '"file_name":"ramielle-' "$SANDBOX/curl-body.log" 2>/dev/null; then
  ok "o corpo enviado inclui file_name com o nome real do arquivo"
else
  nok "o corpo enviado não tem file_name (ou está errado)"
fi
if grep -q 'registrado no painel admin' "$SANDBOX/saida.log"; then
  ok "confirma o registro no log"
else
  nok "não confirmou o registro no log"
fi
limpar_sandbox

# --- 13. registro falha por HTTP != 201 (ex.: 403) — NÃO invalida o backup -
# O arquivo .sql.gz já está gravado e validado ANTES deste passo rodar; o
# registro é só metadado. Isto é o requisito central do fix (ROADMAP.md § 1):
# falhar ao registrar não pode fazer o dono achar que perdeu o backup.
montar_sandbox ok
montar_curl_stub
rodar_backup_com_registro http-erro
checar "registro c/ HTTP de erro: script AINDA sai com 0" 0 "$?"
checar "registro c/ HTTP de erro: backup AINDA é gravado" 1 "$(contar_backups)"
if grep -q 'aviso: registro do backup respondeu HTTP 403' "$SANDBOX/saida.log"; then
  ok "avisa o HTTP de erro em stderr sem derrubar o script"
else
  nok "não avisou o HTTP de erro corretamente"
fi
limpar_sandbox

# --- 14. registro falha por erro de transporte (curl sai != 0) — MESMO
#         efeito do cenário 13: falha suave, backup intocado ---------------
montar_sandbox ok
montar_curl_stub
rodar_backup_com_registro rede-falha
checar "registro c/ falha de rede: script AINDA sai com 0" 0 "$?"
checar "registro c/ falha de rede: backup AINDA é gravado" 1 "$(contar_backups)"
if grep -q 'aviso: falha ao registrar o backup no painel' "$SANDBOX/saida.log"; then
  ok "avisa a falha de transporte em stderr sem derrubar o script"
else
  nok "não avisou a falha de transporte corretamente"
fi
limpar_sandbox

echo
echo "$passou passaram, $falhou falharam"
[ "$falhou" -eq 0 ]
