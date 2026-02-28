package ai

import (
	"fmt"
	"strings"
)

// DefaultCustomDirections is the default instructor-editable prompt section.
// Instructors can override this to adjust how the AI categorizes student work.
const DefaultCustomDirections = `Identify distinct bugs, misconceptions, or patterns across all student submissions. Group students by issue. A student can appear in multiple issues. Order issues by frequency (most common first).

Severity guidelines:
- "error": A logical or correctness bug (e.g., off-by-one, wrong operator, incorrect algorithm)
- "misconception": A conceptual misunderstanding (e.g., confusing iteration with recursion, wrong mental model)
- "style": A code quality concern that does not affect correctness (e.g., redundant variable, unclear naming)
- "good-pattern": A positive practice worth highlighting to the class

Constraints:
- Be CONCISE — instructor reads this live during lecture.
- Maximum 5 issues. Only include issues that are pedagogically interesting.
- Title: short (3-8 words).
- Explanation: one sentence, actionable.
- Each issue must have at least 1 student.
- Omit students with empty or unmodified starter code from issue lists.
- Set overall_note to a 1-2 sentence summary of the class's performance.`

// BuildPrompt constructs the full prompt for the AI model from the problem description,
// student submissions, and instructor-provided custom directions.
func BuildPrompt(problemDescription string, submissions []StudentSubmission, customDirections string) string {
	var sb strings.Builder

	sb.WriteString("You are an experienced CS instructor analyzing student code submissions for a live classroom walkthrough.\n\n")

	sb.WriteString("## Problem Description\n\n")
	sb.WriteString(problemDescription)
	sb.WriteString("\n\n")

	sb.WriteString("## Instructor Directions\n\n")
	sb.WriteString(customDirections)
	sb.WriteString("\n\n")

	sb.WriteString("## Student Submissions\n\n")
	if len(submissions) == 0 {
		sb.WriteString("(No submissions provided)\n\n")
	} else {
		for i, sub := range submissions {
			sb.WriteString(fmt.Sprintf("### Student %d: %s (ID: %s)\n\n", i+1, sub.Name, sub.UserID))
			sb.WriteString("```\n")
			sb.WriteString(sub.Code)
			sb.WriteString("\n```\n\n")
		}
	}

	sb.WriteString("## Output Instructions\n\n")
	sb.WriteString("Return a JSON object matching the specified schema. ")
	sb.WriteString("Each issue's `count` field must equal the length of its `student_ids` array. ")
	sb.WriteString("The `representative_student_id` must be one of the IDs in `student_ids`, ")
	sb.WriteString("and `representative_student_label` must be that student's name.\n")

	return sb.String()
}
