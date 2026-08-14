.PHONY: dev dev-web dev-api storybook stack build-api build-cli test test-go test-web test-e2e lint clean stop \
        compose-up compose-down tunnel-up tunnel-down tunnel-logs \
        backup-financas backup-financas-test \
        backup-ramielle backup-ramielle-test \
        dev-promeia test-promeia lint-promeia insight \
        dev-ramielle test-ramielle

dev-web:
	pnpm --filter @piluvitu/web dev

# Storybook (componentes) em http://localhost:6017
storybook:
	pnpm --filter @piluvitu/web storybook

# Hot reload via air (config in apps/api/.air.toml). air is run through
# `go run` so it needs no global install and stays out of the API's go.mod.
# .env is sourced before launch so air's child binary inherits it (and keeps
# it across reloads). Edits to .env still need a restart.
# ⚠️ APOSENTADA. A Go nao serve mais trafego desde 2026-08-14 — a votacao esta
# no ramielle e a inferencia no promeia. Este alvo fica so para inspecionar o
# codigo de referencia de paridade, que continua em apps/api de proposito.
dev-api:
	mkdir -p apps/api/tmp
	cd apps/api && set -a && [ -f .env ] && . ./.env; set +a && go run github.com/air-verse/air@latest

# Sobe web + Storybook em paralelo. A Go saiu daqui em 2026-08-14 — ela nao
# serve mais trafego (ver docs/superpowers/ROADMAP.md).
dev:
	make -j2 dev-web storybook

# Escape hatch: free the dev ports if a process got stuck (rare with air,
# handy after a hard crash). macOS/BSD-safe (no GNU xargs -r).
stop:
	@for p in 8081 8082 3333 6017; do \
		pids=$$(lsof -ti tcp:$$p -sTCP:LISTEN 2>/dev/null); \
		if [ -n "$$pids" ]; then kill $$pids 2>/dev/null && echo "killed :$$p ($$pids)"; else echo ":$$p free"; fi; \
	done

# ⚠️ Sobe a Go APOSENTADA junto. Para o promeia + tunel, use `make tunnel-up`.
stack: ## [legado] Ollama + Go API + tunel (process-compose)
	process-compose up

# ⚠️ APOSENTADO — nada em producao consome este binario.
build-api:
	cd apps/api && go build -o ../../bin/api ./cmd/api

# O CLI de terminal (cpf/cnpj/base64/jwt/json/uuid/qr). Unico alvo Go que
# continua fazendo sentido: as mesmas 7 ferramentas existem em packages/tools,
# mas o front de terminal e so dele.
build-cli:
	cd apps/api && go build -o ../../bin/piluvitu ./cmd/cli

test:
	pnpm -r test && cd apps/promeia && uv run pytest

test-go:
	cd apps/api && go test ./... -v

test-web:
	pnpm --filter @piluvitu/web test

# --- ramielle (Cloudflare Worker Hono + D1) ---
# Porta 8788, não 8787: o wrangler dev do finanças já ocupa 8787 por default
# (ver comentário de dev-promeia abaixo) — os dois precisam poder rodar ao
# mesmo tempo sem colidir.
dev-ramielle:
	pnpm --filter @piluvitu/ramielle dev --port 8788

test-ramielle:
	pnpm --filter @piluvitu/ramielle test

# --- promeia (serviço Python local) ---
# Porta 8082: 8080 é a Go no docker, 8081 a Go em dev, 3333 o web,
# 6017 o Storybook, 5273 o Vite do financas, 8787 o wrangler, 11434 o Ollama.
dev-promeia:
	cd apps/promeia && uv run uvicorn promeia.app:create_app --factory --reload --port 8082

test-promeia:
	cd apps/promeia && uv run pytest

lint-promeia:
	cd apps/promeia && uv run ruff check . && uv run ruff format --check .

# Gera e publica o insight financeiro. Exige Ollama de pé e PROMEIA_TOKEN +
# INGEST_TOKEN no ambiente. Nada precisa continuar rodando depois.
#
# `uv run` NÃO lê .env sozinho (só com --env-file, que erra se o arquivo não
# existir — quebraria quem exporta as vars na mão sem ter copiado o .env.example).
# Mesmo padrão de dev-api: source condicional, só se o arquivo existir.
insight:
	cd apps/promeia && set -a && [ -f .env ] && . ./.env; set +a && uv run promeia-insight

test-e2e:
	pnpm --filter @piluvitu/web test:e2e

lint:
	pnpm -r lint && cd ../promeia && uv run ruff check . && uv run ruff format --check .

clean:
	rm -rf bin/ apps/api/api apps/api/piluvitu

# --- Backup do D1 (finanças) ---
# Export lógico de produção, comprimido, com rotação. Só LÊ o D1.
# Destino default ~/Backups/financas, 30 arquivos; ajuste por env:
#   FINANCAS_BACKUP_DIR=/outro/lugar FINANCAS_BACKUP_KEEP=7 make backup-financas
backup-financas:
	cd apps/financas && ./scripts/backup-d1.sh

backup-financas-test:
	cd apps/financas && ./scripts/backup-d1.test.sh

# --- Backup do D1 (ramielle) ---
# Mesmo desenho do backup do finanças acima, script irmão (apps/ramielle/
# scripts/backup-d1.sh) — ver o comentário daquele arquivo pro porquê de um
# irmão em vez de generalizar o do finanças. Destino default
# ~/Backups/ramielle, 30 arquivos; ajuste por env:
#   RAMIELLE_BACKUP_DIR=/outro/lugar RAMIELLE_BACKUP_KEEP=7 make backup-ramielle
backup-ramielle:
	cd apps/ramielle && ./scripts/backup-d1.sh

backup-ramielle-test:
	cd apps/ramielle && ./scripts/backup-d1.test.sh

# --- Docker Compose ---
compose-up:
	cd infra && docker compose up -d --build api web

compose-down:
	cd infra && docker compose down

# --- Cloudflare Tunnel ---
# Requer infra/.env com CLOUDFLARE_TUNNEL_TOKEN
# Só sobe api + cloudflared (web fica na Vercel, não precisa rodar localmente)
tunnel-up:
	cd infra && docker compose --env-file .env --profile tunnel up -d --build api cloudflared

tunnel-down:
	cd infra && docker compose --profile tunnel down

tunnel-logs:
	cd infra && docker compose logs -f cloudflared

tunnel-status:
	cd infra && docker compose ps
