// Package tracer provides the embedded Python tracer script for step-through debugging.
package tracer

import _ "embed"

// Script is the Python tracer that uses sys.settrace() to capture execution steps.
// It is written to a temp file and executed inside the nsjail sandbox.
//
//go:embed script.py
var Script string
