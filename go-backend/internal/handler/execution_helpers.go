package handler

import (
	"github.com/jdelfino/eval/go-backend/internal/executor"
)

// buildExecutorRequest builds an executor.ExecuteRequest from code and merged
// execution settings. This is shared by both the session execute handler and
// the student work execute handler.
func buildExecutorRequest(code string, settings executionSettingsJSON) executor.ExecuteRequest {
	req := executor.ExecuteRequest{
		Code: code,
	}
	if settings.Stdin != nil {
		req.Stdin = *settings.Stdin
	}
	if settings.RandomSeed != nil {
		req.RandomSeed = settings.RandomSeed
	}
	if len(settings.Files) > 0 {
		req.Files = settings.Files
	}
	return req
}

// applySettingsLayer merges non-zero fields from layer into result.
// Fields present in layer (non-nil / non-empty) override those already in result.
// This implements the shared override logic used by all execution settings merge functions.
func applySettingsLayer(result *executionSettingsJSON, layer executionSettingsJSON) {
	if layer.Stdin != nil {
		result.Stdin = layer.Stdin
	}
	if layer.RandomSeed != nil {
		result.RandomSeed = layer.RandomSeed
	}
	if len(layer.Files) > 0 {
		result.Files = layer.Files
	}
}
