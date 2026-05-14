# Build stage
FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download
COPY apps/api/ .
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/api ./cmd/api
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/piluvitu ./cmd/cli

# Final stage
FROM gcr.io/distroless/static-debian12
COPY --from=builder /bin/api /api
EXPOSE 8080
CMD ["/api"]
