package gdrive

import (
	"context"
	"fmt"
	"io"

	"google.golang.org/api/drive/v3"
	"google.golang.org/api/option"
)

// Uploader is the surface used by the backup runner. Defined here so tests
// can stub it without depending on drive/v3.
type Uploader interface {
	Upload(ctx context.Context, folderID, name string, body io.Reader) (fileID string, sizeBytes int64, err error)
	Rotate(ctx context.Context, folderID string, keep int) error
}

// Client wraps a *drive.Service.
type Client struct {
	svc *drive.Service
}

// NewClient builds a Drive client via Application Default Credentials.
func NewClient(ctx context.Context) (*Client, error) {
	svc, err := drive.NewService(ctx, option.WithScopes(drive.DriveFileScope))
	if err != nil {
		return nil, fmt.Errorf("gdrive: build service: %w", err)
	}
	return &Client{svc: svc}, nil
}

// NewClientWithService is the test seam.
func NewClientWithService(svc *drive.Service) *Client { return &Client{svc: svc} }
