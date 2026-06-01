package router

import (
	"context"
	"database/sql"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/alexedwards/scs/v2"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/PiluVitu/api/internal/auth"
	"github.com/PiluVitu/api/internal/handlers"
	handlersadmin "github.com/PiluVitu/api/internal/handlers/admin"
	handlersvotacao "github.com/PiluVitu/api/internal/handlers/votacao"
	"github.com/PiluVitu/api/internal/logging"
	"github.com/PiluVitu/api/internal/votacao"
)

// Deps holds external dependencies injected into the router.
type Deps struct {
	DB              *sql.DB
	Sessions        *scs.SessionManager
	AuthHandlers    *auth.Handlers
	VotacaoHandlers *handlersvotacao.Handlers
	AdminHandlers   *handlersadmin.Handlers
	Store           *votacao.Store
}

var defaultAllowedOrigins = []string{
	"http://localhost:3333",
	"https://piluvitu.com.br",
}

func New(deps Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(logging.Middleware(slog.Default()))
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(corsOptions()))

	if deps.Sessions != nil {
		r.Use(deps.Sessions.LoadAndSave)
	}

	r.Get("/health", healthHandler(deps.DB))

	if deps.AuthHandlers != nil {
		r.Route("/auth", func(r chi.Router) {
			r.Get("/google/login", deps.AuthHandlers.Login)
			r.Get("/google/callback", deps.AuthHandlers.Callback)
			r.Get("/me", deps.AuthHandlers.Me)
			r.Post("/logout", deps.AuthHandlers.Logout)
		})
	}

	if deps.VotacaoHandlers != nil && deps.Store != nil && deps.Sessions != nil {
		r.Route("/votacao", func(r chi.Router) {
			r.With(auth.RequireAuth(deps.Sessions, deps.Store)).Get("/categorias", deps.VotacaoHandlers.GetCategorias)
			r.With(auth.RequireAuth(deps.Sessions, deps.Store)).Get("/sessions", deps.VotacaoHandlers.ListSessions)
			r.With(auth.RequireAuth(deps.Sessions, deps.Store)).Get("/sessions/{id}", deps.VotacaoHandlers.GetSession)
			r.With(auth.RequireAdmin(deps.Sessions, deps.Store)).Post("/sessions", deps.VotacaoHandlers.CreateSession)
			r.With(auth.RequireAuth(deps.Sessions, deps.Store)).Post("/sessions/{id}/votes", deps.VotacaoHandlers.CreateVote)
			r.With(auth.RequireAuth(deps.Sessions, deps.Store)).Get("/sessions/{id}/results", deps.VotacaoHandlers.GetResults)
			r.With(auth.RequireAdmin(deps.Sessions, deps.Store)).Get("/sessions/{id}/votes", deps.VotacaoHandlers.ListSessionVotes)
			r.With(auth.RequireAdmin(deps.Sessions, deps.Store)).Post("/sessions/{id}/close", deps.VotacaoHandlers.CloseSession)
			r.With(auth.RequireAdmin(deps.Sessions, deps.Store)).Post("/sessions/{id}/runoff", deps.VotacaoHandlers.CreateRunoff)
		})
	}

	if deps.AdminHandlers != nil && deps.Store != nil && deps.Sessions != nil {
		r.Route("/admin", func(r chi.Router) {
			r.With(auth.RequireAdmin(deps.Sessions, deps.Store)).Post("/backup", deps.AdminHandlers.CreateBackup)
			r.With(auth.RequireAdmin(deps.Sessions, deps.Store)).Get("/backups", deps.AdminHandlers.ListBackups)
			r.With(auth.RequireAdmin(deps.Sessions, deps.Store)).Get("/users", deps.AdminHandlers.ListUsers)
		})
	}

	r.Route("/tools", func(r chi.Router) {
		r.Post("/cpf/validate", handlers.ValidateCPF)
		r.Get("/cpf/generate", handlers.GenerateCPF)
		r.Post("/cnpj/validate", handlers.ValidateCNPJ)
		r.Get("/cnpj/generate", handlers.GenerateCNPJ)
		r.Post("/base64/encode", handlers.EncodeBase64)
		r.Post("/base64/decode", handlers.DecodeBase64)
		r.Post("/jwt/decode", handlers.DecodeJWT)
		r.Post("/json/format", handlers.FormatJSON)
		r.Post("/json/minify", handlers.MinifyJSON)
		r.Post("/json/validate", handlers.ValidateJSON)
		r.Get("/uuid", handlers.GenerateUUID)
		r.Post("/qr/encode", handlers.EncodeQR)
		r.Post("/qr/decode", handlers.DecodeQR)
	})

	return r
}

func healthHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if db != nil {
			ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
			defer cancel()
			if err := db.PingContext(ctx); err != nil {
				w.WriteHeader(http.StatusServiceUnavailable)
				_, _ = w.Write([]byte(`{"ok":false,"db":"down"}`))
				return
			}
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"ok":true,"db":"up"}`))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}
}

func corsOptions() cors.Options {
	return cors.Options{
		AllowedOrigins:   allowedOrigins(),
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}
}

func allowedOrigins() []string {
	raw := strings.TrimSpace(os.Getenv("CORS_ALLOWED_ORIGINS"))
	if raw == "" {
		return defaultAllowedOrigins
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if v := strings.TrimSpace(p); v != "" {
			out = append(out, v)
		}
	}
	if len(out) == 0 {
		return defaultAllowedOrigins
	}
	return out
}
