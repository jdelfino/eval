// Package qualified tests that the analyzer catches package-qualified WriteError calls.
package qualified

import (
	"net/http"

	"fakehttputil"
)

func bad_qualified_literal(w http.ResponseWriter) {
	fakehttputil.WriteError(w, 500, "oops") // want `WriteError called with 500 status; use WriteInternalError instead`
}

func bad_qualified_named(w http.ResponseWriter) {
	fakehttputil.WriteError(w, http.StatusInternalServerError, "oops") // want `WriteError called with 500 status; use WriteInternalError instead`
}

func ok_qualified_400(w http.ResponseWriter) {
	fakehttputil.WriteError(w, http.StatusBadRequest, "bad") // ok
}
