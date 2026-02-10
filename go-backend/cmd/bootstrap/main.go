// Command bootstrap creates an Identity Platform (Firebase Auth) user for the
// initial system admin and sets a custom claim so the app's /auth/bootstrap
// endpoint can create the corresponding database record.
//
// Usage:
//
//	go run ./cmd/bootstrap --email admin@example.com
//
// After running, log into the app — the frontend will call POST /auth/bootstrap
// to finalize the account.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"syscall"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
	"golang.org/x/term"
)

func main() {
	email := flag.String("email", "", "Email address for the admin user (required)")
	flag.Parse()

	if *email == "" {
		fmt.Fprintln(os.Stderr, "Usage: bootstrap --email <email>")
		flag.PrintDefaults()
		os.Exit(1)
	}

	password, err := promptPassword()
	if err != nil {
		slog.Error("failed to read password", "error", err)
		os.Exit(1)
	}

	projectID := os.Getenv("GCP_PROJECT_ID")
	if projectID == "" {
		fmt.Fprintln(os.Stderr, "Error: GCP_PROJECT_ID environment variable is required")
		os.Exit(1)
	}

	ctx := context.Background()

	// Create Identity Platform user (or retrieve existing).
	uid, err := ensureFirebaseUser(ctx, projectID, *email, password)
	if err != nil {
		slog.Error("failed to ensure Firebase user", "error", err)
		os.Exit(1)
	}

	// Set custom claim so the app knows this user is a system-admin.
	if err := setCustomClaims(ctx, projectID, uid); err != nil {
		slog.Error("failed to set custom claims", "error", err)
		os.Exit(1)
	}

	fmt.Printf("System admin ready in Identity Platform: email=%s uid=%s\n", *email, uid)
	fmt.Println("Log into the app to finalize the account.")
}

// promptPassword reads a password interactively with hidden input and confirmation.
func promptPassword() (string, error) {
	if !term.IsTerminal(int(syscall.Stdin)) {
		return "", fmt.Errorf("bootstrap requires an interactive terminal for password input")
	}

	fmt.Fprint(os.Stderr, "Password: ")
	pw1, err := term.ReadPassword(int(syscall.Stdin))
	if err != nil {
		return "", fmt.Errorf("reading password: %w", err)
	}
	fmt.Fprintln(os.Stderr)

	fmt.Fprint(os.Stderr, "Confirm password: ")
	pw2, err := term.ReadPassword(int(syscall.Stdin))
	if err != nil {
		return "", fmt.Errorf("reading confirmation: %w", err)
	}
	fmt.Fprintln(os.Stderr)

	password := string(pw1)
	if password != string(pw2) {
		return "", fmt.Errorf("passwords do not match")
	}
	if len(password) < 6 {
		return "", fmt.Errorf("password must be at least 6 characters")
	}

	return password, nil
}

// ensureFirebaseUser creates an Identity Platform user or returns the existing
// user's UID if the email is already registered.
func ensureFirebaseUser(ctx context.Context, projectID, email, password string) (string, error) {
	app, err := firebase.NewApp(ctx, &firebase.Config{ProjectID: projectID})
	if err != nil {
		return "", fmt.Errorf("initializing Firebase (check GCP credentials): %w", err)
	}

	client, err := app.Auth(ctx)
	if err != nil {
		return "", fmt.Errorf("creating auth client: %w", err)
	}

	params := (&auth.UserToCreate{}).
		Email(email).
		Password(password).
		EmailVerified(true)

	record, err := client.CreateUser(ctx, params)
	if err != nil {
		if auth.IsEmailAlreadyExists(err) {
			existing, err := client.GetUserByEmail(ctx, email)
			if err != nil {
				return "", fmt.Errorf("user exists but failed to retrieve: %w", err)
			}
			slog.Info("Identity Platform user already exists, using existing UID",
				"email", email, "uid", existing.UID)
			return existing.UID, nil
		}
		return "", fmt.Errorf("creating Identity Platform user: %w", err)
	}

	slog.Info("Identity Platform user created", "email", email, "uid", record.UID)
	return record.UID, nil
}

// setCustomClaims sets the role=system-admin custom claim on the Firebase user.
// The app's /auth/bootstrap endpoint reads this claim from the JWT to authorize
// system-admin creation.
func setCustomClaims(ctx context.Context, projectID, uid string) error {
	app, err := firebase.NewApp(ctx, &firebase.Config{ProjectID: projectID})
	if err != nil {
		return fmt.Errorf("initializing Firebase: %w", err)
	}

	client, err := app.Auth(ctx)
	if err != nil {
		return fmt.Errorf("creating auth client: %w", err)
	}

	claims := map[string]any{"role": "system-admin"}
	if err := client.SetCustomUserClaims(ctx, uid, claims); err != nil {
		return fmt.Errorf("setting custom claims: %w", err)
	}

	slog.Info("Custom claims set", "uid", uid, "claims", claims)
	return nil
}
