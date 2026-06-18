/**
 * Open the public/projector view for a session in a new window.
 *
 * Shared by SessionControls ("Open Public View") and SessionLaunchStrip
 * ("Cast to projector") so the URL and window params stay in sync.
 */
export function openPublicView(sessionId: string): void {
  const publicViewUrl = `/public-view?session_id=${sessionId}`;
  window.open(publicViewUrl, '_blank', 'width=1200,height=800');
}
