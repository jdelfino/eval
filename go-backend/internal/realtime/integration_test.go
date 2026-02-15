package realtime_test

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"testing"
	"time"

	centrifuge "github.com/centrifugal/centrifuge-go"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jdelfino/eval/go-backend/internal/realtime"
)

var integTestLogger = slog.Default()

// centrifugoEnv reads Centrifugo connection details from the environment.
// Returns the values and true if set, or skips the test if CENTRIFUGO_URL is unset.
func centrifugoEnv(t *testing.T) (url, wsURL, apiKey, secret string) {
	t.Helper()

	url = os.Getenv("CENTRIFUGO_URL")
	if url == "" {
		t.Skip("CENTRIFUGO_URL not set, skipping Centrifugo integration test")
	}

	apiKey = os.Getenv("CENTRIFUGO_API_KEY")
	if apiKey == "" {
		t.Skip("CENTRIFUGO_API_KEY not set, skipping Centrifugo integration test")
	}

	secret = os.Getenv("CENTRIFUGO_TOKEN_SECRET")
	if secret == "" {
		t.Skip("CENTRIFUGO_TOKEN_SECRET not set, skipping Centrifugo integration test")
	}

	wsURL = os.Getenv("CENTRIFUGO_WS_URL")
	if wsURL == "" {
		wsURL = "ws://localhost:8000/connection/websocket"
	}

	// Quick health check so we fail fast with a useful message.
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(url + "/health")
	if err != nil {
		t.Skipf("Centrifugo not reachable at %s: %v", url, err)
	}
	_ = resp.Body.Close()

	return url, wsURL, apiKey, secret
}

// generateSubscriberToken creates a JWT signed with the given HMAC secret.
func generateSubscriberToken(t *testing.T, secret, userID string) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": userID,
		"exp": time.Now().Add(5 * time.Minute).Unix(),
	})
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("signing JWT: %v", err)
	}
	return signed
}

// newSubscriber creates a centrifuge-go client connected to Centrifugo.
func newSubscriber(t *testing.T, wsURL, secret, userID string) *centrifuge.Client {
	t.Helper()
	c := centrifuge.NewJsonClient(wsURL, centrifuge.Config{
		Token: generateSubscriberToken(t, secret, userID),
	})
	return c
}

// generateSubscriptionToken creates a subscription JWT for the given channel.
func generateSubscriptionToken(t *testing.T, secret, userID, channel string) string {
	t.Helper()
	gen, err := realtime.NewHMACTokenGenerator(secret)
	if err != nil {
		t.Fatalf("creating token generator: %v", err)
	}
	token, err := gen.SubscriptionToken(userID, channel, 5*time.Minute)
	if err != nil {
		t.Fatalf("generating subscription token: %v", err)
	}
	return token
}

// subscribeAndCollect subscribes to a channel and blocks until the server confirms
// the subscription is active. Returns received publications and a cleanup function.
func subscribeAndCollect(t *testing.T, client *centrifuge.Client, channel string, subToken string) (<-chan []byte, func()) {
	t.Helper()
	ch := make(chan []byte, 10)
	ready := make(chan struct{})

	sub, err := client.NewSubscription(channel, centrifuge.SubscriptionConfig{
		Token: subToken,
	})
	if err != nil {
		t.Fatalf("creating subscription: %v", err)
	}
	sub.OnPublication(func(e centrifuge.PublicationEvent) {
		ch <- e.Data
	})
	sub.OnSubscribed(func(_ centrifuge.SubscribedEvent) {
		close(ready)
	})
	sub.OnError(func(e centrifuge.SubscriptionErrorEvent) {
		t.Errorf("subscription error on %s: %v", channel, e.Error)
	})

	if err := sub.Subscribe(); err != nil {
		t.Fatalf("subscribing: %v", err)
	}

	select {
	case <-ready:
	case <-time.After(5 * time.Second):
		t.Fatalf("timeout waiting for subscription to %s", channel)
	}

	cleanup := func() {
		_ = sub.Unsubscribe()
	}
	return ch, cleanup
}

func connectClient(t *testing.T, c *centrifuge.Client) {
	t.Helper()
	errCh := make(chan error, 1)
	connectedCh := make(chan struct{}, 1)
	c.OnConnected(func(_ centrifuge.ConnectedEvent) {
		select {
		case connectedCh <- struct{}{}:
		default:
		}
	})
	c.OnError(func(e centrifuge.ErrorEvent) {
		select {
		case errCh <- e.Error:
		default:
		}
	})
	if err := c.Connect(); err != nil {
		t.Fatalf("connecting: %v", err)
	}
	select {
	case <-connectedCh:
	case err := <-errCh:
		t.Fatalf("connection error: %v", err)
	case <-time.After(5 * time.Second):
		t.Fatal("timeout waiting for connection")
	}
}

type testEvent struct {
	Type string `json:"type"`
	Data string `json:"data"`
}

func TestPublish_IntegrationWithCentrifugo(t *testing.T) {
	cfgURL, wsURL, apiKey, secret := centrifugoEnv(t)

	sub := newSubscriber(t, wsURL, secret, "user-1")
	connectClient(t, sub)
	defer sub.Close()

	subToken := generateSubscriptionToken(t, secret, "user-1", "session:test-session-1")
	pubCh, cleanup := subscribeAndCollect(t, sub, "session:test-session-1", subToken)
	defer cleanup()

	client := realtime.NewClient(cfgURL, apiKey, integTestLogger)
	event := testEvent{Type: "student_joined", Data: "hello"}
	ctx := context.Background()
	if err := client.Publish(ctx, "session:test-session-1", event); err != nil {
		t.Fatalf("publish failed: %v", err)
	}

	select {
	case raw := <-pubCh:
		var got testEvent
		if err := json.Unmarshal(raw, &got); err != nil {
			t.Fatalf("unmarshal received message: %v", err)
		}
		if got.Type != "student_joined" {
			t.Errorf("expected type student_joined, got %s", got.Type)
		}
		if got.Data != "hello" {
			t.Errorf("expected data hello, got %s", got.Data)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timeout waiting for published message")
	}
}

func TestPublish_MultipleSubscribers(t *testing.T) {
	cfgURL, wsURL, apiKey, secret := centrifugoEnv(t)

	sub1 := newSubscriber(t, wsURL, secret, "user-1")
	connectClient(t, sub1)
	defer sub1.Close()

	sub2 := newSubscriber(t, wsURL, secret, "user-2")
	connectClient(t, sub2)
	defer sub2.Close()

	subToken1 := generateSubscriptionToken(t, secret, "user-1", "session:multi-test")
	ch1, cleanup1 := subscribeAndCollect(t, sub1, "session:multi-test", subToken1)
	defer cleanup1()
	subToken2 := generateSubscriptionToken(t, secret, "user-2", "session:multi-test")
	ch2, cleanup2 := subscribeAndCollect(t, sub2, "session:multi-test", subToken2)
	defer cleanup2()

	client := realtime.NewClient(cfgURL, apiKey, integTestLogger)
	event := testEvent{Type: "code_update", Data: "payload"}
	if err := client.Publish(context.Background(), "session:multi-test", event); err != nil {
		t.Fatalf("publish failed: %v", err)
	}

	var wg sync.WaitGroup
	wg.Add(2)

	receive := func(name string, ch <-chan []byte) {
		defer wg.Done()
		select {
		case raw := <-ch:
			var got testEvent
			if err := json.Unmarshal(raw, &got); err != nil {
				t.Errorf("%s: unmarshal: %v", name, err)
				return
			}
			if got.Type != "code_update" {
				t.Errorf("%s: expected type code_update, got %s", name, got.Type)
			}
		case <-time.After(5 * time.Second):
			t.Errorf("%s: timeout waiting for message", name)
		}
	}

	go receive("sub1", ch1)
	go receive("sub2", ch2)
	wg.Wait()
}

func TestPublish_DifferentChannels(t *testing.T) {
	cfgURL, wsURL, apiKey, secret := centrifugoEnv(t)

	sub := newSubscriber(t, wsURL, secret, "user-1")
	connectClient(t, sub)
	defer sub.Close()

	subToken := generateSubscriptionToken(t, secret, "user-1", "session:channel-a")
	chA, cleanup := subscribeAndCollect(t, sub, "session:channel-a", subToken)
	defer cleanup()

	client := realtime.NewClient(cfgURL, apiKey, integTestLogger)
	event := testEvent{Type: "ping", Data: "wrong-channel"}
	if err := client.Publish(context.Background(), "session:channel-b", event); err != nil {
		t.Fatalf("publish failed: %v", err)
	}

	select {
	case raw := <-chA:
		t.Fatalf("should not have received message on channel A, got: %s", string(raw))
	case <-time.After(1 * time.Second):
		// Expected: no message received.
	}
}

func TestPublish_InvalidAPIKey(t *testing.T) {
	cfgURL, _, _, _ := centrifugoEnv(t)

	client := realtime.NewClient(cfgURL, "wrong-api-key", integTestLogger)
	event := testEvent{Type: "test", Data: "data"}
	err := client.Publish(context.Background(), "session:test", event)
	if err == nil {
		t.Fatal("expected error with invalid API key")
	}
}
