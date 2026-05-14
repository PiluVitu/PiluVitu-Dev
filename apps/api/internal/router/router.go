package router

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/PiluVitu/api/internal/handlers"
)

func New() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

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
