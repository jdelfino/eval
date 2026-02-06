package realtime

import "net/http"

// SetHTTPClient replaces the HTTP client used by Client. Exported for testing.
func SetHTTPClient(c *Client, hc *http.Client) {
	c.httpClient = hc
}
