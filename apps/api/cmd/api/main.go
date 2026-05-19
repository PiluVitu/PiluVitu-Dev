package main

import (
	"fmt"
	"net/http"
	"os"

	"github.com/PiluVitu/api/internal/router"
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

	handler := router.New(router.Deps{DB: store.DB()})

	addr := ":" + port
	fmt.Printf("API listening on %s (db=%s)\n", addr, dbPath)
	if err := http.ListenAndServe(addr, handler); err != nil {
		fmt.Fprintf(os.Stderr, "server error: %v\n", err)
		os.Exit(1)
	}
}
