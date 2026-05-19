package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/PiluVitu/api/internal/auth"
	"github.com/PiluVitu/api/internal/gsheets"
	handlersvotacao "github.com/PiluVitu/api/internal/handlers/votacao"
	"github.com/PiluVitu/api/internal/router"
	"github.com/PiluVitu/api/internal/tmdb"
	"github.com/PiluVitu/api/internal/votacao"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	dbPath := os.Getenv("SQLITE_PATH")
	if dbPath == "" {
		dbPath = "/data/votacao.db"
	}

	store, err := votacao.NewStore(dbPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "db: %v\n", err)
		os.Exit(1)
	}
	defer store.Close()

	cfg, err := auth.ConfigFromEnv()
	if err != nil {
		fmt.Fprintf(os.Stderr, "auth config: %v\n", err)
		os.Exit(1)
	}
	sm := auth.NewSessionManager(store.DB())
	if strings.EqualFold(os.Getenv("SESSION_COOKIE_SECURE"), "true") {
		sm.Cookie.Secure = true
	}
	authHandlers := auth.NewHandlers(auth.HandlersDeps{
		Store: store, Sessions: sm, Config: cfg,
		Exchanger: auth.NewGoogleTokenExchanger(cfg),
		Verifier:  auth.NewGoogleIDTokenVerifier(),
	})

	var sheetsClient handlersvotacao.SheetsReader
	if sheetID := os.Getenv("GSHEETS_MOVIES_SPREADSHEET_ID"); sheetID != "" {
		rangeA1 := os.Getenv("GSHEETS_MOVIES_RANGE")
		if rangeA1 == "" {
			rangeA1 = "A2:F"
		}
		c, gerr := gsheets.NewClient(context.Background(), sheetID, rangeA1)
		if gerr != nil {
			fmt.Fprintf(os.Stderr, "gsheets: %v (continuing without sheets)\n", gerr)
		} else {
			sheetsClient = c
		}
	}

	var postersClient handlersvotacao.PosterSearcher
	if key := os.Getenv("TMDB_API_KEY"); key != "" {
		postersClient = tmdb.NewClient(key)
	}

	votH := handlersvotacao.NewHandlers(handlersvotacao.Deps{
		Store: store, Sheets: sheetsClient, Posters: postersClient,
	})

	handler := router.New(router.Deps{
		DB: store.DB(), Sessions: sm,
		AuthHandlers: authHandlers, VotacaoHandlers: votH, Store: store,
	})

	addr := ":" + port
	fmt.Printf("API listening on %s (db=%s)\n", addr, dbPath)
	if err := http.ListenAndServe(addr, handler); err != nil {
		fmt.Fprintf(os.Stderr, "server error: %v\n", err)
		os.Exit(1)
	}
}
