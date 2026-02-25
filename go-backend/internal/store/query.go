package store

import (
	"fmt"
	"regexp"
	"strings"
	"time"
)

// colSepRE matches any SQL column list separator (comma optionally surrounded by whitespace/newlines).
var colSepRE = regexp.MustCompile(`,\s*`)

// prefixCols prefixes each column name in a comma-separated column list with the
// given table alias (e.g. "p"). This is used to qualify unaliased column constants
// (such as problemColumns) when the query uses a table alias in a JOIN.
//
// Example: prefixCols("p", "id, name, created_at") → "p.id, p.name, p.created_at"
func prefixCols(alias, cols string) string {
	parts := colSepRE.Split(strings.TrimSpace(cols), -1)
	for i, p := range parts {
		parts[i] = alias + "." + strings.TrimSpace(p)
	}
	return strings.Join(parts, ", ")
}

// argCounter tracks the next placeholder index for dynamic SQL queries.
// It avoids the error-prone manual argIdx pattern where each conditional
// clause must remember to increment and append in sync.
type argCounter struct {
	next int
	args []any
}

// newArgCounter creates a new argCounter starting at the given placeholder
// index, with optional initial args already accounted for.
//
// Example (WHERE pattern, starting fresh):
//
//	ac := newArgCounter(1)
//
// Example (SET pattern, $1 already used for id):
//
//	ac := newArgCounter(2, id)
func newArgCounter(startIdx int, initialArgs ...any) *argCounter {
	args := make([]any, len(initialArgs))
	copy(args, initialArgs)
	return &argCounter{next: startIdx, args: args}
}

// Next returns the next placeholder string (e.g., "$3") and appends arg to
// the internal args slice.
func (ac *argCounter) Next(arg any) string {
	placeholder := fmt.Sprintf("$%d", ac.next)
	ac.next++
	ac.args = append(ac.args, arg)
	return placeholder
}

// parseTime parses a timestamp string in RFC3339 format.
// Returns zero time on error.
func parseTime(s string) (time.Time, error) {
	return time.Parse(time.RFC3339, s)
}
