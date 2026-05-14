.PHONY: dev dev-web dev-api build-api build-cli test lint clean

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
