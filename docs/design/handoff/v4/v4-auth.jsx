/* ============================================================
   v4 — Auth, landing, register, invite, join (I, J, K, L, M)
   + edge-case states (J2, K2, L2, L3)

   Design rules from the brief:
   - OAuth = Google + GitHub + Microsoft. Three buttons, equal weight.
   - Email/password is HIDDEN. Reachable via a small footer link only,
     never on the main card. No "Send sign-in link" / no magic-link copy.
   - No "Sign up" CTA anywhere. Instructor entry = invite. Student entry = join code.
   - Brand = "Eval" everywhere.
   - Landing primary = join-code field. Returning users use the header "Sign in".
   - Student registration = OAuth-only (name comes from the OAuth profile).
   - Edge cases that need real screens: invalid join code, email mismatch
     on invite, expired/used invite, OAuth failure.
   ============================================================ */
const { Btn: AuthBtn, Pill: AuthPill, IconBtn: AuthIB, Icon: AuthIcon, Field: AuthField, Input: AuthInput } = window.EvalUI;
const { ScreenShell: AuthShell } = window.EvalUI;

/* ---------- Brand mark ---------- */
function EvalLogomark({ size = 26 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{
        width: size, height: size, borderRadius: 5, background: "var(--accent)",
        display: "grid", placeItems: "center",
        fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: Math.round(size * 0.54), color: "var(--accent-fg)",
      }}>e</div>
      <span style={{ fontFamily: "var(--font-serif)", fontSize: 17, fontWeight: 500, letterSpacing: -0.3 }}>Eval</span>
    </div>
  );
}

/* ---------- Provider buttons ---------- */
/* Inline SVG marks instead of icon-name tokens, so the provider identity reads
   even though buttons are equal-weight outline. */
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.6 6.1 29.6 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16.1 19 13 24 13c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.5-2.1 14.2-5.6l-6.5-5.5c-2 1.4-4.6 2.3-7.7 2.3-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.7 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.5 5.5C40.8 36 44 30.5 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
function GitHubMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.55v-2.06c-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.27-5.24-5.66 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.17a10.93 10.93 0 0 1 5.74 0c2.19-1.48 3.15-1.17 3.15-1.17.62 1.58.23 2.75.11 3.04.73.8 1.18 1.82 1.18 3.07 0 4.4-2.7 5.36-5.27 5.65.41.36.78 1.06.78 2.14v3.18c0 .31.21.66.8.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}
function MicrosoftMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
      <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

function ProviderButton({ provider, children }) {
  const mark = provider === "google" ? <GoogleMark/> : provider === "github" ? <GitHubMark/> : <MicrosoftMark/>;
  return (
    <button style={{
      width: "100%", height: 44, padding: "0 14px",
      display: "flex", alignItems: "center", gap: 10,
      background: "var(--bg)", border: "1px solid var(--border)",
      borderRadius: "var(--radius)", cursor: "pointer",
      fontSize: 13.5, fontWeight: 500, color: "var(--fg)",
      fontFamily: "inherit",
    }}>
      <span style={{ width: 16, height: 16, display: "grid", placeItems: "center" }}>{mark}</span>
      <span style={{ flex: 1, textAlign: "left" }}>{children}</span>
    </button>
  );
}

function ProviderStack() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <ProviderButton provider="google">Continue with Google</ProviderButton>
      <ProviderButton provider="github">Continue with GitHub</ProviderButton>
      <ProviderButton provider="microsoft">Continue with Microsoft</ProviderButton>
    </div>
  );
}

/* ---------- Public shell ---------- */
function AuthPublicShell({ children, footer = true, narrow, showSignInLink = true }) {
  return (
    <AuthShell direction="workshop">
      <header style={{
        height: 52, padding: "0 24px", borderBottom: "1px solid var(--border)",
        background: "var(--bg-raised)",
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <EvalLogomark/>
        <div style={{ flex: 1 }} />
        {showSignInLink && (
          <a style={{ fontSize: 13, color: "var(--fg-muted)", textDecoration: "none" }}>Sign in →</a>
        )}
      </header>
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ maxWidth: narrow ? 460 : 1100, margin: "0 auto", padding: "32px 24px" }}>
          {children}
        </div>
      </div>
      {footer && (
        <footer style={{ borderTop: "1px solid var(--border)", padding: "12px 24px", display: "flex", gap: 16, fontSize: 11.5, color: "var(--fg-subtle)", background: "var(--bg-raised)" }}>
          <span>© 2026 Eval</span>
          <a style={{ color: "inherit", textDecoration: "none" }}>Terms</a>
          <a style={{ color: "inherit", textDecoration: "none" }}>Privacy</a>
          <span style={{ flex: 1 }} />
          {/* The hidden email/pw entry. Reachable, not advertised. */}
          <a style={{ color: "inherit", textDecoration: "none" }}>Sign in with email</a>
        </footer>
      )}
    </AuthShell>
  );
}

/* ============================================================
   I · Public landing
   Volume hierarchy:
   1. Returning authed student → auto-redirected to /sections (no screen)
   2. First-time student with a code in hand → THIS PAGE → enter code
   3. Returning unauthed student → THIS PAGE → "Sign in" link (extra click is OK)

   So the page is essentially a single job: type a 6-char code and go.
   No marketing columns, no code-snippet hero — just brand, code input,
   and a quiet sign-in escape hatch.
   ============================================================ */
function PublicLandingI() {
  const codeBoxes = ["A", "B", "C", "1", "2", "3"];
  return (
    <AuthPublicShell>
      <div style={{ maxWidth: 460, margin: "60px auto 0" }}>
        {/* Brand mark + tagline, small */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 8, background: "var(--accent)",
              display: "grid", placeItems: "center",
              fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 22, color: "var(--accent-fg)",
            }}>e</div>
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 30, fontWeight: 400, letterSpacing: -0.6 }}>Eval</span>
          </div>
          <div style={{ fontSize: 14, color: "var(--fg-muted)" }}>A coding classroom for teachers and students.</div>
        </div>

        {/* Join-code card — the only real action on this page */}
        <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 24, boxShadow: "var(--shadow-md)" }}>
          <label htmlFor="join-code" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 4 }}>
            Enter your section join code
          </label>
          <div style={{ fontSize: 12, color: "var(--fg-subtle)", marginBottom: 14 }}>
            Six characters from your teacher.
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center" }}>
            {codeBoxes.map((c, i) => (
              <React.Fragment key={i}>
                <div style={{
                  width: 44, height: 52, borderRadius: "var(--radius)",
                  border: i === 0 ? "2px solid var(--accent)" : "1px solid var(--border)",
                  background: "var(--bg)",
                  display: "grid", placeItems: "center",
                  fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 600,
                  color: i === 0 ? "var(--fg)" : "var(--fg-subtle)",
                }}>{c}</div>
                {i === 2 && <div style={{ width: 10, height: 2, background: "var(--border-strong)", borderRadius: 1 }} />}
              </React.Fragment>
            ))}
          </div>

          <div style={{ marginTop: 18 }}>
            <AuthBtn variant="accent" size="lg" fullWidth icon="arrowR">Join section</AuthBtn>
          </div>
        </div>

        {/* Secondary escape hatches */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8, alignItems: "center", fontSize: 12.5, color: "var(--fg-muted)" }}>
          <div>
            Already on Eval? <a style={{ color: "var(--accent-ink)", cursor: "pointer", fontWeight: 500 }}>Sign in →</a>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--fg-subtle)" }}>
            Invited as an instructor? Check your email for the invitation link.
          </div>
        </div>
      </div>
    </AuthPublicShell>
  );
}

/* ============================================================
   J · Sign in
   - Three OAuth buttons, equal weight, stacked
   - NO email field on this card. The hidden "Sign in with email" link
     lives in the footer (see AuthPublicShell).
   - Small "have a join code?" deflection toward /register/student
   ============================================================ */
function SignInJ() {
  return (
    <AuthPublicShell narrow showSignInLink={false}>
      <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 28, marginTop: 30 }}>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 26, fontWeight: 500, letterSpacing: -0.5, margin: 0 }}>Sign in to Eval</h1>
        <p style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 6 }}>Use the same account you signed up with.</p>

        <div style={{ marginTop: 20 }}>
          <ProviderStack/>
        </div>

        <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border)", fontSize: 12.5, color: "var(--fg-muted)", textAlign: "center" }}>
          Have a section join code? <a style={{ color: "var(--accent-ink)", cursor: "pointer" }}>Join as a student →</a>
        </div>
      </div>
    </AuthPublicShell>
  );
}

/* ---------- J2 · Sign in error variant (OAuth failed) ---------- */
function SignInErrorJ2() {
  return (
    <AuthPublicShell narrow showSignInLink={false}>
      <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 28, marginTop: 30 }}>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 26, fontWeight: 500, letterSpacing: -0.5, margin: 0 }}>Sign in to Eval</h1>

        {/* Error banner — keep the providers visible so retry is one click */}
        <div style={{ marginTop: 14, padding: 12, background: "var(--danger-soft)", border: "1px solid var(--danger-soft)", borderRadius: "var(--radius)", display: "flex", gap: 10, alignItems: "flex-start" }}>
          <AuthIcon name="alert" size={14} />
          <div style={{ fontSize: 12.5, color: "var(--danger)", lineHeight: 1.5 }}>
            <strong>Couldn't reach Google.</strong> The popup was closed before sign-in finished. Try again, or pick a different provider.
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <ProviderStack/>
        </div>

        <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border)", fontSize: 12.5, color: "var(--fg-muted)", textAlign: "center" }}>
          Have a section join code? <a style={{ color: "var(--accent-ink)", cursor: "pointer" }}>Join as a student →</a>
        </div>
      </div>
    </AuthPublicShell>
  );
}

/* ============================================================
   K · Student registration via join code
   - OAuth-only: name/email come from the OAuth profile, not a form
   - Code is locked at top, "Wrong code?" lets you change it
   - Three providers, equal weight
   ============================================================ */
function RegisterStudentK() {
  return (
    <AuthPublicShell narrow showSignInLink={false}>
      <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 28, marginTop: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--accent-ink)" }}>Join code accepted</div>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 26, fontWeight: 500, letterSpacing: -0.5, margin: "8px 0 4px" }}>Joining Period 3 — CS A</h1>
        <p style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 0 }}>Lincoln HS · Mr. Reeves · 22 students enrolled</p>

        {/* Locked code summary */}
        <div style={{ marginTop: 18, padding: 12, background: "var(--bg-sunken)", border: "1px solid var(--border)", borderRadius: "var(--radius)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
          <div>
            <div style={{ color: "var(--fg-subtle)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>Join code</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 600, marginTop: 2 }}>K7M-2A9</div>
          </div>
          <a style={{ fontSize: 12, color: "var(--accent-ink)", cursor: "pointer" }}>Wrong code?</a>
        </div>

        <div style={{ marginTop: 18, fontSize: 13, color: "var(--fg)", fontWeight: 500 }}>Sign in to finish joining</div>
        <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2, marginBottom: 12 }}>Your name and email come from the account you choose.</div>

        <ProviderStack/>

        <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 16, textAlign: "center", lineHeight: 1.5 }}>
          By joining, you agree to the <a style={{ color: "var(--accent-ink)" }}>Terms</a> and <a style={{ color: "var(--accent-ink)" }}>Privacy Policy</a>.
        </div>
      </div>
    </AuthPublicShell>
  );
}

/* ---------- K2 · Invalid join code ---------- */
function RegisterStudentInvalidCodeK2() {
  const codeBoxes = ["X", "X", "X", "9", "9", "9"];
  return (
    <AuthPublicShell narrow showSignInLink={false}>
      <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 28, marginTop: 30 }}>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 500, letterSpacing: -0.4, margin: 0 }}>Enter your join code</h1>
        <p style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 6 }}>Six characters from your teacher.</p>

        <div style={{ marginTop: 18, display: "flex", gap: 6, alignItems: "center" }}>
          {codeBoxes.map((c, i) => (
            <React.Fragment key={i}>
              <div style={{
                width: 38, height: 46, borderRadius: "var(--radius)",
                border: "2px solid var(--danger)", background: "var(--bg)",
                display: "grid", placeItems: "center",
                fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 600, color: "var(--fg)",
              }}>{c}</div>
              {i === 2 && <div style={{ width: 8, height: 2, background: "var(--border-strong)", borderRadius: 1 }} />}
            </React.Fragment>
          ))}
        </div>

        <div style={{ marginTop: 12, padding: 10, background: "var(--danger-soft)", border: "1px solid var(--danger-soft)", borderRadius: "var(--radius)", fontSize: 12.5, color: "var(--danger)", display: "flex", gap: 8, alignItems: "flex-start" }}>
          <AuthIcon name="alert" size={14} />
          <div>
            <strong>That code doesn't exist.</strong> Double-check with your teacher — codes are 3 letters and 3 digits, like <span style={{ fontFamily: "var(--font-mono)" }}>ABC-123</span>.
          </div>
        </div>

        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <AuthBtn variant="quiet">Clear</AuthBtn>
          <AuthBtn variant="accent" icon="arrowR">Try again</AuthBtn>
        </div>
      </div>
    </AuthPublicShell>
  );
}

/* ============================================================
   L · Invitation acceptance (instructor)
   - Token came from email, role + namespace shown
   - Three OAuth buttons (the email match check happens after sign-in)
   - Decline / Accept pair at bottom
   ============================================================ */
function InviteAcceptL() {
  return (
    <AuthPublicShell narrow showSignInLink={false}>
      <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 28, marginTop: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--accent-ink)" }}>You've been invited</div>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 500, letterSpacing: -0.4, margin: "8px 0 4px" }}>Join Lincoln HS · CS as an instructor</h1>
        <p style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 0 }}>Invited by <strong style={{ color: "var(--fg)" }}>Marcus Reeves</strong> · expires in 6 days.</p>

        <div style={{ margin: "18px 0", padding: 14, background: "var(--bg-sunken)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
          <Row label="Namespace" value={<strong>Lincoln HS · CS</strong>} />
          <Row label="Role" value={<strong>Instructor</strong>} />
          <Row label="Invited email" value={<span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>j.chen@lincoln.hs</span>} />
          <Row label="You'll be able to" value="create classes, publish problems, run live sessions" />
          <Row label="You won't be able to" value="invite other instructors or change billing" />
        </div>

        <div style={{ fontSize: 13, color: "var(--fg)", fontWeight: 500 }}>Sign in to accept</div>
        <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2, marginBottom: 12 }}>
          Use the account that matches <span style={{ fontFamily: "var(--font-mono)" }}>j.chen@lincoln.hs</span>.
        </div>

        <ProviderStack/>

        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
          <AuthBtn variant="quiet" fullWidth>Decline invitation</AuthBtn>
        </div>
      </div>
    </AuthPublicShell>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12, gap: 16 }}>
      <span style={{ color: "var(--fg-subtle)" }}>{label}</span>
      <span style={{ textAlign: "right", maxWidth: 260, color: "var(--fg)" }}>{value}</span>
    </div>
  );
}

/* ---------- L2 · Invitation expired / used ---------- */
function InviteExpiredL2() {
  return (
    <AuthPublicShell narrow>
      <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 28, marginTop: 30, textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: 28, background: "var(--warn-soft)", display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
          <AuthIcon name="history" size={24} />
        </div>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 500, letterSpacing: -0.4, margin: 0 }}>This invitation has expired</h1>
        <p style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 8, lineHeight: 1.55 }}>
          Invitations are good for 7 days. Ask <strong style={{ color: "var(--fg)" }}>Marcus Reeves</strong> to send a new one and we'll get you in.
        </p>
        <div style={{ marginTop: 20, padding: 12, background: "var(--bg-sunken)", borderRadius: "var(--radius)", fontSize: 12, textAlign: "left" }}>
          <Row label="Namespace" value={<strong>Lincoln HS · CS</strong>} />
          <Row label="Sent" value="Apr 28, 2026" />
          <Row label="Expired" value={<span style={{ color: "var(--danger)" }}>May 5, 2026</span>} />
        </div>
        <div style={{ marginTop: 18 }}>
          <AuthBtn variant="outline" fullWidth icon="send">Email Marcus to ask for a new invite</AuthBtn>
        </div>
      </div>
    </AuthPublicShell>
  );
}

/* ---------- L3 · Email mismatch (signed in with wrong email) ---------- */
function InviteEmailMismatchL3() {
  return (
    <AuthPublicShell narrow showSignInLink={false}>
      <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 28, marginTop: 30 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ width: 36, height: 36, borderRadius: 18, background: "var(--warn-soft)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <AuthIcon name="alert" size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 500, letterSpacing: -0.3, margin: 0 }}>This invitation is for a different email</h1>
            <p style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 6, lineHeight: 1.55 }}>
              You're signed in as one account, but the invitation was sent to another. Sign out and try with the right account.
            </p>
          </div>
        </div>

        <div style={{ marginTop: 18, padding: 14, background: "var(--bg-sunken)", borderRadius: "var(--radius)", fontSize: 12 }}>
          <Row label="Invitation sent to" value={<span style={{ fontFamily: "var(--font-mono)" }}>j.chen@lincoln.hs</span>} />
          <Row label="You signed in as" value={<span style={{ fontFamily: "var(--font-mono)", color: "var(--danger)" }}>jchen.personal@gmail.com</span>} />
          <Row label="Namespace" value="Lincoln HS · CS" />
        </div>

        <div style={{ marginTop: 18, display: "flex", gap: 8 }}>
          <AuthBtn variant="quiet" fullWidth>Cancel</AuthBtn>
          <AuthBtn variant="accent" fullWidth icon="arrowR">Sign out & retry</AuthBtn>
        </div>
        <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--fg-subtle)", textAlign: "center" }}>
          If you don't have access to <span style={{ fontFamily: "var(--font-mono)" }}>j.chen@lincoln.hs</span>, ask Marcus to re-issue the invitation to a different address.
        </div>
      </div>
    </AuthPublicShell>
  );
}

/* ============================================================
   M · Section join (already-authenticated student adding a section)
   Same shape as before; lives inside the app shell.
   ============================================================ */
function SectionsJoinM() {
  return (
    <window.V4Shell.AppShell role="student" breadcrumb={["My sections", "Join a section"]} right={<window.V4Shell.HeaderRight />}>
      <window.V4Shell.PageHeader title="Join a new section"
        sub="Enter the join code your teacher gave you. You'll keep your existing sections."/>
      <div style={{ padding: 24, maxWidth: 480 }}>
        <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 24 }}>
          <AuthField label="Join code" hint="6 letters and digits, like ABC-123">
            <AuthInput mono placeholder="K7M-2A9" autoFocus />
          </AuthField>

          <div style={{ marginTop: 4, padding: 12, background: "var(--accent-soft)", border: "1px solid var(--accent-soft)", borderRadius: "var(--radius)", fontSize: 12.5, color: "var(--accent-ink)" }}>
            <div style={{ fontWeight: 600 }}>Period 5 — CS A</div>
            <div style={{ color: "var(--fg-muted)", marginTop: 2 }}>Lincoln HS · Mr. Reeves · 22 students</div>
          </div>
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <AuthBtn variant="quiet">Cancel</AuthBtn>
            <AuthBtn variant="accent" icon="arrowR">Join section</AuthBtn>
          </div>
        </div>
      </div>
    </window.V4Shell.AppShell>
  );
}

Object.assign(window, {
  PublicLandingI, SignInJ, SignInErrorJ2,
  RegisterStudentK, RegisterStudentInvalidCodeK2,
  InviteAcceptL, InviteExpiredL2, InviteEmailMismatchL3,
  SectionsJoinM,
});
