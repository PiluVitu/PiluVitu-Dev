package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/PiluVitu/api/internal/auth"
	"github.com/PiluVitu/api/internal/backup"
	"github.com/PiluVitu/api/internal/gdrive"
	"github.com/PiluVitu/api/internal/gsheets"
	handlersadmin "github.com/PiluVitu/api/internal/handlers/admin"
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

	var runner *backup.Runner
	if folder := os.Getenv("GDRIVE_BACKUP_FOLDER_ID"); folder != "" {
		drv, gerr := gdrive.NewClient(context.Background())
		if gerr != nil {
			fmt.Fprintf(os.Stderr, "gdrive: %v (continuing without backup)\n", gerr)
		} else {
			keep, _ := strconv.Atoi(os.Getenv("GDRIVE_BACKUP_KEEP"))
			if keep <= 0 {
				keep = 30
			}
			runner = &backup.Runner{Store: store, Uploader: drv, FolderID: folder, Keep: keep}
		}
	}

	var backuper handlersvotacao.Backuper
	if runner != nil {
		backuper = runner
	}
	votH := handlersvotacao.NewHandlers(handlersvotacao.Deps{
		Store: store, Sheets: sheetsClient, Posters: postersClient, Backuper: backuper,
	})

	var adminBackup handlersadmin.BackupRunner
	if runner != nil {
		adminBackup = runner
	}
	adminH := handlersadmin.NewHandlers(handlersadmin.Deps{Store: store, Runner: adminBackup})

	// Cron — only start if both runner and BACKUP_CRON set.
	if runner != nil {
		spec := os.Getenv("BACKUP_CRON")
		if spec == "" {
			spec = "0 3 * * *"
		}
		_, cerr := backup.Start(context.Background(), spec, func(ctx context.Context) {
			if err := runner.Run(ctx, "cron"); err != nil {
				fmt.Fprintf(os.Stderr, "backup cron: %v\n", err)
			}
		})
		if cerr != nil {
			fmt.Fprintf(os.Stderr, "backup cron start: %v (continuing without cron)\n", cerr)
		} else {
			fmt.Printf("Backup cron scheduled (%s)\n", spec)
		}
	}

	handler := router.New(router.Deps{
		DB: store.DB(), Sessions: sm,
		AuthHandlers: authHandlers, VotacaoHandlers: votH,
		AdminHandlers: adminH, Store: store,
	})

	addr := ":" + port
	fmt.Printf("API listening on %s (db=%s)\n", addr, dbPath)
	if err := http.ListenAndServe(addr, handler); err != nil {
		fmt.Fprintf(os.Stderr, "server error: %v\n", err)
		os.Exit(1)
	}
}
