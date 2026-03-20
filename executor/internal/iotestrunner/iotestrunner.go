// Package iotestrunner provides the embedded Python I/O test runner script.
package iotestrunner

import _ "embed"

// Script is the Python wrapper that runs I/O test cases against student code.
// It is written to a temp file and executed inside the nsjail sandbox.
//
//go:embed script.py
var Script string
