package main

import (
	"fmt"
	"net/http"
	"os"

	"github.com/PiluVitu/api/internal/router"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	handler := router.New()
	addr := ":" + port
	fmt.Printf("API listening on %s\n", addr)
	if err := http.ListenAndServe(addr, handler); err != nil {
		fmt.Fprintf(os.Stderr, "server error: %v\n", err)
		os.Exit(1)
	}
}
