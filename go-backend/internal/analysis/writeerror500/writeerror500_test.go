package writeerror500_test

import (
	"testing"

	"github.com/jdelfino/eval/go-backend/internal/analysis/writeerror500"
	"golang.org/x/tools/go/analysis/analysistest"
)

func TestAnalyzer(t *testing.T) {
	analysistest.Run(t, analysistest.TestData(), writeerror500.Analyzer, "example")
}
