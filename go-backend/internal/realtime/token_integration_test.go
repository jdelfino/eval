//go:build integration

package realtime_test

import (
	"testing"
	"time"

	centrifuge "github.com/centrifugal/centrifuge-go"
	"github.com/jdelfino/eval/internal/realtime"
)

func TestConnectionToken_AcceptedByCentrifugo(t *testing.T) {
	gen, err := realtime.NewHMACTokenGenerator(centrifugoSecret)
	if err != nil {
		t.Fatal(err)
	}

	token, err := gen.ConnectionToken("user-token-1", 5*time.Minute)
	if err != nil {
		t.Fatal(err)
	}

	c := centrifuge.NewJsonClient(centrifugoWSURL, centrifuge.Config{
		Token: token,
	})
	defer c.Close()

	connectClient(t, c)
}

func TestSubscriptionToken_AcceptedByCentrifugo(t *testing.T) {
	gen, err := realtime.NewHMACTokenGenerator(centrifugoSecret)
	if err != nil {
		t.Fatal(err)
	}

	connToken, err := gen.ConnectionToken("user-sub-1", 5*time.Minute)
	if err != nil {
		t.Fatal(err)
	}

	channel := "session:token-sub-test"
	subToken, err := gen.SubscriptionToken("user-sub-1", channel, 5*time.Minute)
	if err != nil {
		t.Fatal(err)
	}

	c := centrifuge.NewJsonClient(centrifugoWSURL, centrifuge.Config{
		Token: connToken,
	})
	defer c.Close()

	connectClient(t, c)

	sub, err := c.NewSubscription(channel, centrifuge.SubscriptionConfig{
		Token: subToken,
	})
	if err != nil {
		t.Fatalf("creating subscription: %v", err)
	}

	subscribedCh := make(chan struct{}, 1)
	errCh := make(chan error, 1)
	sub.OnSubscribed(func(_ centrifuge.SubscribedEvent) {
		select {
		case subscribedCh <- struct{}{}:
		default:
		}
	})
	sub.OnError(func(e centrifuge.SubscriptionErrorEvent) {
		select {
		case errCh <- e.Error:
		default:
		}
	})

	if err := sub.Subscribe(); err != nil {
		t.Fatalf("subscribing: %v", err)
	}

	select {
	case <-subscribedCh:
		// Success.
	case err := <-errCh:
		t.Fatalf("subscription error: %v", err)
	case <-time.After(5 * time.Second):
		t.Fatal("timeout waiting for subscription")
	}
}

func TestSubscriptionToken_WrongChannel(t *testing.T) {
	gen, err := realtime.NewHMACTokenGenerator(centrifugoSecret)
	if err != nil {
		t.Fatal(err)
	}

	connToken, err := gen.ConnectionToken("user-wrong-ch", 5*time.Minute)
	if err != nil {
		t.Fatal(err)
	}

	// Token for channel A.
	subToken, err := gen.SubscriptionToken("user-wrong-ch", "session:channel-a", 5*time.Minute)
	if err != nil {
		t.Fatal(err)
	}

	c := centrifuge.NewJsonClient(centrifugoWSURL, centrifuge.Config{
		Token: connToken,
	})
	defer c.Close()

	connectClient(t, c)

	// Try subscribing to channel B with token for channel A.
	sub, err := c.NewSubscription("session:channel-b", centrifuge.SubscriptionConfig{
		Token: subToken,
	})
	if err != nil {
		t.Fatalf("creating subscription: %v", err)
	}

	subscribedCh := make(chan struct{}, 1)
	errCh := make(chan error, 1)
	sub.OnSubscribed(func(_ centrifuge.SubscribedEvent) {
		select {
		case subscribedCh <- struct{}{}:
		default:
		}
	})
	sub.OnError(func(e centrifuge.SubscriptionErrorEvent) {
		select {
		case errCh <- e.Error:
		default:
		}
	})

	if err := sub.Subscribe(); err != nil {
		t.Fatalf("subscribing: %v", err)
	}

	select {
	case <-subscribedCh:
		t.Fatal("expected subscription to be rejected, but it succeeded")
	case <-errCh:
		// Expected: subscription rejected because token channel doesn't match.
	case <-time.After(5 * time.Second):
		t.Fatal("timeout waiting for subscription error")
	}
}

func TestConnectionToken_Expired(t *testing.T) {
	gen, err := realtime.NewHMACTokenGenerator(centrifugoSecret)
	if err != nil {
		t.Fatal(err)
	}

	// Generate a token that is already expired.
	token, err := gen.ConnectionToken("user-expired", -1*time.Second)
	if err != nil {
		t.Fatal(err)
	}

	c := centrifuge.NewJsonClient(centrifugoWSURL, centrifuge.Config{
		Token: token,
	})
	defer c.Close()

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
		// Connection initiation error is also acceptable.
		return
	}

	select {
	case <-connectedCh:
		t.Fatal("expected connection to be rejected with expired token, but it succeeded")
	case <-errCh:
		// Expected: connection rejected due to expired token.
	case <-time.After(5 * time.Second):
		t.Fatal("timeout waiting for connection error")
	}
}

func TestConnectionToken_InvalidSecret(t *testing.T) {
	gen, err := realtime.NewHMACTokenGenerator("wrong-secret-not-matching-centrifugo")
	if err != nil {
		t.Fatal(err)
	}

	token, err := gen.ConnectionToken("user-bad-secret", 5*time.Minute)
	if err != nil {
		t.Fatal(err)
	}

	c := centrifuge.NewJsonClient(centrifugoWSURL, centrifuge.Config{
		Token: token,
	})
	defer c.Close()

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
		// Connection initiation error is also acceptable.
		return
	}

	select {
	case <-connectedCh:
		t.Fatal("expected connection to be rejected with invalid secret, but it succeeded")
	case <-errCh:
		// Expected: connection rejected due to invalid token signature.
	case <-time.After(5 * time.Second):
		t.Fatal("timeout waiting for connection error")
	}
}
