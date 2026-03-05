// Package writeerror500 defines a go/analysis analyzer that flags calls to
// WriteError with a 500 status code (either the integer literal 500 or the
// named constant http.StatusInternalServerError).
//
// The correct way to return a 500 response is to use WriteInternalError, which
// logs the underlying error with request context. WriteError with 500 silently
// discards the error, making production incidents much harder to debug.
package writeerror500

import (
	"go/ast"
	"go/constant"

	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/analysis/passes/inspect"
	"golang.org/x/tools/go/ast/inspector"
)

// Analyzer is the go/analysis analyzer that flags WriteError calls with 500.
var Analyzer = &analysis.Analyzer{
	Name:     "writeerror500",
	Doc:      "flags WriteError calls with HTTP 500 status; use WriteInternalError instead",
	Requires: []*analysis.Analyzer{inspect.Analyzer},
	Run:      run,
}

func run(pass *analysis.Pass) (any, error) {
	insp := pass.ResultOf[inspect.Analyzer].(*inspector.Inspector)

	nodeFilter := []ast.Node{
		(*ast.CallExpr)(nil),
	}

	insp.Preorder(nodeFilter, func(n ast.Node) {
		call, ok := n.(*ast.CallExpr)
		if !ok {
			return
		}

		// Match calls to a function named "WriteError" (any package).
		fn := funcName(call)
		if fn != "WriteError" {
			return
		}

		// WriteError(w, status, message) — status is the second argument (index 1).
		if len(call.Args) < 2 {
			return
		}

		statusArg := call.Args[1]
		if is500(pass, statusArg) {
			pass.Reportf(call.Pos(), "WriteError called with 500 status; use WriteInternalError instead")
		}
	})

	return nil, nil
}

// funcName extracts the unqualified function name from a call expression,
// handling both plain calls (WriteError(...)) and selector calls (pkg.WriteError(...)).
func funcName(call *ast.CallExpr) string {
	switch fn := call.Fun.(type) {
	case *ast.Ident:
		return fn.Name
	case *ast.SelectorExpr:
		return fn.Sel.Name
	}
	return ""
}

// is500 reports whether a status argument expression evaluates to 500.
// It handles:
//   - integer literal 500
//   - named constants like http.StatusInternalServerError
func is500(pass *analysis.Pass, expr ast.Expr) bool {
	// Try to evaluate the expression as a constant.
	tv, ok := pass.TypesInfo.Types[expr]
	if !ok {
		return false
	}
	if tv.Value == nil {
		// Not a constant expression.
		return false
	}
	if tv.Value.Kind() != constant.Int {
		return false
	}
	val, ok := constant.Int64Val(tv.Value)
	if !ok {
		return false
	}
	return val == 500
}
