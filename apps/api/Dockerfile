# Build stage
FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download
COPY apps/api/ .
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/api ./cmd/api
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/piluvitu ./cmd/cli

# Final stage — distroless static, non-root, tag explícita
FROM gcr.io/distroless/static-debian12:nonroot@sha256:d093aa3e30dbadd3efe1310db061a14da60299baff8450a17fe0ccc514a16639
COPY --from=builder /bin/api /api
USER nonroot:nonroot
EXPOSE 8080
# Distroless não tem shell nem curl, então o healthcheck é feito pelo orquestrador
# (Cloud Run/Compose verificam a /health diretamente). Ver .trivyignore.
CMD ["/api"]
