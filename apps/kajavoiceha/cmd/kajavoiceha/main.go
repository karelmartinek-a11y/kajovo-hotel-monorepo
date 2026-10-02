package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"kajavoiceha/internal/server"
)

func required(name string) string {
	v := os.Getenv(name)
	if v == "" {
		log.Fatalf("missing setting %s", name)
	}
	return v
}
func main() {
	catalog, err := server.LoadCatalog(required("KAJA_CATALOG_FILE"))
	if err != nil {
		log.Fatal("catalog cannot be loaded")
	}
	if len(os.Args) == 2 && os.Args[1] == "--validate-catalog" {
		json.NewEncoder(os.Stdout).Encode(map[string]any{"revision": catalog.Revision, "rows": len(catalog.Devices), "fields": len(catalog.Fields), "public_bytes": catalog.PublicBytes()})
		return
	}
	cred := required("CREDENTIALS_DIRECTORY")
	token, err := os.ReadFile(filepath.Join(cred, "ha-token"))
	if err != nil {
		log.Fatal("credential cannot be loaded")
	}
	backend, err := server.NewBackend(required("KAJA_BACKEND_URL"), string(token))
	if err != nil {
		log.Fatal("backend cannot be configured")
	}
	journal, err := server.NewJournal(required("KAJA_JOURNAL_FILE"))
	if err != nil {
		log.Fatal("journal cannot be loaded")
	}
	service := &server.Service{Catalog: catalog, Backend: backend, Journal: journal}
	guard := server.PublicHandler(service, server.ClientVerifier(filepath.Join(cred, "clients.json")), required("KAJA_PUBLIC_HOST"))
	sock := required("KAJA_SOCKET")
	if filepath.Ext(sock) != ".sock" {
		log.Fatal("invalid socket setting")
	}
	if info, e := os.Lstat(sock); e == nil {
		if info.Mode()&os.ModeSocket == 0 {
			log.Fatal("socket path exists and is not a socket")
		}
		if conn, e := net.DialTimeout("unix", sock, time.Second); e == nil {
			conn.Close()
			log.Fatal("socket is already active")
		}
		if os.Remove(sock) != nil {
			log.Fatal("stale socket cannot be removed")
		}
	}
	listener, err := net.Listen("unix", sock)
	if err != nil {
		log.Fatal("socket cannot be created")
	}
	defer os.Remove(sock)
	if os.Chmod(sock, 0660) != nil {
		log.Fatal("socket permissions cannot be set")
	}
	httpServer := &http.Server{Handler: guard, ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 90 * time.Second, MaxHeaderBytes: 16 * 1024}
	stop, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	go func() {
		<-stop.Done()
		ctx, c := context.WithTimeout(context.Background(), 10*time.Second)
		defer c()
		httpServer.Shutdown(ctx)
	}()
	log.Print("KajaVoiceHA ready on restricted socket")
	if err = httpServer.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal("HTTP service stopped")
	}
}
