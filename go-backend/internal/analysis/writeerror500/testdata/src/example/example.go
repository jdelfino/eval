// Package example contains test cases for the writeerror500 analyzer.
package example

import (
	"net/http"
)

// stub WriteError to avoid needing the actual package in testdata
func WriteError(w http.ResponseWriter, status int, message string) {}

func bad_literal(w http.ResponseWriter) {
	WriteError(w, 500, "oops") // want `WriteError called with 500 status; use WriteInternalError instead`
}

func bad_named_const(w http.ResponseWriter) {
	WriteError(w, http.StatusInternalServerError, "oops") // want `WriteError called with 500 status; use WriteInternalError instead`
}

func ok_not_found(w http.ResponseWriter) {
	WriteError(w, http.StatusNotFound, "not found") // ok
}

func ok_bad_request(w http.ResponseWriter) {
	WriteError(w, http.StatusBadRequest, "bad request") // ok
}

func ok_literal_400(w http.ResponseWriter) {
	WriteError(w, 400, "bad request") // ok
}

func ok_literal_404(w http.ResponseWriter) {
	WriteError(w, 404, "not found") // ok
}

func ok_different_func(w http.ResponseWriter) {
	// A different function with same arg pattern is not flagged
	someOtherFunc(w, 500)
}

func someOtherFunc(w http.ResponseWriter, status int) {}
