package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
)

// renderProblemsPDF generates a PDF document from a slice of ExportProblem.
// It returns the PDF as bytes or an error if generation fails.
// This function is independent of HTTP concerns and consumes the ExportProblem
// type defined in the handler package.
func renderProblemsPDF(problems []ExportProblem, exportedAt time.Time) ([]byte, error) {
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetTitle("Problem Library Export", true)
	pdf.SetAuthor("Eval Platform", true)

	// Set default font for the document
	pdf.SetFont("Helvetica", "", 12)

	// If there are no problems, still create a valid PDF with a title page
	if len(problems) == 0 {
		pdf.AddPage()
		pdf.SetFont("Helvetica", "B", 16)
		pdf.Cell(0, 10, "Problem Library Export")
		pdf.Ln(8)
		pdf.SetFont("Helvetica", "", 10)
		pdf.Cell(0, 6, fmt.Sprintf("Exported: %s", exportedAt.Format("2006-01-02 15:04:05 MST")))
		pdf.Ln(8)
		pdf.SetFont("Helvetica", "I", 12)
		pdf.Cell(0, 8, "No problems to export.")
	}

	for _, p := range problems {
		pdf.AddPage()

		// Title - Helvetica Bold 16pt
		pdf.SetFont("Helvetica", "B", 16)
		pdf.MultiCell(0, 8, p.Title, "", "L", false)
		pdf.Ln(4)

		// Metadata line: "Language: {lang} | Tags: {tag1, tag2}" - Helvetica 10pt gray
		pdf.SetFont("Helvetica", "", 10)
		pdf.SetTextColor(100, 100, 100)
		tagsStr := strings.Join(p.Tags, ", ")
		if tagsStr == "" {
			tagsStr = "none"
		}
		metadataLine := fmt.Sprintf("Language: %s | Tags: %s", p.Language, tagsStr)
		pdf.Cell(0, 6, metadataLine)
		pdf.Ln(8)
		pdf.SetTextColor(0, 0, 0) // Reset to black

		// Description - Helvetica 12pt, if present
		if p.Description != nil && *p.Description != "" {
			pdf.SetFont("Helvetica", "", 12)
			pdf.MultiCell(0, 6, *p.Description, "", "L", false)
			pdf.Ln(6)
		}

		// Starter Code section - if present
		if p.StarterCode != nil && *p.StarterCode != "" {
			pdf.SetFont("Helvetica", "B", 12)
			pdf.Cell(0, 8, "Starter Code")
			pdf.Ln(6)
			pdfCodeBlock(pdf, *p.StarterCode)
			pdf.Ln(6)
		}

		// Test Cases section - pretty-printed JSON
		pdf.SetFont("Helvetica", "B", 12)
		pdf.Cell(0, 8, "Test Cases")
		pdf.Ln(6)
		prettyTestCases, err := prettyPrintJSON(p.TestCases)
		if err != nil {
			return nil, fmt.Errorf("pretty-printing test cases: %w", err)
		}
		pdfCodeBlock(pdf, prettyTestCases)
		pdf.Ln(6)

		// Solution section - if present
		if p.Solution != nil && *p.Solution != "" {
			pdf.SetFont("Helvetica", "B", 12)
			pdf.Cell(0, 8, "Solution")
			pdf.Ln(6)
			pdfCodeBlock(pdf, *p.Solution)
			pdf.Ln(6)
		}

	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("generating PDF: %w", err)
	}
	return buf.Bytes(), nil
}

// pdfCodeBlock renders monospace text with a light gray background.
// It handles page overflow by using MultiCell which automatically wraps.
func pdfCodeBlock(pdf *fpdf.Fpdf, content string) {
	// Set light gray background (#f5f5f5 = RGB 245, 245, 245)
	pdf.SetFillColor(245, 245, 245)

	// Use Courier (monospace) font, 9pt
	pdf.SetFont("Courier", "", 9)

	// Split content into lines for proper rendering
	lines := strings.Split(content, "\n")
	leftMargin, _, rightMargin, _ := pdf.GetMargins()
	pageWidth, _ := pdf.GetPageSize()
	usableWidth := pageWidth - leftMargin - rightMargin

	for _, line := range lines {
		// Check if we need a new page
		_, currentY := pdf.GetXY()
		_, pageHeight := pdf.GetPageSize()
		_, _, _, bottomMargin := pdf.GetMargins()
		if currentY > pageHeight-bottomMargin-10 {
			pdf.AddPage()
		}

		// If line is empty, just add spacing
		if line == "" {
			pdf.Ln(4)
			continue
		}

		// Draw filled rectangle for this line
		x, y := pdf.GetXY()
		lineHeight := 4.0
		pdf.Rect(x, y, usableWidth, lineHeight, "F")

		// Draw the text on top of the filled rectangle
		pdf.Cell(usableWidth, lineHeight, line)
		pdf.Ln(lineHeight)
	}

	// Reset font to default
	pdf.SetFont("Helvetica", "", 12)
	pdf.SetFillColor(255, 255, 255) // Reset to white
}

// prettyPrintJSON formats json.RawMessage with indentation.
func prettyPrintJSON(rawMsg json.RawMessage) (string, error) {
	if len(rawMsg) == 0 {
		return "{}", nil
	}

	var v interface{}
	if err := json.Unmarshal(rawMsg, &v); err != nil {
		return "", fmt.Errorf("unmarshaling JSON: %w", err)
	}

	prettyBytes, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshaling JSON with indent: %w", err)
	}

	return string(prettyBytes), nil
}
