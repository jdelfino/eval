//go:build integration

package realtime_test

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	centrifuge "github.com/centrifugal/centrifuge-go"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jdelfino/eval/internal/realtime"
)

const (
	centrifugoURL    = "http://localhost:8000"
	centrifugoWSURL  = "ws://localhost:8000/connection/websocket"
	centrifugoAPIKey = "local-api-key"
	centrifugoSecret = "local-dev-secret-key-not-for-production"
)

// generateSubscriberToken creates a JWT signed with the local dev HMAC secret.
func generateSubscriberToken(t *testing.T, userID string) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": userID,
		"exp": time.Now().Add(5 * time.Minute).Unix(),
	})
	signed, err := token.SignedString([]byte(centrifugoSecret))
	if err != nil {
		t.Fatalf("signing JWT: %v", err)
	}
	return signed
}

// newSubscriber creates a centrifuge-go client connected to local Centrifugo.
func newSubscriber(t *testing.T, userID string) *centrifuge.Client {
	t.Helper()
	c := centrifuge.NewJsonClient(centrifugoWSURL, centrifuge.Config{
		Token: generateSubscriberToken(t, userID),
	})
	return c
}

// subscribeAndCollect subscribes to a channel and sends received publications to the returned channel.
func subscribeAndCollect(t *testing.T, client *centrifuge.Client, channel string) (<-chan []byte, func()) {
	t.Helper()
	ch := make(chan []byte, 10)
	sub, err := client.NewSubscription(channel)
	if err != nil {
		t.Fatalf("creating subscription: %v", err)
	}
	sub.OnPublication(func(e centrifuge.PublicationEvent) {
		ch <- e.Data
	})

	errCh := make(chan error, 1)
	sub.OnError(func(e centrifuge.SubscriptionErrorEvent) {
		errCh <- e.Error
	})

	if err := sub.Subscribe(); err != nil {
		t.Fatalf("subscribing: %v", err)
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
	sub := newSubscriber(t, "user-1")
	connectClient(t, sub)
	defer sub.Close()

	pubCh, cleanup := subscribeAndCollect(t, sub, "session:test-session-1")
	defer cleanup()

	// Small delay to ensure subscription is active on Centrifugo side.
	time.Sleep(200 * time.Millisecond)

	client := realtime.NewClient(centrifugoURL, centrifugoAPIKey)
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
	sub1 := newSubscriber(t, "user-1")
	connectClient(t, sub1)
	defer sub1.Close()

	sub2 := newSubscriber(t, "user-2")
	connectClient(t, sub2)
	defer sub2.Close()

	ch1, cleanup1 := subscribeAndCollect(t, sub1, "session:multi-test")
	defer cleanup1()
	ch2, cleanup2 := subscribeAndCollect(t, sub2, "session:multi-test")
	defer cleanup2()

	time.Sleep(200 * time.Millisecond)

	client := realtime.NewClient(centrifugoURL, centrifugoAPIKey)
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
	sub := newSubscriber(t, "user-1")
	connectClient(t, sub)
	defer sub.Close()

	chA, cleanup := subscribeAndCollect(t, sub, "session:channel-a")
	defer cleanup()

	time.Sleep(200 * time.Millisecond)

	client := realtime.NewClient(centrifugoURL, centrifugoAPIKey)
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
	client := realtime.NewClient(centrifugoURL, "wrong-api-key")
	event := testEvent{Type: "test", Data: "data"}
	err := client.Publish(context.Background(), "session:test", event)
	if err == nil {
		t.Fatal("expected error with invalid API key")
	}
}
