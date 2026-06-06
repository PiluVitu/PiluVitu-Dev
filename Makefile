.PHONY: dev dev-web dev-api storybook build-api build-cli test test-go test-web test-e2e lint clean stop \
        compose-up compose-down tunnel-up tunnel-down tunnel-logs

dev-web:
	pnpm --filter @piluvitu/web dev

# Storybook (componentes) em http://localhost:6017
storybook:
	pnpm --filter @piluvitu/web storybook

# Hot reload via air (config in apps/api/.air.toml). air is run through
# `go run` so it needs no global install and stays out of the API's go.mod.
# .env is sourced before launch so air's child binary inherits it (and keeps
# it across reloads). Edits to .env still need a restart.
dev-api:
	mkdir -p apps/api/tmp
	cd apps/api && set -a && [ -f .env ] && . ./.env; set +a && go run github.com/air-verse/air@latest

# Sobe web + Go API + Storybook em paralelo
dev:
	make -j3 dev-web dev-api storybook

# Escape hatch: free the dev ports if a process got stuck (rare with air,
# handy after a hard crash). macOS/BSD-safe (no GNU xargs -r).
stop:
	@for p in 8081 3333 6017; do \
		pids=$$(lsof -ti tcp:$$p -sTCP:LISTEN 2>/dev/null); \
		if [ -n "$$pids" ]; then kill $$pids 2>/dev/null && echo "killed :$$p ($$pids)"; else echo ":$$p free"; fi; \
	done

build-api:
	cd apps/api && go build -o ../../bin/api ./cmd/api

build-cli:
	cd apps/api && go build -o ../../bin/piluvitu ./cmd/cli

test:
	pnpm -r test && cd apps/api && go test ./...

test-go:
	cd apps/api && go test ./... -v

test-web:
	pnpm --filter @piluvitu/web test

test-e2e:
	pnpm --filter @piluvitu/web test:e2e

lint:
	pnpm -r lint && cd apps/api && go vet ./...

clean:
	rm -rf bin/ apps/api/api apps/api/piluvitu

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
