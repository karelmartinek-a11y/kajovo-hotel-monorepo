package server

import (
	"context"
	"crypto/rand"
	"fmt"
	"time"
)

type recordJob struct {
	Key  string
	Plan planned
}

func uuid() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return ""
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
}
func (s *Service) startRecordWorker() {
	s.recordOnce.Do(func() {
		s.recordJobs = make(chan recordJob, 20)
		s.recordSlots = make(chan struct{}, 20)
		go func() {
			for job := range s.recordJobs {
				s.record(job)
				<-s.recordSlots
			}
		}()
	})
}
func (s *Service) record(job recordJob) {
	p := job.Plan
	duration := int(p.Parameters["duration_sec"].(float64))
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(duration+60)*time.Second)
	defer cancel()
	update := func(status, message string) error {
		return s.Journal.Update(job.Key, func(e *JournalEntry) {
			e.Results[p.Index].Status = status
			e.Results[p.Index].Message = message
			open := false
			uncertain := false
			for _, r := range e.Results {
				if r.Status == "queued" || r.Status == "recording" {
					open = true
				}
				if r.Status == "uncertain" {
					uncertain = true
				}
			}
			if !open {
				e.Status = "completed"
				if uncertain {
					e.Status = "uncertain"
				}
				e.FinishedAt = timestamp()
			}
		})
	}
	states, err := s.Backend.States(ctx)
	device := s.Catalog.Devices[p.Row-1]
	if err != nil || !targetAvailable(device, p.Control.EntityID, states) {
		update("unavailable", "Kamera nyní není k dispozici; záznam nebyl zahájen.")
		return
	}
	if !actualSupport(p.Control, p.Parameters, states) {
		update("unsupported", "Kamera nyní tuto funkci neposkytuje.")
		return
	}
	filename := uuid()
	if filename == "" {
		update("not_sent", "Záznam nelze bezpečně připravit.")
		return
	}
	if update("recording", "Záznam se zpracovává.") != nil {
		return
	}
	data := serviceData(p.Control, p.Parameters)
	data["entity_id"] = []string{p.Control.EntityID}
	data["filename"] = "/media/kajavoiceha/" + filename + ".mp4"
	backend := *s.Backend
	client := *s.Backend.HTTP
	client.Timeout = time.Duration(duration+60) * time.Second
	backend.HTTP = &client
	if err = backend.Call(ctx, "camera", "record", data); err != nil {
		update("uncertain", "Dokončení záznamu nelze ověřit; tato operace se znovu neodesílá.")
		return
	}
	update("record_accepted", "Zpracování požadavku na záznam skončilo; uložení souboru není nezávisle ověřené.")
}
