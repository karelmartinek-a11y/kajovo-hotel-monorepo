package server

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"time"

	"github.com/modelcontextprotocol/go-sdk/auth"
)

type Client struct {
	ID        string    `json:"id"`
	SHA256    string    `json:"sha256"`
	ExpiresAt time.Time `json:"expires_at"`
	Revoked   bool      `json:"revoked"`
}
type clientFile struct {
	Clients []Client `json:"clients"`
}

func ClientVerifier(path string) auth.TokenVerifier {
	return func(ctx context.Context, token string, req *http.Request) (*auth.TokenInfo, error) {
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, errors.New("authorization unavailable")
		}
		var f clientFile
		if json.Unmarshal(data, &f) != nil {
			return nil, errors.New("authorization unavailable")
		}
		sum := sha256.Sum256([]byte(token))
		for _, c := range f.Clients {
			digest, err := hex.DecodeString(c.SHA256)
			if err != nil || len(digest) != 32 {
				continue
			}
			if subtle.ConstantTimeCompare(sum[:], digest) == 1 {
				if c.ID == "" || c.Revoked || c.ExpiresAt.IsZero() || !c.ExpiresAt.After(time.Now()) {
					return nil, auth.ErrInvalidToken
				}
				return &auth.TokenInfo{UserID: c.ID, Expiration: c.ExpiresAt}, nil
			}
		}
		return nil, auth.ErrInvalidToken
	}
}
