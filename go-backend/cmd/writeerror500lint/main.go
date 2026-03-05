// Command writeerror500lint is a standalone linter that flags WriteError calls
// with HTTP 500 status codes. The correct alternative is WriteInternalError,
// which logs the underlying error with request context.
//
// Usage:
//
//	writeerror500lint ./...
package main

import (
	"github.com/jdelfino/eval/go-backend/internal/analysis/writeerror500"
	"golang.org/x/tools/go/analysis/singlechecker"
)

func main() {
	singlechecker.Main(writeerror500.Analyzer)
}
