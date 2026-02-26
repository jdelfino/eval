package ai

import (
	"fmt"
	"strings"
)

// DefaultCustomDirections is the default instructor-editable prompt section.
// Instructors can override this to adjust how the AI categorizes student work.
const DefaultCustomDirections = `Identify patterns across all student submissions. Group students by common mistakes or approaches.

Bucket guidelines:
- "error": A logical or correctness bug (e.g., off-by-one, wrong operator, incorrect algorithm)
- "misconception": A conceptual misunderstanding (e.g., confusing iteration with recursion, wrong mental model)
- "style": A code quality concern that does not affect correctness (e.g., redundant variable, unclear naming)
- "good-pattern": A positive practice worth highlighting to the class

Constraints:
- Return at most 5 issues total across all buckets.
- Each issue must have at least 1 student.
- Do not create a bucket for students who have not attempted the problem or submitted empty code — omit them from issue buckets and include their IDs in finished_student_ids if their code is complete, or exclude them from all lists if it is empty.
- Set overall_note to a 1-2 sentence summary of the class's performance.`

// BuildPrompt constructs the full prompt for the AI model from the problem description,
// student submissions, and instructor-provided custom directions.
func BuildPrompt(problemDescription string, submissions []StudentSubmission, customDirections string) string {
	var sb strings.Builder

	sb.WriteString("You are an expert programming instructor analyzing student code submissions.\n")
	sb.WriteString("Your task is to identify common patterns, mistakes, and strengths across the class.\n\n")

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
