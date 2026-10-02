package server

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type ControlRequest struct {
	Row        int            `json:"row"`
	Function   string         `json:"function"`
	Parameters map[string]any `json:"parameters,omitempty"`
}
type Request struct {
	Operation       string           `json:"operation"`
	CatalogRevision string           `json:"catalog_revision,omitempty"`
	Rows            []int            `json:"rows,omitempty"`
	Controls        []ControlRequest `json:"controls,omitempty"`
	RequestID       string           `json:"request_id,omitempty"`
}
type OperationInfo struct {
	RequestID  string `json:"request_id"`
	Status     string `json:"status"`
	StartedAt  string `json:"started_at,omitempty"`
	FinishedAt string `json:"finished_at,omitempty"`
	Replay     bool   `json:"replay,omitempty"`
}
type ImageInfo struct {
	Row        int    `json:"row"`
	FetchedAt  string `json:"fetched_at"`
	CapturedAt any    `json:"captured_at"`
}
type Response struct {
	CatalogRevision string         `json:"catalog_revision"`
	ObservedAt      string         `json:"observed_at"`
	Fields          []Field        `json:"fields"`
	Devices         [][8]any       `json:"devices"`
	Results         []Result       `json:"results"`
	Operation       *OperationInfo `json:"operation,omitempty"`
	Image           *ImageInfo     `json:"image,omitempty"`
}
type Service struct {
	Catalog     *Catalog
	Backend     *Backend
	Journal     *Journal
	mutation    sync.Mutex
	camera      sync.Mutex
	recordOnce  sync.Once
	recordJobs  chan recordJob
	recordSlots chan struct{}
}

var requestIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{8,128}$`)

func InputSchema() map[string]any {
	return map[string]any{"type": "object", "additionalProperties": false, "required": []string{"operation"}, "properties": map[string]any{
		"operation":        map[string]any{"type": "string", "enum": []string{"catalog", "read", "control", "operation_status", "camera_view"}, "description": "catalog vrací celý katalog; read obnoví stav; control provede vybrané funkce; operation_status ověří dřívější požadavek; camera_view načte jeden aktuálně získaný snímek."},
		"catalog_revision": map[string]any{"type": "string", "description": "Revize celého aktuálního katalogu; povinná pro read, control a camera_view."},
		"rows":             map[string]any{"type": "array", "items": map[string]any{"type": "integer", "minimum": 1}, "uniqueItems": true, "maxItems": 1000, "description": "Pořadová čísla řádků od 1 v celém katalogu."},
		"controls":         map[string]any{"type": "array", "maxItems": 1000, "items": map[string]any{"type": "object", "additionalProperties": false, "required": []string{"row", "function"}, "properties": map[string]any{"row": map[string]any{"type": "integer", "minimum": 1}, "function": map[string]any{"type": "string", "pattern": "^c[0-9]{2,4}$"}, "parameters": map[string]any{"type": "object", "description": "Pouze parametry uvedené u této konkrétní funkce zařízení."}}}},
		"request_id":       map[string]any{"type": "string", "pattern": "^[A-Za-z0-9_-]{8,128}$", "description": "Jedinečný identifikátor akce; pro control a operation_status povinný. Při nejistém výsledku zopakuj pouze stejný identifikátor se stejnými argumenty."},
	}}
}
func (s *Service) MCP() *mcp.Server {
	m := mcp.NewServer(&mcp.Implementation{Name: "KajaVoiceHA", Version: "1.0.0"}, &mcp.ServerOptions{Capabilities: &mcp.ServerCapabilities{}, Instructions: "Používej pouze celý aktuální katalog z funkce smart_technologie. Vyhledávej v názvech, umístění, druhu a možnostech každého konkrétního řádku. Vyřazené položky neexistují. Funkce i parametry vybírej podle daného řádku; nedostupné položky přeskakuj a výsledek jednotlivých akcí oznam pravdivě. Revize a pořadí řádků musí odpovídat poslednímu katalogu. Každý výsledek obsahuje celý nový katalog, který nahrazuje předchozí. Snímek popisuje obraz získaný v uvedeném čase; čas pořízení nemusí být známý."})
	m.AddTool(&mcp.Tool{Name: "smart_technologie", Description: "Celý schválený katalog chytrých technologií, aktuální stav, ovládání jednotlivých i více zařízení a snímek povolené kamery. Jediné místo pravdy pro zařízení.", InputSchema: InputSchema()}, func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		var input Request
		if strictDecode(req.Params.Arguments, &input) != nil {
			return s.invalid(ctx, "invalid_request", "Požadavek nemá platný tvar."), nil
		}
		ti := auth.TokenInfoFromContext(ctx)
		client := ""
		if ti != nil {
			client = ti.UserID
		}
		if client == "" {
			return s.invalid(ctx, "unauthorized", "Oprávnění není dostupné."), nil
		}
		return s.Handle(ctx, client, input), nil
	})
	return m
}
func (s *Service) snapshot(states map[string]State) Response {
	out := Response{CatalogRevision: s.Catalog.Revision, ObservedAt: timestamp(), Fields: append([]Field(nil), s.Catalog.Fields...), Devices: make([][8]any, 0, len(s.Catalog.Devices)), Results: []Result{}}
	definitions := map[string]any{}
	schemaRefs := map[string]string{}
	for _, d := range s.Catalog.Devices {
		for _, c := range d.Controls {
			schema := publicSchema(c.Parameters)
			canonical, _ := json.Marshal(schema)
			key := string(canonical)
			if _, ok := schemaRefs[key]; !ok {
				ref := fmt.Sprintf("p%03d", len(schemaRefs)+1)
				schemaRefs[key] = ref
				definitions[ref] = schema
			}
		}
	}
	out.Fields[3].ParameterDefinitions = definitions
	components := map[string]string{}
	componentRefs := map[string]string{}
	actions := map[string]string{}
	actionRefs := map[string]string{}
	readingNames := map[string]string{}
	readingRefs := map[string]string{}
	stateDefinitions := map[string]any{}
	stateRefs := map[string]string{}
	componentRef := func(name string) string {
		if name == "" {
			return ""
		}
		if ref, ok := componentRefs[name]; ok {
			return ref
		}
		ref := fmt.Sprintf("l%03d", len(componentRefs)+1)
		componentRefs[name] = ref
		components[ref] = name
		return ref
	}
	labelRef := func(name, prefix string, refs, definitions map[string]string) string {
		if ref, ok := refs[name]; ok {
			return ref
		}
		ref := fmt.Sprintf("%s%03d", prefix, len(refs)+1)
		refs[name] = ref
		definitions[ref] = name
		return ref
	}
	splitLabel := func(label string) (string, string) {
		label = neutralString(label)
		if i := strings.LastIndex(label, ": "); i >= 0 {
			return label[:i], label[i+2:]
		}
		return "", label
	}
	out.Fields[3].ItemFields = []string{"function", "component_ref", "action_ref", "parameters_ref", "supported", "unavailable_reason"}
	out.Fields[3].UnsupportedDefault = "Funkce nyní není dostupná."
	out.Fields[3].ComponentNames = components
	out.Fields[3].ActionNames = actions
	out.Fields[3].LabelSeparator = ": "
	out.Fields[4].ItemFields = []string{"function", "component_ref", "reading_ref", "unit"}
	out.Fields[4].ReadingNames = readingNames
	out.Fields[5].ItemFields = []string{"function", "value"}
	out.Fields[6].ItemFields = []string{"component_ref", "states_ref"}
	out.Fields[6].StateDefinitions = stateDefinitions
	for _, d := range s.Catalog.Devices {
		controls := []any{}
		for _, c := range d.Controls {
			ok := targetAvailable(d, c.EntityID, states) && actualSupport(c, map[string]any{}, states)
			canonical, _ := json.Marshal(publicSchema(c.Parameters))
			reason := ""
			if !ok {
				reason = neutralString(c.UnavailableReason)
			}
			component, action := splitLabel(c.Label)
			controls = append(controls, [6]any{c.ID, componentRef(component), labelRef(action, "a", actionRefs, actions), schemaRefs[string(canonical)], ok, reason})
		}
		readings := []any{}
		current := []any{}
		for _, r := range d.Readings {
			component, label := splitLabel(r.Label)
			readings = append(readings, [4]any{r.ID, componentRef(component), labelRef(label, "n", readingRefs, readingNames), neutralString(r.Unit)})
			var value any
			st, ok := states[r.EntityID]
			if ok && targetAvailable(d, r.EntityID, states) {
				if r.Attribute == "" || r.Attribute == "state" {
					value = st.State
				} else {
					value = st.Attributes[r.Attribute]
				}
			}
			current = append(current, [2]any{r.ID, neutral(mappedValue(value, r.ValueMap))})
		}
		availability := map[string]any{"available": deviceAvailable(d, states)}
		if !deviceAvailable(d, states) {
			availability["reason"] = "Zařízení nyní není k dispozici."
		}
		possible := []any{}
		if entries, ok := d.PossibleStates.([]any); ok {
			for _, entry := range entries {
				if obj, ok := entry.(map[string]any); ok {
					label, _ := obj["label"].(string)
					definition := map[string]any{}
					for k, v := range obj {
						if k != "label" {
							definition[neutralString(k)] = neutral(v)
						}
					}
					canonical, _ := json.Marshal(definition)
					key := string(canonical)
					ref, ok := stateRefs[key]
					if !ok {
						ref = fmt.Sprintf("s%03d", len(stateRefs)+1)
						stateRefs[key] = ref
						stateDefinitions[ref] = definition
					}
					possible = append(possible, [2]any{componentRef(neutralString(label)), ref})
				}
			}
		}
		out.Devices = append(out.Devices, [8]any{d.Name, d.Location, d.Kind, controls, readings, current, possible, availability})
	}
	return out
}
func (c *Catalog) PublicBytes() int {
	b, _ := json.Marshal((&Service{Catalog: c}).snapshot(nil))
	return len(b)
}
func resultContent(out Response, isError bool, imageData []byte, mimeType string) *mcp.CallToolResult {
	data, _ := json.Marshal(out)
	content := []mcp.Content{&mcp.TextContent{Text: string(data)}}
	if imageData != nil {
		content = append(content, &mcp.ImageContent{Data: imageData, MIMEType: mimeType})
	}
	return &mcp.CallToolResult{Content: content, IsError: isError}
}
func (s *Service) invalid(ctx context.Context, code, message string) *mcp.CallToolResult {
	states, _ := s.Backend.States(ctx)
	out := s.snapshot(states)
	out.Results = append(out.Results, Result{Status: code, Message: message})
	return resultContent(out, true, nil, "")
}
func (s *Service) Handle(ctx context.Context, client string, in Request) *mcp.CallToolResult {
	if in.Operation == "control" {
		s.mutation.Lock()
		defer s.mutation.Unlock()
	}
	states, err := s.Backend.States(ctx)
	out := s.snapshot(states)
	fail := func(code, msg string) *mcp.CallToolResult {
		out.Results = append(out.Results, Result{Status: code, Message: msg})
		return resultContent(out, true, nil, "")
	}
	if in.Operation != "catalog" && in.Operation != "operation_status" && in.CatalogRevision != s.Catalog.Revision {
		return fail("catalog_changed", "Použij revizi a pořadí řádků z přiloženého katalogu.")
	}
	seen := map[int]bool{}
	for _, row := range in.Rows {
		if row < 1 || row > len(s.Catalog.Devices) || seen[row] {
			return fail("invalid_rows", "Pořadí zařízení není platné.")
		}
		seen[row] = true
	}
	if err != nil && in.Operation != "operation_status" {
		return fail("unavailable", "Aktuální stavy zařízení nyní nelze získat.")
	}
	switch in.Operation {
	case "catalog":
		if len(in.Rows) > 0 || len(in.Controls) > 0 || in.RequestID != "" {
			return fail("invalid_request", "Katalog nevyžaduje další výběr.")
		}
		return resultContent(out, false, nil, "")
	case "read":
		if len(in.Controls) > 0 || in.RequestID != "" {
			return fail("invalid_request", "Čtení stavu neobsahuje ovládací akce.")
		}
		for _, row := range in.Rows {
			status := "observed"
			if !deviceAvailable(s.Catalog.Devices[row-1], states) {
				status = "unavailable"
			}
			out.Results = append(out.Results, Result{Row: row, Status: status})
		}
		return resultContent(out, false, nil, "")
	case "operation_status":
		if !requestIDPattern.MatchString(in.RequestID) || len(in.Controls) > 0 || len(in.Rows) > 0 {
			return fail("invalid_request", "Chybí platný identifikátor operace.")
		}
		entry, ok := s.Journal.Get(operationKey(client, in.RequestID))
		if !ok {
			return fail("not_found", "Operace nebyla nalezena.")
		}
		out.Results = entry.Results
		out.Operation = operationInfo(in.RequestID, entry, true)
		return resultContent(out, false, nil, "")
	case "camera_view":
		if len(in.Rows) != 1 || len(in.Controls) > 0 || in.RequestID != "" {
			return fail("invalid_request", "Pro snímek vyber právě jednu kameru.")
		}
		d := s.Catalog.Devices[in.Rows[0]-1]
		id := d.CameraEntityID
		supported := false
		for _, c := range d.Controls {
			if c.Domain == "camera" && c.Service == "snapshot" && c.Supported && c.EntityID == id {
				supported = true
			}
		}
		if id == "" || !supported {
			return fail("unsupported", "Snímek této položky není povolený.")
		}
		if !targetAvailable(d, id, states) {
			out.Results = []Result{{Row: d.Row, Status: "unavailable", Message: "Kamera nyní není k dispozici."}}
			return resultContent(out, false, nil, "")
		}
		if !s.camera.TryLock() {
			out.Results = []Result{{Row: d.Row, Status: "busy", Message: "Právě se získává jiný snímek; zkus to za chvíli."}}
			return resultContent(out, false, nil, "")
		}
		defer s.camera.Unlock()
		imageData, mt, e := s.Backend.Camera(ctx, id)
		if e != nil {
			out.Results = []Result{{Row: d.Row, Status: "unavailable", Message: "Snímek nyní nelze získat."}}
			return resultContent(out, true, nil, "")
		}
		out.Image = &ImageInfo{Row: d.Row, FetchedAt: timestamp(), CapturedAt: nil}
		out.Results = []Result{{Row: d.Row, Status: "image_fetched", Message: "Čas pořízení snímku není ověřený; uveden je čas získání."}}
		return resultContent(out, false, imageData, mt)
	case "control":
		if !requestIDPattern.MatchString(in.RequestID) || len(in.Controls) == 0 || len(in.Controls) > 1000 || len(in.Rows) > 0 {
			return fail("invalid_request", "Ovládání vyžaduje identifikátor a konkrétní funkce zařízení.")
		}
		return s.control(ctx, client, in, states)
	default:
		return fail("invalid_request", "Operace není podporovaná.")
	}
}
func operationInfo(id string, e JournalEntry, replay bool) *OperationInfo {
	return &OperationInfo{RequestID: id, Status: e.Status, StartedAt: e.StartedAt, FinishedAt: e.FinishedAt, Replay: replay}
}

type planned struct {
	Index      int
	Row        int
	Control    Control
	Parameters map[string]any
	Data       map[string]any
}

func (s *Service) control(ctx context.Context, client string, in Request, states map[string]State) *mcp.CallToolResult {
	out := s.snapshot(states)
	key := operationKey(client, in.RequestID)
	fp := fingerprint(in)
	if old, ok := s.Journal.Get(key); ok {
		if old.Fingerprint != fp {
			out.Results = []Result{{Status: "request_conflict", Message: "Identifikátor již patří jinému požadavku."}}
			return resultContent(out, true, nil, "")
		}
		out.Results = old.Results
		out.Operation = operationInfo(in.RequestID, old, true)
		return resultContent(out, false, nil, "")
	}
	entry := JournalEntry{Fingerprint: fp, Status: "running", StartedAt: timestamp(), Results: make([]Result, len(in.Controls))}
	groups := map[string][]planned{}
	order := []string{}
	seen := map[string]bool{}
	recordPlans := []planned{}
	for i, r := range in.Controls {
		entry.Results[i] = Result{Row: r.Row, Function: r.Function, Status: "invalid_action"}
		if r.Row < 1 || r.Row > len(s.Catalog.Devices) {
			continue
		}
		device := s.Catalog.Devices[r.Row-1]
		duplicateKey := fingerprint([]any{r.Row, r.Function})
		if seen[duplicateKey] {
			entry.Results[i].Message = "Stejná funkce je v požadavku vícekrát."
			continue
		}
		seen[duplicateKey] = true
		var c *Control
		for n := range device.Controls {
			if device.Controls[n].ID == r.Function {
				c = &device.Controls[n]
				break
			}
		}
		if c == nil {
			continue
		}
		if !targetAvailable(device, c.EntityID, states) {
			entry.Results[i].Status = "unavailable"
			continue
		}
		if !c.Supported || !actualSupport(*c, r.Parameters, states) {
			entry.Results[i].Status = "unsupported"
			continue
		}
		if c.Domain == "camera" && c.Service == "snapshot" {
			entry.Results[i].Status = "use_camera_view"
			entry.Results[i].Message = "Pro snímek použij operaci camera_view."
			continue
		}
		if !validateParameters(*c, r.Parameters) {
			entry.Results[i].Status = "invalid_parameters"
			continue
		}
		if c.Domain == "camera" && c.Service == "record" {
			s.startRecordWorker()
			select {
			case s.recordSlots <- struct{}{}:
			default:
				entry.Results[i].Status = "queue_full"
				continue
			}
			params := map[string]any{}
			for k, v := range r.Parameters {
				params[k] = v
			}
			if _, ok := params["duration_sec"]; !ok {
				params["duration_sec"] = float64(30)
			}
			if _, ok := params["lookback_sec"]; !ok {
				params["lookback_sec"] = float64(0)
			}
			duration, dok := params["duration_sec"].(float64)
			lookback, lok := params["lookback_sec"].(float64)
			if !dok || !lok || duration < 1 || duration > 300 || lookback < 0 || lookback > 30 {
				<-s.recordSlots
				entry.Results[i].Status = "invalid_parameters"
				continue
			}
			recordPlans = append(recordPlans, planned{i, r.Row, *c, params, serviceData(*c, params)})
			entry.Results[i].Status = "queued"
			continue
		}
		data := serviceData(*c, r.Parameters)
		groupKey := fingerprint([]any{c.Domain, c.Service, data})
		if _, ok := groups[groupKey]; !ok {
			order = append(order, groupKey)
		}
		groups[groupKey] = append(groups[groupKey], planned{i, r.Row, *c, r.Parameters, data})
		entry.Results[i].Status = "pending"
	}
	if s.Journal.Put(key, entry) != nil {
		for range recordPlans {
			<-s.recordSlots
		}
		out.Results = []Result{{Status: "unavailable", Message: "Operaci nelze bezpečně zaznamenat; nebyla odeslána."}}
		return resultContent(out, true, nil, "")
	}
	// Cancellation never permits a retry of an already dispatched action. Keep a
	// bounded completion context to durably record an uncertain transport result.
	work, cancel := context.WithTimeout(context.WithoutCancel(ctx), 35*time.Second)
	defer cancel()
	for _, gkey := range order {
		group := groups[gkey]
		for _, p := range group {
			entry.Results[p.Index].Status = "submitted"
		}
		if s.Journal.Put(key, entry) != nil {
			for _, p := range group {
				entry.Results[p.Index].Status = "not_sent"
			}
			break
		}
		data := map[string]any{}
		for k, v := range group[0].Data {
			data[k] = v
		}
		ids := []string{}
		for _, p := range group {
			ids = append(ids, p.Control.EntityID)
		}
		sort.Strings(ids)
		data["entity_id"] = ids
		callErr := s.Backend.Call(work, group[0].Control.Domain, group[0].Control.Service, data)
		for _, p := range group {
			if callErr != nil {
				entry.Results[p.Index].Status = "uncertain"
				entry.Results[p.Index].Message = "Doručení či provedení nelze potvrdit; stejná operace se znovu neodesílá."
			} else {
				entry.Results[p.Index].Status = "accepted"
				entry.Results[p.Index].Message = "Povel byl přijat; fyzické provedení není potvrzené."
			}
		}
		if s.Journal.Put(key, entry) != nil {
			break
		}
	}
	// A live-state observation is evidence of the reported state, not proof of
	// a physical outcome. Poll only reads, never repeat a write.
	deadline := time.Now().Add(3 * time.Second)
	for {
		fresh, e := s.Backend.States(work)
		if e == nil {
			states = fresh
		}
		pending := false
		for _, gkey := range order {
			for _, p := range groups[gkey] {
				if entry.Results[p.Index].Status == "accepted" {
					if confirmed(p, states) {
						entry.Results[p.Index].Status = "state_observed"
						entry.Results[p.Index].Message = "Zařízení následně hlásí požadovaný stav."
					} else if observable(p) {
						pending = true
					}
				}
			}
		}
		if !pending || time.Now().After(deadline) || work.Err() != nil {
			break
		}
		select {
		case <-work.Done():
		case <-time.After(150 * time.Millisecond):
		}
	}
	entry.Status = "completed"
	entry.FinishedAt = timestamp()
	for i, r := range entry.Results {
		if r.Status == "pending" || r.Status == "submitted" {
			entry.Results[i].Status = "uncertain"
			entry.Status = "uncertain"
		}
		if r.Status == "uncertain" {
			entry.Status = "uncertain"
		}
	}
	if len(recordPlans) > 0 {
		entry.Status = "running"
		entry.FinishedAt = ""
	}
	if s.Journal.Put(key, entry) != nil {
		entry.Status = "uncertain"
		for range recordPlans {
			<-s.recordSlots
		}
		recordPlans = nil
	}
	for _, p := range recordPlans {
		s.recordJobs <- recordJob{Key: key, Plan: p}
	}
	out = s.snapshot(states)
	out.Results = entry.Results
	out.Operation = operationInfo(in.RequestID, entry, false)
	return resultContent(out, false, nil, "")
}
func mappedValue(value any, m map[string]string) any {
	if len(m) == 0 {
		return value
	}
	switch x := value.(type) {
	case string:
		if translated, ok := m[x]; ok {
			return translated
		}
		return x
	case []any:
		y := make([]any, len(x))
		for i, v := range x {
			y[i] = mappedValue(v, m)
		}
		return y
	default:
		return value
	}
}
func observable(p planned) bool {
	return p.Control.Service == "turn_on" || p.Control.Service == "turn_off" || p.Control.Service == "set_value" || p.Control.Service == "select_option"
}
func near(a, b any) bool {
	af, aok := a.(float64)
	bf, bok := b.(float64)
	if aok && bok {
		return math.Abs(af-bf) <= 1
	}
	ab, _ := json.Marshal(a)
	bb, _ := json.Marshal(b)
	return string(ab) == string(bb)
}
func confirmed(p planned, states map[string]State) bool {
	st, ok := states[p.Control.EntityID]
	if !ok || st.State == "unavailable" || st.State == "unknown" {
		return false
	}
	switch p.Control.Service {
	case "turn_off":
		return st.State == "off"
	case "turn_on":
		if st.State != "on" {
			return false
		}
		for k, v := range p.Data {
			switch k {
			case "transition", "flash", "effect":
				return false
			case "brightness_pct":
				f, ok := v.(float64)
				if !ok || !near(st.Attributes["brightness"], math.Round(f*255/100)) {
					return false
				}
			default:
				if !near(st.Attributes[k], v) {
					return false
				}
			}
		}
		return true
	case "select_option":
		return st.State == p.Data["option"]
	case "set_value":
		var n float64
		if json.Unmarshal([]byte(st.State), &n) != nil {
			return false
		}
		return near(n, p.Data["value"])
	}
	return false
}
