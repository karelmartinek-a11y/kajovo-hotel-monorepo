package server

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

var emptySchema = json.RawMessage(`{"type":"object","additionalProperties":false,"properties":{}}`)

func fixture(t *testing.T) (*Service, *testBackend) {
	t.Helper()
	fake := &testBackend{states: map[string]State{}, calls: []map[string]any{}}
	server := httptest.NewServer(http.HandlerFunc(fake.serve))
	t.Cleanup(server.Close)
	backend, err := NewBackend(server.URL, "unit-only-token")
	if err != nil {
		t.Fatal(err)
	}
	fields := []Field{}
	for _, key := range []string{"name", "location", "kind", "controls", "readings", "current_state", "possible_states", "availability"} {
		fields = append(fields, Field{Key: key, Label: key})
	}
	catalog := &Catalog{Revision: "fixture-revision", Fields: fields, Devices: []Device{
		{Row: 1, Name: "Modré světlo", Location: "Salonek", Kind: "Světlo", Entities: []Entity{{EntityID: "light.fixture_a", Domain: "light"}}, Controls: []Control{{ID: "c01", Label: "Zapnout", EntityID: "light.fixture_a", Domain: "light", Service: "turn_on", Parameters: emptySchema, Supported: true}}, Readings: []Reading{{ID: "r01", Label: "Stav", EntityID: "light.fixture_a", Attribute: "state", ValueMap: map[string]string{"on": "zapnuto", "off": "vypnuto"}}}},
		{Row: 2, Name: "Bílé světlo", Location: "Salonek", Kind: "Světlo", Entities: []Entity{{EntityID: "light.fixture_b", Domain: "light"}}, Controls: []Control{{ID: "c01", Label: "Zapnout", EntityID: "light.fixture_b", Domain: "light", Service: "turn_on", Parameters: emptySchema, Supported: true}}},
		{Row: 3, Name: "Servisní tlačítko", Location: "Recepce", Kind: "Tlačítko", Entities: []Entity{{EntityID: "button.fixture_a", Domain: "button"}}, Controls: []Control{{ID: "c01", Label: "Stisknout", EntityID: "button.fixture_a", Domain: "button", Service: "press", Parameters: emptySchema, Supported: true}}},
		{Row: 4, Name: "Kamera", Location: "Vstup", Kind: "Kamera", CameraEntityID: "camera.fixture_a", Entities: []Entity{{EntityID: "camera.fixture_a", Domain: "camera"}}, Controls: []Control{{ID: "c01", Label: "Získat snímek", EntityID: "camera.fixture_a", Domain: "camera", Service: "snapshot", Parameters: emptySchema, Supported: true}, {ID: "c02", Label: "Pořídit záznam", EntityID: "camera.fixture_a", Domain: "camera", Service: "record", Supported: true, RequiredFeatures: 2, Parameters: json.RawMessage(`{"type":"object","additionalProperties":false,"properties":{"duration_sec":{"type":"integer","minimum":1,"maximum":300},"lookback_sec":{"type":"integer","minimum":0,"maximum":30}}}`), ParameterMap: map[string]string{"duration_sec": "duration", "lookback_sec": "lookback"}}}},
	}}
	for _, d := range catalog.Devices {
		for _, e := range d.Entities {
			state := "off"
			attrs := map[string]any{}
			if e.Domain == "button" {
				state = "unknown"
			}
			if e.Domain == "camera" {
				state = "idle"
				attrs["supported_features"] = float64(2)
			}
			fake.states[e.EntityID] = State{EntityID: e.EntityID, State: state, Attributes: attrs}
		}
	}
	if err = catalog.Validate(); err != nil {
		t.Fatal(err)
	}
	journal, err := NewJournal(filepath.Join(t.TempDir(), "journal.json"))
	if err != nil {
		t.Fatal(err)
	}
	return &Service{Catalog: catalog, Backend: backend, Journal: journal}, fake
}

type testBackend struct {
	mu           sync.Mutex
	states       map[string]State
	calls        []map[string]any
	image        []byte
	mime         string
	failWrite    bool
	recordGate   chan struct{}
	stateGate    chan struct{}
	stateEntered chan struct{}
}

func (f *testBackend) serve(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Authorization") != "Bearer unit-only-token" {
		http.Error(w, "unauthorized", 401)
		return
	}
	if r.URL.Path == "/api/states" {
		if f.stateGate != nil {
			f.stateEntered <- struct{}{}
			<-f.stateGate
		}
		f.mu.Lock()
		defer f.mu.Unlock()
		list := []State{}
		for _, s := range f.states {
			list = append(list, s)
		}
		json.NewEncoder(w).Encode(list)
		return
	}
	if strings.HasPrefix(r.URL.Path, "/api/camera_proxy/") {
		f.mu.Lock()
		defer f.mu.Unlock()
		w.Header().Set("Content-Type", f.mime)
		w.Write(f.image)
		return
	}
	if strings.HasPrefix(r.URL.Path, "/api/services/") {
		var body map[string]any
		json.NewDecoder(r.Body).Decode(&body)
		f.mu.Lock()
		f.calls = append(f.calls, body)
		fail := f.failWrite
		gate := f.recordGate
		if strings.HasSuffix(r.URL.Path, "turn_on") {
			for _, id := range body["entity_id"].([]any) {
				s := f.states[id.(string)]
				s.State = "on"
				f.states[id.(string)] = s
			}
		}
		f.mu.Unlock()
		if fail {
			http.Error(w, "HOME ASSISTANT light.private production token leaked", 500)
			return
		}
		if strings.HasSuffix(r.URL.Path, "/record") && gate != nil {
			<-gate
		}
		json.NewEncoder(w).Encode([]any{})
		return
	}
	http.NotFound(w, r)
}
func TestJournalInterruptedActionIsNeverRedispatched(t *testing.T) {
	s, f := fixture(t)
	entry := JournalEntry{Fingerprint: fingerprint(controlRequest("pending-001", 1)), Status: "running", StartedAt: timestamp(), Results: []Result{{Row: 1, Function: "c01", Status: "submitted"}}}
	if s.Journal.Put("a/pending-001", entry) != nil {
		t.Fatal("journal put failed")
	}
	j, err := NewJournal(s.Journal.path)
	if err != nil {
		t.Fatal(err)
	}
	s.Journal = j
	out := decode(t, s.Handle(context.Background(), "a", controlRequest("pending-001", 1)))
	if out.Operation.Status != "uncertain" || out.Results[0].Status != "uncertain" || len(f.calls) != 0 {
		t.Fatal("interrupted action retried")
	}
}
func decode(t *testing.T, r *mcp.CallToolResult) Response {
	t.Helper()
	if len(r.Content) < 1 {
		t.Fatal("missing catalog")
	}
	var out Response
	if json.Unmarshal([]byte(r.Content[0].(*mcp.TextContent).Text), &out) != nil {
		t.Fatal("invalid output")
	}
	if len(out.Devices) != 4 || len(out.Fields) != 8 {
		t.Fatal("catalog incomplete")
	}
	return out
}
func controlRequest(id string, rows ...int) Request {
	in := Request{Operation: "control", CatalogRevision: "fixture-revision", RequestID: id}
	for _, row := range rows {
		in.Controls = append(in.Controls, ControlRequest{Row: row, Function: "c01"})
	}
	return in
}
func TestGroupedControlSkipsUnavailableAndBatches(t *testing.T) {
	s, f := fixture(t)
	f.states["light.fixture_b"] = State{EntityID: "light.fixture_b", State: "unavailable"}
	out := decode(t, s.Handle(context.Background(), "voice-a", controlRequest("group-0001", 1, 2, 3)))
	if out.Results[0].Status != "state_observed" || out.Results[1].Status != "unavailable" || out.Results[2].Status != "accepted" {
		t.Fatalf("unexpected statuses %+v", out.Results)
	}
	if len(f.calls) != 2 {
		t.Fatalf("expected two service groups got %d", len(f.calls))
	}
	if len(f.calls[0]["entity_id"].([]any)) != 1 {
		t.Fatal("unavailable target included")
	}
}
func TestBatchAndDurableReplayConflict(t *testing.T) {
	s, f := fixture(t)
	in := controlRequest("batch-0001", 1, 2)
	first := decode(t, s.Handle(context.Background(), "voice-a", in))
	if len(f.calls) != 1 || len(f.calls[0]["entity_id"].([]any)) != 2 {
		t.Fatal("identical commands were not batched")
	}
	if first.Operation.Replay {
		t.Fatal("first action marked replay")
	}
	j, err := NewJournal(s.Journal.path)
	if err != nil {
		t.Fatal(err)
	}
	s.Journal = j
	replay := decode(t, s.Handle(context.Background(), "voice-a", in))
	if !replay.Operation.Replay || len(f.calls) != 1 {
		t.Fatal("durable replay sent write")
	}
	in.Controls = in.Controls[:1]
	conflict := s.Handle(context.Background(), "voice-a", in)
	if !conflict.IsError || decode(t, conflict).Results[0].Status != "request_conflict" || len(f.calls) != 1 {
		t.Fatal("conflicting request reused")
	}
}
func TestFailedWriteNeverRetriesAndDoesNotLeak(t *testing.T) {
	s, f := fixture(t)
	f.failWrite = true
	in := controlRequest("failure-001", 1)
	first := s.Handle(context.Background(), "a", in)
	out := decode(t, first)
	if out.Results[0].Status != "uncertain" {
		t.Fatal(out.Results)
	}
	wire, _ := json.Marshal(first)
	if bytes.Contains(bytes.ToLower(wire), []byte("home assistant")) || bytes.Contains(wire, []byte("light.fixture")) {
		t.Fatal("private identifier leaked")
	}
	s.Handle(context.Background(), "a", in)
	if len(f.calls) != 1 {
		t.Fatal("failed request retried")
	}
}
func TestRevisionInvalidParamsAndDisabledTarget(t *testing.T) {
	s, f := fixture(t)
	in := controlRequest("invalid-001", 1)
	in.CatalogRevision = "old"
	if decode(t, s.Handle(context.Background(), "a", in)).Results[0].Status != "catalog_changed" || len(f.calls) != 0 {
		t.Fatal("stale revision accepted")
	}
	in.CatalogRevision = s.Catalog.Revision
	in.Controls[0].Parameters = map[string]any{"entity_id": "light.fixture_b"}
	out := decode(t, s.Handle(context.Background(), "a", in))
	if out.Results[0].Status != "invalid_parameters" || len(f.calls) != 0 {
		t.Fatal("target injection accepted")
	}
	s.Catalog.Devices[2].Entities[0].Disabled = true
	out = decode(t, s.Handle(context.Background(), "a", controlRequest("disabled-01", 3)))
	if out.Results[0].Status != "unavailable" || len(f.calls) != 0 {
		t.Fatal("disabled target dispatched")
	}
}
func TestCapabilityGatesAndRanges(t *testing.T) {
	s, f := fixture(t)
	c := &s.Catalog.Devices[0].Controls[0]
	c.Parameters = json.RawMessage(`{"type":"object","required":["white_temperature_kelvin"],"additionalProperties":false,"properties":{"white_temperature_kelvin":{"type":"integer","minimum":2000,"maximum":6500}}}`)
	c.ParameterMap = map[string]string{"white_temperature_kelvin": "color_temp_kelvin"}
	c.ParameterRequirements = map[string]Requirement{"white_temperature_kelvin": {ColorModes: []string{"color_temp"}}}
	f.states[c.EntityID] = State{EntityID: c.EntityID, State: "off", Attributes: map[string]any{"supported_color_modes": []any{"onoff"}}}
	in := controlRequest("capable-001", 1)
	in.Controls[0].Parameters = map[string]any{"white_temperature_kelvin": float64(3000)}
	if decode(t, s.Handle(context.Background(), "a", in)).Results[0].Status != "unsupported" || len(f.calls) != 0 {
		t.Fatal("unsupported color capability dispatched")
	}
	state := f.states[c.EntityID]
	state.Attributes["supported_color_modes"] = []any{"color_temp"}
	state.Attributes["min_color_temp_kelvin"] = float64(3500)
	f.states[c.EntityID] = state
	in.RequestID = "capable-002"
	if decode(t, s.Handle(context.Background(), "a", in)).Results[0].Status != "unsupported" || len(f.calls) != 0 {
		t.Fatal("live range ignored")
	}
}
func TestCameraRAMValidatedImageBlock(t *testing.T) {
	s, f := fixture(t)
	img := image.NewRGBA(image.Rect(0, 0, 3, 2))
	img.Set(1, 1, color.White)
	var buffer bytes.Buffer
	png.Encode(&buffer, img)
	f.image = buffer.Bytes()
	f.mime = "image/png"
	in := Request{Operation: "camera_view", CatalogRevision: s.Catalog.Revision, Rows: []int{4}}
	result := s.Handle(context.Background(), "a", in)
	out := decode(t, result)
	if len(result.Content) != 2 || out.Image == nil || out.Image.CapturedAt != nil {
		t.Fatal("missing image metadata")
	}
	block, ok := result.Content[1].(*mcp.ImageContent)
	if !ok || !bytes.Equal(block.Data, f.image) || block.MIMEType != "image/png" {
		t.Fatal("invalid image block")
	}
	if len(f.calls) != 0 {
		t.Fatal("snapshot wrote a file")
	}
	f.mime = "image/jpeg"
	if !s.Handle(context.Background(), "a", in).IsError {
		t.Fatal("MIME mismatch accepted")
	}
	f.image = []byte("html")
	f.mime = "image/png"
	if !s.Handle(context.Background(), "a", in).IsError {
		t.Fatal("invalid image accepted")
	}
}
func TestRecordBoundedAsyncQueueAndStatus(t *testing.T) {
	s, f := fixture(t)
	gate := make(chan struct{})
	f.recordGate = gate
	in := Request{Operation: "control", CatalogRevision: s.Catalog.Revision, RequestID: "record-0001", Controls: []ControlRequest{{Row: 4, Function: "c02", Parameters: map[string]any{"duration_sec": float64(1), "lookback_sec": float64(0)}}}}
	out := decode(t, s.Handle(context.Background(), "a", in))
	if out.Operation.Status != "running" {
		t.Fatal("record blocked control call")
	}
	deadline := time.Now().Add(time.Second)
	for {
		entry, _ := s.Journal.Get("a/record-0001")
		if entry.Results[0].Status == "recording" {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("record worker did not start")
		}
		time.Sleep(5 * time.Millisecond)
	}
	close(gate)
	deadline = time.Now().Add(time.Second)
	for {
		entry, _ := s.Journal.Get("a/record-0001")
		if entry.Status == "completed" {
			if entry.Results[0].Status != "record_accepted" {
				t.Fatal(entry.Results)
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("record completion missing")
		}
		time.Sleep(5 * time.Millisecond)
	}
	f.mu.Lock()
	body := f.calls[0]
	f.mu.Unlock()
	name, ok := body["filename"].(string)
	if !ok || !strings.HasPrefix(name, "/media/kajavoiceha/") || !strings.HasSuffix(name, ".mp4") {
		t.Fatal("private generated filename missing")
	}
	wire, _ := json.Marshal(out)
	if bytes.Contains(wire, []byte("/media/")) {
		t.Fatal("filename leaked")
	}
	s.Handle(context.Background(), "a", in)
	if len(f.calls) != 1 {
		t.Fatal("record replay submitted")
	}
}
func TestTokenHashExpiryRevocation(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "clients.json")
	sum := sha256.Sum256([]byte("opaque-unit-test-token"))
	file := clientFile{Clients: []Client{{ID: "voice-a", SHA256: hex.EncodeToString(sum[:]), ExpiresAt: time.Now().Add(time.Hour)}}}
	write := func() { b, _ := json.Marshal(file); os.WriteFile(path, b, 0600) }
	write()
	verify := ClientVerifier(path)
	ctx := context.Background()
	req := httptest.NewRequest("POST", "https://example.test/mcp", nil)
	if _, err := verify(ctx, "opaque-unit-test-token", req); err != nil {
		t.Fatal(err)
	}
	if _, err := verify(ctx, "wrong", req); err != auth.ErrInvalidToken {
		t.Fatal("invalid token accepted")
	}
	file.Clients[0].Revoked = true
	write()
	if _, err := verify(ctx, "opaque-unit-test-token", req); err != auth.ErrInvalidToken {
		t.Fatal("revoked token accepted")
	}
	file.Clients[0].Revoked = false
	file.Clients[0].ExpiresAt = time.Now().Add(-time.Hour)
	write()
	if _, err := verify(ctx, "opaque-unit-test-token", req); err != auth.ErrInvalidToken {
		t.Fatal("expired token accepted")
	}
}
func TestNeutralReadingsAndStrictInput(t *testing.T) {
	s, f := fixture(t)
	s.Catalog.Devices[0].Readings = append(s.Catalog.Devices[0].Readings, Reading{ID: "r02", Label: "Popis", EntityID: "light.fixture_a", Attribute: "description"})
	st := f.states["light.fixture_a"]
	st.Attributes["description"] = "Home Assistant camera.private http://private.example/api"
	f.states[st.EntityID] = st
	result := s.Handle(context.Background(), "a", Request{Operation: "catalog"})
	wire, _ := json.Marshal(result)
	if bytes.Contains(bytes.ToLower(wire), []byte("home assistant")) || bytes.Contains(wire, []byte("camera.private")) || bytes.Contains(wire, []byte("private.example")) {
		t.Fatal("reading leaked")
	}
	var req Request
	for _, raw := range []string{`{"operation":"catalog","query":"test"}`, `{"operation":"catalog"}oops`, `{"operation":"catalog"}{}`} {
		if strictDecode([]byte(raw), &req) == nil {
			t.Fatal("invalid input accepted")
		}
	}
}
func TestExportRuntimePreview(t *testing.T) {
	catalogPath := os.Getenv("KAJA_PREVIEW_CATALOG")
	statesPath := os.Getenv("KAJA_PREVIEW_STATES")
	outPath := os.Getenv("KAJA_PREVIEW_OUTPUT")
	if catalogPath == "" || statesPath == "" || outPath == "" {
		t.Skip("explicit local preview inputs not supplied")
	}
	c, err := LoadCatalog(catalogPath)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(statesPath)
	if err != nil {
		t.Fatal(err)
	}
	var list []State
	if err = json.Unmarshal(raw, &list); err != nil {
		var envelope struct {
			States []State `json:"states"`
		}
		if err = json.Unmarshal(raw, &envelope); err != nil {
			t.Fatal(err)
		}
		list = envelope.States
	}
	states := map[string]State{}
	for _, st := range list {
		states[st.EntityID] = st
	}
	out := (&Service{Catalog: c}).snapshot(states)
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(outPath, data, 0644); err != nil {
		t.Fatal(err)
	}
	t.Logf("preview rows=%d fields=%d bytes=%d", len(out.Devices), len(out.Fields), len(data))
}
func TestCompactCatalogIsLossless(t *testing.T) {
	s, _ := fixture(t)
	s.Catalog.Devices[0].Controls[0].Label = "Komponenta: Zapnout"
	s.Catalog.Devices[0].Readings[0].Label = "Komponenta: Stav"
	s.Catalog.Devices[0].PossibleStates = []any{map[string]any{"label": "Komponenta", "states": []any{"zapnuto", "vypnuto"}}}
	out := s.snapshot(nil)
	join := func(ref, suffix string) string {
		component := out.Fields[3].ComponentNames[ref]
		if component == "" {
			return suffix
		}
		return component + out.Fields[3].LabelSeparator + suffix
	}
	for i, d := range s.Catalog.Devices {
		controls := out.Devices[i][3].([]any)
		for k, c := range d.Controls {
			item := controls[k].([6]any)
			label := join(item[1].(string), out.Fields[3].ActionNames[item[2].(string)])
			if label != neutralString(c.Label) {
				t.Fatal("control caption lost")
			}
			if fingerprint(out.Fields[3].ParameterDefinitions[item[3].(string)]) != fingerprint(publicSchema(c.Parameters)) {
				t.Fatal("parameter schema lost")
			}
		}
		readings := out.Devices[i][4].([]any)
		for k, r := range d.Readings {
			item := readings[k].([4]any)
			if join(item[1].(string), out.Fields[4].ReadingNames[item[2].(string)]) != neutralString(r.Label) || item[3] != neutralString(r.Unit) {
				t.Fatal("reading caption lost")
			}
		}
	}
	h := out.Devices[0][6].([]any)[0].([2]any)
	definition := out.Fields[6].StateDefinitions[h[1].(string)].(map[string]any)
	expanded := map[string]any{"label": out.Fields[3].ComponentNames[h[0].(string)]}
	for k, v := range definition {
		expanded[k] = v
	}
	if fingerprint(expanded) != fingerprint(neutral(s.Catalog.Devices[0].PossibleStates.([]any)[0])) {
		t.Fatal("possible states lost")
	}
}
