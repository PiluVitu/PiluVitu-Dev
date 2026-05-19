package router

import (
	"net/http"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/PiluVitu/api/internal/handlers"
)

// defaultAllowedOrigins é usado quando CORS_ALLOWED_ORIGINS não está definido.
var defaultAllowedOrigins = []string{
	"http://localhost:3333",
	"https://piluvitu.com.br",
}

func New() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(corsOptions()))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"ok":true}`))
	})

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

func corsOptions() cors.Options {
	return cors.Options{
		AllowedOrigins:   allowedOrigins(),
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: false,
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
