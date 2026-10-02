package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type State struct {
	EntityID    string         `json:"entity_id"`
	State       string         `json:"state"`
	Attributes  map[string]any `json:"attributes"`
	LastUpdated string         `json:"last_updated"`
}
type Backend struct {
	URL   string
	Token string
	HTTP  *http.Client
}

func NewBackend(rawURL, token string) (*Backend, error) {
	u, err := url.Parse(rawURL)
	if err != nil || u.Host == "" || u.User != nil || (u.Scheme != "http" && u.Scheme != "https") || u.RawQuery != "" || u.Fragment != "" {
		return nil, errors.New("invalid backend URL")
	}
	return &Backend{URL: strings.TrimRight(rawURL, "/"), Token: strings.TrimSpace(token), HTTP: &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}, nil
}
func (b *Backend) request(ctx context.Context, method, path string, payload any, limit int64) ([]byte, string, error) {
	var body io.Reader
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			return nil, "", err
		}
		body = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, b.URL+path, body)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("Authorization", "Bearer "+b.Token)
	req.Header.Set("Content-Type", "application/json")
	res, err := b.HTTP.Do(req)
	if err != nil {
		return nil, "", errors.New("backend request failed")
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, "", errors.New("backend rejected request")
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, limit+1))
	if err != nil || int64(len(data)) > limit {
		return nil, "", errors.New("backend response exceeded limit")
	}
	return data, res.Header.Get("Content-Type"), nil
}
func (b *Backend) States(ctx context.Context) (map[string]State, error) {
	data, _, err := b.request(ctx, http.MethodGet, "/api/states", nil, 16*1024*1024)
	if err != nil {
		return nil, err
	}
	var states []State
	if json.Unmarshal(data, &states) != nil {
		return nil, errors.New("invalid state response")
	}
	out := map[string]State{}
	for _, s := range states {
		out[s.EntityID] = s
	}
	return out, nil
}
func (b *Backend) Call(ctx context.Context, domain, service string, data map[string]any) error {
	_, _, err := b.request(ctx, http.MethodPost, "/api/services/"+domain+"/"+service, data, 8*1024*1024)
	return err
}
func (b *Backend) Camera(ctx context.Context, id string) ([]byte, string, error) {
	if !entityPattern.MatchString(id) || !strings.HasPrefix(id, "camera.") {
		return nil, "", errors.New("invalid camera")
	}
	data, rawMime, err := b.request(ctx, http.MethodGet, "/api/camera_proxy/"+id, nil, 5*1024*1024)
	if err != nil {
		return nil, "", err
	}
	mt, _, err := mime.ParseMediaType(rawMime)
	if err != nil || (mt != "image/jpeg" && mt != "image/png") {
		return nil, "", errors.New("unsupported image format")
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width <= 0 || config.Height <= 0 || int64(config.Width)*int64(config.Height) > 20_000_000 {
		return nil, "", errors.New("invalid image dimensions")
	}
	if (mt == "image/jpeg" && format != "jpeg") || (mt == "image/png" && format != "png") {
		return nil, "", errors.New("image type mismatch")
	}
	if _, _, err = image.Decode(bytes.NewReader(data)); err != nil {
		return nil, "", errors.New("invalid image")
	}
	return data, mt, nil
}
func available(e Entity, states map[string]State) bool {
	s, ok := states[e.EntityID]
	return ok && !e.Disabled && s.State != "unavailable" && s.State != ""
}
func targetAvailable(d Device, id string, states map[string]State) bool {
	for _, e := range d.Entities {
		if e.EntityID == id {
			return available(e, states)
		}
	}
	return false
}
func deviceAvailable(d Device, states map[string]State) bool {
	for _, e := range d.Entities {
		if available(e, states) {
			return true
		}
	}
	return false
}
func actualSupport(c Control, params map[string]any, states map[string]State) bool {
	if !c.Supported {
		return false
	}
	s, ok := states[c.EntityID]
	if !ok {
		return false
	}
	feat := int64(0)
	if f, ok := s.Attributes["supported_features"].(float64); ok {
		feat = int64(f)
	}
	if c.RequiredFeatures != 0 && (feat&c.RequiredFeatures) != c.RequiredFeatures {
		return false
	}
	modes := map[string]bool{}
	if a, ok := s.Attributes["supported_color_modes"].([]any); ok {
		for _, m := range a {
			if str, ok := m.(string); ok {
				modes[str] = true
			}
		}
	}
	anyMode := func(required []string) bool {
		if len(required) == 0 {
			return true
		}
		for _, m := range required {
			if modes[m] {
				return true
			}
		}
		return false
	}
	if !anyMode(c.RequiredColorModes) {
		return false
	}
	for k, v := range params {
		req := c.ParameterRequirements[k]
		if req.Feature != 0 && (feat&req.Feature) != req.Feature {
			return false
		}
		if !anyMode(req.ColorModes) {
			return false
		}
		backendKey := k
		if mapped, ok := c.ParameterMap[k]; ok {
			backendKey = mapped
		}
		switch backendKey {
		case "option":
			choices, ok := s.Attributes["options"].([]any)
			if !ok {
				return false
			}
			found := false
			for _, o := range choices {
				if o == v {
					found = true
				}
			}
			if !found {
				return false
			}
		case "color_temp_kelvin":
			f, ok := v.(float64)
			if !ok {
				return false
			}
			if min, ok := s.Attributes["min_color_temp_kelvin"].(float64); ok && f < min {
				return false
			}
			if max, ok := s.Attributes["max_color_temp_kelvin"].(float64); ok && f > max {
				return false
			}
		case "value":
			if c.Domain == "number" {
				f, ok := v.(float64)
				if !ok {
					return false
				}
				if min, ok := s.Attributes["min"].(float64); ok && f < min {
					return false
				}
				if max, ok := s.Attributes["max"].(float64); ok && f > max {
					return false
				}
			}
		}
	}
	return true
}
func serviceData(c Control, params map[string]any) map[string]any {
	d := map[string]any{}
	for k, v := range c.FixedData {
		d[k] = v
	}
	for k, v := range params {
		key := k
		if mapped, ok := c.ParameterMap[k]; ok {
			key = mapped
		}
		d[key] = v
	}
	return d
}
