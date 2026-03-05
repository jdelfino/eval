// Package fakehttputil stubs httputil.WriteError for analyzer testdata.
package fakehttputil

import "net/http"

// WriteError is a stub matching the real httputil.WriteError signature.
func WriteError(w http.ResponseWriter, status int, message string) {}
