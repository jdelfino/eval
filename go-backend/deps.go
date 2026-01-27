//go:build deps
// +build deps

// Package main holds dependency imports that will be used by upcoming database layer code.
// This file ensures go mod tidy keeps these dependencies until they're used in production code.
package main

import (
	_ "github.com/google/uuid"
	_ "github.com/jackc/pgx/v5"
)
