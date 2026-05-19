.PHONY: dev dev-web dev-api build-api build-cli test test-go test-web test-e2e lint clean \
        compose-up compose-down tunnel-up tunnel-down tunnel-logs

dev-web:
	pnpm --filter @piluvitu/web dev

dev-api:
	cd apps/api && go run ./cmd/api

dev:
	make -j2 dev-web dev-api

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
