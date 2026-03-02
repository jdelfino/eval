package ratelimit

import "time"

// Predefined rate limit categories.
var (
	CategoryAuth = Category{
		Name:      "auth",
		Algorithm: "fixed",
		Limit:     20,
		Window:    1 * time.Minute,
	}
	CategoryJoin = Category{
		Name:      "join",
		Algorithm: "sliding",
		Limit:     10,
		Window:    1 * time.Minute,
	}
	CategoryExecute = Category{
		Name:      "execute",
		Algorithm: "sliding",
		Limit:     30,
		Window:    1 * time.Minute,
	}
	CategoryPractice = Category{
		Name:      "practice",
		Algorithm: "sliding",
		Limit:     15,
		Window:    1 * time.Minute,
	}
	CategoryTrace = Category{
		Name:      "trace",
		Algorithm: "sliding",
		Limit:     10,
		Window:    1 * time.Minute,
	}
	CategoryAnalyze = Category{
		Name:      "analyze",
		Algorithm: "sliding",
		Limit:     5,
		Window:    1 * time.Minute,
	}
	CategoryAnalyzeDaily = Category{
		Name:      "analyzeDaily",
		Algorithm: "fixed",
		Limit:     100,
		Window:    24 * time.Hour,
	}
	CategoryAnalyzeGlobal = Category{
		Name:      "analyzeGlobal",
		Algorithm: "fixed",
		Limit:     750,
		Window:    24 * time.Hour,
	}
	CategorySessionCreate = Category{
		Name:      "sessionCreate",
		Algorithm: "sliding",
		Limit:     10,
		Window:    1 * time.Hour,
	}
	CategoryWrite = Category{
		Name:      "write",
		Algorithm: "sliding",
		Limit:     30,
		Window:    1 * time.Minute,
	}
	CategoryRead = Category{
		Name:      "read",
		Algorithm: "sliding",
		Limit:     100,
		Window:    1 * time.Minute,
	}
	CategoryClientError = Category{
		Name:      "clientError",
		Algorithm: "sliding",
		Limit:     60,
		Window:    1 * time.Minute,
	}

	// Defense-in-depth global limit for the executor service.
	// Per-student limits are enforced at the go-backend; this only
	// guards against an attacker bypassing those limits.
	CategoryExecutorGlobal = Category{
		Name:      "executorGlobal",
		Algorithm: "sliding",
		Limit:     1000,
		Window:    1 * time.Minute,
	}
)

// Categories returns all predefined rate limit categories indexed by name.
func Categories() map[string]Category {
	return map[string]Category{
		CategoryAuth.Name:          CategoryAuth,
		CategoryJoin.Name:          CategoryJoin,
		CategoryExecute.Name:       CategoryExecute,
		CategoryPractice.Name:      CategoryPractice,
		CategoryTrace.Name:         CategoryTrace,
		CategoryAnalyze.Name:       CategoryAnalyze,
		CategoryAnalyzeDaily.Name:  CategoryAnalyzeDaily,
		CategoryAnalyzeGlobal.Name: CategoryAnalyzeGlobal,
		CategorySessionCreate.Name: CategorySessionCreate,
		CategoryWrite.Name:          CategoryWrite,
		CategoryRead.Name:           CategoryRead,
		CategoryExecutorGlobal.Name: CategoryExecutorGlobal,
		CategoryClientError.Name:    CategoryClientError,
	}
}
