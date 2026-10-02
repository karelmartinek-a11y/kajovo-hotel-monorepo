package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func testVerifier(ctx context.Context, token string, r *http.Request) (*auth.TokenInfo, error) {
	if token != "unit-bearer" {
		return nil, auth.ErrInvalidToken
	}
	return &auth.TokenInfo{UserID: "voice-main", Expiration: time.Now().Add(time.Hour)}, nil
}
func TestPublicHTTPBoundaryAndProtocols(t *testing.T) {
	s, _ := fixture(t)
	handler := PublicHandler(s, testVerifier, "mcp.example.test")
	request := func(version, method string, params map[string]any, token, host, proto, origin string) *httptest.ResponseRecorder {
		if strings.HasPrefix(version, "2026-") {
			if params == nil {
				params = map[string]any{}
			}
			params["_meta"] = map[string]any{mcp.MetaKeyProtocolVersion: version, mcp.MetaKeyClientCapabilities: map[string]any{}, mcp.MetaKeyClientInfo: map[string]any{"name": "unit-client", "version": "1"}}
		}
		data, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
		r := httptest.NewRequest("POST", "https://"+host+"/mcp", bytes.NewReader(data))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Accept", "application/json, text/event-stream")
		r.Header.Set("MCP-Protocol-Version", version)
		r.Header.Set("Mcp-Method", method)
		if name, ok := params["name"].(string); ok {
			r.Header.Set("Mcp-Name", name)
		}
		r.Header.Set("X-Forwarded-Proto", proto)
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	params := func() map[string]any {
		return map[string]any{"name": "smart_technologie", "arguments": map[string]any{"operation": "catalog"}}
	}
	for _, tc := range []struct {
		token, host, proto, origin string
		status                     int
	}{{"", "mcp.example.test", "https", "", 401}, {"wrong", "mcp.example.test", "https", "", 401}, {"unit-bearer", "localhost", "https", "", 403}, {"unit-bearer", "mcp.example.test", "http", "", 403}, {"unit-bearer", "mcp.example.test", "https", "https://evil.example", 403}} {
		if got := request("2026-07-28", "tools/call", params(), tc.token, tc.host, tc.proto, tc.origin); got.Code != tc.status {
			t.Fatalf("status %d expected %d", got.Code, tc.status)
		}
	}
	newer := request("2026-07-28", "tools/call", params(), "unit-bearer", "mcp.example.test", "https", "")
	if newer.Code != 200 {
		t.Fatalf("new protocol failed %d %s", newer.Code, newer.Body.String())
	}
	var wire struct {
		Result struct {
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
			IsError bool `json:"isError"`
		} `json:"result"`
	}
	if err := json.Unmarshal(newer.Body.Bytes(), &wire); err != nil || wire.Result.IsError || len(wire.Result.Content) != 1 {
		t.Fatalf("bad tool output %s", newer.Body.String())
	}
	var out Response
	if json.Unmarshal([]byte(wire.Result.Content[0].Text), &out) != nil || len(out.Devices) != 4 || len(out.Fields) != 8 {
		t.Fatal("protocol omitted full catalog")
	}
	init := request("2025-11-25", "initialize", map[string]any{"protocolVersion": "2025-11-25", "clientInfo": map[string]any{"name": "legacy-unit", "version": "1"}, "capabilities": map[string]any{}}, "unit-bearer", "mcp.example.test", "https", "")
	if init.Code != 200 {
		t.Fatalf("legacy initialization failed %d %s", init.Code, init.Body.String())
	}
	legacy := request("2025-11-25", "tools/call", params(), "unit-bearer", "mcp.example.test", "https", "")
	if legacy.Code != 200 || !bytes.Contains(legacy.Body.Bytes(), []byte("fixture-revision")) {
		t.Fatalf("legacy call failed %d %s", legacy.Code, legacy.Body.String())
	}
	tools := request("2026-07-28", "tools/list", map[string]any{}, "unit-bearer", "mcp.example.test", "https", "")
	if tools.Code != 200 || bytes.Count(tools.Body.Bytes(), []byte(`"name":"smart_technologie"`)) != 1 {
		t.Fatalf("single tool discovery failed %s", tools.Body.String())
	}
}
func TestPrivateExtraEntityCannotBeSelected(t *testing.T) {
	s, f := fixture(t)
	f.states["light.unlisted"] = State{EntityID: "light.unlisted", State: "on", Attributes: map[string]any{}}
	in := controlRequest("unlisted-01", 5)
	out := decode(t, s.Handle(context.Background(), "a", in))
	if out.Results[0].Status != "invalid_action" || len(f.calls) != 0 {
		t.Fatal("unlisted row dispatched")
	}
	result := s.Handle(context.Background(), "a", Request{Operation: "catalog"})
	data, _ := json.Marshal(result)
	if bytes.Contains(data, []byte("light.unlisted")) {
		t.Fatal("unlisted entity leaked")
	}
}
func TestConcurrentCatalogAndCameraBusy(t *testing.T) {
	s, _ := fixture(t)
	s.camera.Lock()
	defer s.camera.Unlock()
	result := s.Handle(context.Background(), "a", Request{Operation: "camera_view", CatalogRevision: s.Catalog.Revision, Rows: []int{4}})
	if decode(t, result).Results[0].Status != "busy" {
		t.Fatal("camera concurrency gate failed")
	}
	done := make(chan struct{}, 8)
	for i := 0; i < 8; i++ {
		go func() { s.Handle(context.Background(), "a", Request{Operation: "catalog"}); done <- struct{}{} }()
	}
	for i := 0; i < 8; i++ {
		<-done
	}
}
func TestHTTPConcurrencyIsBounded(t *testing.T) {
	s, f := fixture(t)
	gate := make(chan struct{})
	entered := make(chan struct{}, 4)
	f.stateGate = gate
	f.stateEntered = entered
	handler := PublicHandler(s, testVerifier, "mcp.example.test")
	body := []byte(`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"smart_technologie","arguments":{"operation":"catalog"}}}`)
	call := func() *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "https://mcp.example.test/mcp", bytes.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Accept", "application/json, text/event-stream")
		r.Header.Set("MCP-Protocol-Version", "2025-11-25")
		r.Header.Set("Authorization", "Bearer unit-bearer")
		r.Header.Set("X-Forwarded-Proto", "https")
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	done := make(chan int, 4)
	for i := 0; i < 4; i++ {
		go func() { done <- call().Code }()
	}
	for i := 0; i < 4; i++ {
		select {
		case <-entered:
		case <-time.After(time.Second):
			close(gate)
			t.Fatal("concurrent requests did not enter")
		}
	}
	full := call()
	if full.Code != 503 || full.Body.String() != "service busy\n" {
		close(gate)
		t.Fatalf("expected bounded busy, got %d %s", full.Code, full.Body.String())
	}
	close(gate)
	for i := 0; i < 4; i++ {
		if <-done != 200 {
			t.Fatal("accepted request failed")
		}
	}
}
