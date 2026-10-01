#!/bin/bash
# Sobe o promeia como serviço (sem --reload). Chamado pelo LaunchAgent
# `launchd/com.piluvitu.promeia.plist`; ver "Serviço no login" no CLAUDE.md.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

exec uv run uvicorn promeia.app:create_app --factory --host 127.0.0.1 --port 8082
