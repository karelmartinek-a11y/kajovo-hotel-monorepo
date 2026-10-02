package server

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// PublicHandler is served only on the restricted Unix socket. The proxy must
// overwrite forwarded headers rather than append caller-supplied values.
func PublicHandler(service *Service, verifier auth.TokenVerifier, publicHost string) http.Handler {
	model := service.MCP()
	handler := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return model }, &mcp.StreamableHTTPOptions{Stateless: true, JSONResponse: true})
	mux := http.NewServeMux()
	slots := make(chan struct{}, 4)
	mux.Handle("/mcp", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case slots <- struct{}{}:
			defer func() { <-slots }()
			handler.ServeHTTP(w, r)
		default:
			w.Header().Set("Retry-After", "1")
			http.Error(w, "service busy", http.StatusServiceUnavailable)
		}
	}))
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "method not allowed", 405)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ready","server":"KajaVoiceHA"}`))
	})
	host := strings.ToLower(publicHost)
	wrapped := auth.RequireBearerToken(verifier, nil)(mux)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.ToLower(r.Host) != host || r.Header.Get("X-Forwarded-Proto") != "https" {
			http.Error(w, "public HTTPS route required", 403)
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" {
			u, err := url.Parse(origin)
			if err != nil || u.Scheme != "https" || strings.ToLower(u.Host) != host {
				http.Error(w, "origin not allowed", 403)
				return
			}
		}
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)
		wrapped.ServeHTTP(w, r)
	})
}
