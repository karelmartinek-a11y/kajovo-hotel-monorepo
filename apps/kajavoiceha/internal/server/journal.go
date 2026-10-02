package server

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type Result struct {
	Row      int    `json:"row,omitempty"`
	Function string `json:"function,omitempty"`
	Status   string `json:"status"`
	Message  string `json:"message,omitempty"`
}
type JournalEntry struct {
	Fingerprint string   `json:"fingerprint"`
	Status      string   `json:"status"`
	StartedAt   string   `json:"started_at"`
	FinishedAt  string   `json:"finished_at,omitempty"`
	Results     []Result `json:"results"`
}
type Journal struct {
	mu      sync.Mutex
	path    string
	entries map[string]JournalEntry
}

func NewJournal(path string) (*Journal, error) {
	j := &Journal{path: path, entries: map[string]JournalEntry{}}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return j, nil
	}
	if err != nil {
		return nil, err
	}
	if json.Unmarshal(data, &j.entries) != nil {
		return nil, errors.New("invalid operation journal")
	}
	changed := false
	for key, entry := range j.entries {
		if entry.Status == "running" {
			entry.Status = "uncertain"
			entry.FinishedAt = timestamp()
			for i, r := range entry.Results {
				if r.Status == "pending" || r.Status == "submitted" || r.Status == "queued" || r.Status == "recording" {
					entry.Results[i].Status = "uncertain"
					entry.Results[i].Message = "Předchozí běh skončil před ověřením výsledku; operace se znovu neodesílá."
				}
			}
			j.entries[key] = entry
			changed = true
		}
	}
	if changed {
		data, err = json.Marshal(j.entries)
		if err != nil {
			return nil, err
		}
		if err = j.write(data); err != nil {
			return nil, err
		}
	}
	return j, nil
}
func operationKey(client, id string) string { return client + "/" + id }
func fingerprint(v any) string {
	b, _ := json.Marshal(v)
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}
func (j *Journal) Get(key string) (JournalEntry, bool) {
	j.mu.Lock()
	defer j.mu.Unlock()
	e, ok := j.entries[key]
	e.Results = append([]Result(nil), e.Results...)
	return e, ok
}
func (j *Journal) Put(key string, e JournalEntry) error {
	j.mu.Lock()
	defer j.mu.Unlock()
	prior, exists := j.entries[key]
	j.entries[key] = e
	data, err := json.Marshal(j.entries)
	if err != nil {
		return err
	}
	if err = j.write(data); err != nil {
		if exists {
			j.entries[key] = prior
		} else {
			delete(j.entries, key)
		}
	}
	return err
}
func (j *Journal) Update(key string, change func(*JournalEntry)) error {
	j.mu.Lock()
	defer j.mu.Unlock()
	prior, ok := j.entries[key]
	if !ok {
		return errors.New("missing journal entry")
	}
	entry := prior
	entry.Results = append([]Result(nil), prior.Results...)
	change(&entry)
	j.entries[key] = entry
	data, err := json.Marshal(j.entries)
	if err == nil {
		err = j.write(data)
	}
	if err != nil {
		j.entries[key] = prior
	}
	return err
}
func (j *Journal) write(data []byte) error {
	if j.path == "" {
		return errors.New("missing durable journal path")
	}
	if err := os.MkdirAll(filepath.Dir(j.path), 0700); err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(j.path), ".journal-*")
	if err != nil {
		return err
	}
	name := f.Name()
	defer os.Remove(name)
	if err = f.Chmod(0600); err == nil {
		_, err = f.Write(data)
	}
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	if err = os.Rename(name, j.path); err != nil {
		return err
	}
	dir, err := os.Open(filepath.Dir(j.path))
	if err != nil {
		return err
	}
	defer dir.Close()
	return dir.Sync()
}
func timestamp() string { return time.Now().UTC().Format(time.RFC3339Nano) }
