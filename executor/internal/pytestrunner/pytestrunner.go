// Package pytestrunner provides the embedded Python pytest runner script.
package pytestrunner

import _ "embed"

// Script is the Python script that runs pytest cases against student code.
// It is written to a temp file and executed inside the nsjail sandbox.
//
//go:embed script.py
var Script string
