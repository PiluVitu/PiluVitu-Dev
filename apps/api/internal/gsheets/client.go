package gsheets

import (
	"context"
	"fmt"

	"google.golang.org/api/option"
	"google.golang.org/api/sheets/v4"
)

// Client is a thin wrapper around the Google Sheets v4 service.
// Production code calls NewClient with a Service Account JSON path
// (via GOOGLE_APPLICATION_CREDENTIALS). Tests construct a *sheets.Service
// against an httptest.Server and call NewClientWithService.
type Client struct {
	svc           *sheets.Service
	spreadsheetID string
	rangeA1       string
}

// NewClient builds a Sheets client using Application Default Credentials.
// In production the SA JSON is loaded via the GOOGLE_APPLICATION_CREDENTIALS
// env var; in CI/dev without that env, this will fail at boot — by design.
func NewClient(ctx context.Context, spreadsheetID, rangeA1 string) (*Client, error) {
	svc, err := sheets.NewService(ctx, option.WithScopes(sheets.SpreadsheetsReadonlyScope))
	if err != nil {
		return nil, fmt.Errorf("gsheets: build service: %w", err)
	}
	return NewClientWithService(svc, spreadsheetID, rangeA1), nil
}

// NewClientWithService constructs a Client around a pre-built *sheets.Service.
// Used by tests that point the service at an httptest.Server.
func NewClientWithService(svc *sheets.Service, spreadsheetID, rangeA1 string) *Client {
	return &Client{svc: svc, spreadsheetID: spreadsheetID, rangeA1: rangeA1}
}
