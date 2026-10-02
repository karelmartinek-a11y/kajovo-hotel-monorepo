package server

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"os"
	"regexp"
	"strings"

	"github.com/google/jsonschema-go/jsonschema"
)

type Field struct {
	Key                  string            `json:"key"`
	Label                string            `json:"label"`
	ParameterDefinitions map[string]any    `json:"parameter_definitions,omitempty"`
	ItemFields           []string          `json:"item_fields,omitempty"`
	UnsupportedDefault   string            `json:"unsupported_default,omitempty"`
	ComponentNames       map[string]string `json:"component_names,omitempty"`
	ActionNames          map[string]string `json:"action_names,omitempty"`
	ReadingNames         map[string]string `json:"reading_names,omitempty"`
	StateDefinitions     map[string]any    `json:"state_definitions,omitempty"`
	LabelSeparator       string            `json:"label_separator,omitempty"`
}
type Entity struct {
	EntityID string `json:"entity_id"`
	Label    string `json:"label"`
	Domain   string `json:"domain"`
	Disabled bool   `json:"disabled"`
}
type Control struct {
	ID                    string                 `json:"id"`
	Label                 string                 `json:"label"`
	EntityID              string                 `json:"entity_id"`
	Domain                string                 `json:"domain"`
	Service               string                 `json:"service"`
	Parameters            json.RawMessage        `json:"parameters"`
	FixedData             map[string]any         `json:"fixed_data,omitempty"`
	Supported             bool                   `json:"supported"`
	UnavailableReason     string                 `json:"unavailable_reason,omitempty"`
	RequiredFeatures      int64                  `json:"required_features,omitempty"`
	RequiredColorModes    []string               `json:"required_color_modes,omitempty"`
	ParameterMap          map[string]string      `json:"parameter_map,omitempty"`
	ParameterRequirements map[string]Requirement `json:"parameter_requirements,omitempty"`
}
type Requirement struct {
	ColorModes []string `json:"color_modes,omitempty"`
	Feature    int64    `json:"feature,omitempty"`
}
type Reading struct {
	ID        string            `json:"id"`
	Label     string            `json:"label"`
	EntityID  string            `json:"entity_id"`
	Attribute string            `json:"attribute"`
	Unit      string            `json:"unit,omitempty"`
	ValueMap  map[string]string `json:"value_map,omitempty"`
}
type Device struct {
	Row            int       `json:"row"`
	Name           string    `json:"name"`
	Location       string    `json:"location"`
	Kind           string    `json:"kind"`
	DeviceID       string    `json:"device_id"`
	Controls       []Control `json:"controls"`
	Readings       []Reading `json:"readings"`
	Entities       []Entity  `json:"entities"`
	PossibleStates any       `json:"possible_states"`
	CameraEntityID string    `json:"camera_entity_id,omitempty"`
}
type Catalog struct {
	Revision string   `json:"revision"`
	Fields   []Field  `json:"fields"`
	Devices  []Device `json:"devices"`
}

var entityPattern = regexp.MustCompile(`^[a-z][a-z0-9_]*\.[a-z0-9_]+$`)
var publicRefPattern = regexp.MustCompile(`^[cr][0-9]{2,4}$`)
var allowedServices = map[string]map[string]bool{
	"light":  {"turn_on": true, "turn_off": true, "toggle": true},
	"switch": {"turn_on": true, "turn_off": true, "toggle": true},
	"select": {"select_option": true, "select_first": true, "select_last": true, "select_next": true, "select_previous": true},
	"number": {"set_value": true}, "button": {"press": true}, "siren": {"turn_on": true, "turn_off": true, "toggle": true},
	"camera": {"turn_on": true, "turn_off": true, "enable_motion_detection": true, "disable_motion_detection": true, "snapshot": true, "record": true},
}

func LoadCatalog(path string) (*Catalog, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var c Catalog
	if err = json.Unmarshal(data, &c); err != nil {
		return nil, err
	}
	if err = c.Validate(); err != nil {
		return nil, err
	}
	return &c, nil
}
func (c *Catalog) Validate() error {
	keys := []string{"name", "location", "kind", "controls", "readings", "current_state", "possible_states", "availability"}
	if c.Revision == "" || len(c.Fields) != 8 || len(c.Devices) == 0 {
		return errors.New("invalid catalog shape")
	}
	for i, f := range c.Fields {
		if f.Key != keys[i] || f.Label == "" {
			return errors.New("invalid catalog fields")
		}
	}
	for i, d := range c.Devices {
		if d.Row != i+1 || d.Name == "" || d.Kind == "" {
			return errors.New("invalid device row")
		}
		entities := map[string]Entity{}
		for _, e := range d.Entities {
			if !entityPattern.MatchString(e.EntityID) || entities[e.EntityID].EntityID != "" {
				return errors.New("invalid entity mapping")
			}
			entities[e.EntityID] = e
		}
		controls := map[string]bool{}
		for _, f := range d.Controls {
			e, ok := entities[f.EntityID]
			if !ok || !publicRefPattern.MatchString(f.ID) || !strings.HasPrefix(f.ID, "c") || controls[f.ID] || f.Label == "" || f.Domain != strings.Split(f.EntityID, ".")[0] || e.Domain != f.Domain {
				return errors.New("invalid control mapping")
			}
			controls[f.ID] = true
			if f.Supported && !allowedServices[f.Domain][f.Service] {
				return errors.New("unsupported service mapping")
			}
			if len(f.Parameters) == 0 {
				return errors.New("missing parameter schema")
			}
			var sch jsonschema.Schema
			if json.Unmarshal(f.Parameters, &sch) != nil || sch.Type != "object" {
				return errors.New("invalid parameter schema")
			}
			if _, err := sch.Resolve(nil); err != nil {
				return errors.New("invalid parameter schema")
			}
			if _, ok := f.FixedData["entity_id"]; ok {
				return errors.New("unsafe fixed target")
			}
			if _, ok := f.FixedData["device_id"]; ok {
				return errors.New("unsafe fixed target")
			}
			if _, ok := f.FixedData["area_id"]; ok {
				return errors.New("unsafe fixed target")
			}
			for _, key := range f.ParameterMap {
				if key == "entity_id" || key == "device_id" || key == "area_id" || key == "target" || key == "filename" {
					return errors.New("unsafe parameter target")
				}
			}
		}
		readings := map[string]bool{}
		for _, r := range d.Readings {
			if entities[r.EntityID].EntityID == "" || !publicRefPattern.MatchString(r.ID) || !strings.HasPrefix(r.ID, "r") || readings[r.ID] || r.Label == "" {
				return errors.New("invalid reading mapping")
			}
			readings[r.ID] = true
		}
		if d.CameraEntityID != "" {
			e, ok := entities[d.CameraEntityID]
			if !ok || e.Domain != "camera" {
				return errors.New("invalid camera mapping")
			}
		}
	}
	return nil
}

// Only values in approved fields pass the public boundary. Runtime readings may
// contain integration identifiers or source URLs even when the column is allowed.
var sourceWord = regexp.MustCompile(`(?i)home[ _-]*assistant`)
var privateID = regexp.MustCompile(`\b(?:light|switch|siren|select|number|button|camera|sensor|binary_sensor|update|event|device_tracker|climate|cover|scene|automation|script|media_player|input_[a-z_]+)\.[a-z0-9_]+\b`)
var sourceURL = regexp.MustCompile(`(?i)(?:https?|rtsp|rtsps)://[^\s"<>]+`)

func neutralString(s string) string {
	s = sourceWord.ReplaceAllString(s, "technologie")
	s = privateID.ReplaceAllString(s, "skrytý údaj")
	return sourceURL.ReplaceAllString(s, "skrytý údaj")
}
func neutral(v any) any {
	switch x := v.(type) {
	case string:
		return neutralString(x)
	case []any:
		y := make([]any, len(x))
		for i := range x {
			y[i] = neutral(x[i])
		}
		return y
	case map[string]any:
		y := map[string]any{}
		for k, v := range x {
			y[neutralString(k)] = neutral(v)
		}
		return y
	default:
		return v
	}
}
func publicSchema(raw json.RawMessage) any {
	var x any
	if json.Unmarshal(raw, &x) != nil {
		return map[string]any{"type": "object"}
	}
	return neutral(x)
}
func validateParameters(c Control, p map[string]any) bool {
	if p == nil {
		p = map[string]any{}
	}
	if _, ok := p["entity_id"]; ok {
		return false
	}
	if _, ok := p["device_id"]; ok {
		return false
	}
	if _, ok := p["area_id"]; ok {
		return false
	}
	var sch jsonschema.Schema
	if json.Unmarshal(c.Parameters, &sch) != nil {
		return false
	}
	r, err := sch.Resolve(nil)
	if err != nil {
		return false
	}
	return r.Validate(p) == nil
}
func strictDecode(data []byte, v any) error {
	d := json.NewDecoder(bytes.NewReader(data))
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		return err
	}
	var extra any
	if err := d.Decode(&extra); err != io.EOF {
		return errors.New("trailing input")
	}
	return nil
}
