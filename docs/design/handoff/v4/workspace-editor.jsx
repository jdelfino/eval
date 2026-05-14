/* Workspace Editor Pane — dark editor surface with one or more tabs.
   Used by all three skins. The shell never changes; the only difference
   between skins is which tabs are present and whether they are editable. */

function WSEditorPane({
  tabs,                 // [{id, label, kind:"code"|"markdown", language?, lines?, body?, dark?}]
  activeId,
  onSelect,
  highlight,            // line to highlight (debug)
  breakpoints = [],     // [lineNumber, ...]
  rightControls,        // optional inline chrome on the tabstrip (e.g. md edit/preview)
  footnote,             // small chip at bottom-right of editor (file path, etc.)
}) {
  const tab = tabs.find(t => t.id === activeId) || tabs[0];
  const isMarkdown = tab.kind === "markdown";
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0,
                  background: tab.dark === false ? "var(--bg)" : "var(--bg-inverse)",
                  color: tab.dark === false ? "var(--fg)" : "var(--fg-inverse)" }}>
      {/* Tab strip */}
      <div style={{ display:"flex", alignItems:"stretch",
                    borderBottom: `1px solid ${tab.dark === false ? "var(--border)" : "var(--border-inverse)"}`,
                    background: tab.dark === false ? "var(--bg-sunken)" : "var(--bg-inverse-raised)",
                    minHeight:32 }}>
        {tabs.map(t => {
          const active = t.id === tab.id;
          const dk = t.dark !== false;
          return (
            <button
              key={t.id}
              onClick={() => onSelect?.(t.id)}
              style={{
                display:"inline-flex", alignItems:"center", gap:6,
                padding:"0 12px", height:32,
                background: active ? (dk ? "var(--bg-inverse)" : "var(--bg)") : "transparent",
                border:"none",
                borderRight: `1px solid ${dk ? "var(--border-inverse)" : "var(--border)"}`,
                color: active
                  ? (dk ? "var(--fg-inverse)" : "var(--fg)")
                  : (dk ? "var(--fg-inverse-muted)" : "var(--fg-muted)"),
                fontFamily:"var(--font-mono)", fontSize:11.5,
                fontWeight: active ? 600 : 500,
                cursor:"pointer",
                position:"relative",
              }}
            >
              {t.icon && <span style={{ opacity:0.75 }}>{t.icon}</span>}
              {t.label}
              {t.dirty && <span style={{ width:5, height:5, borderRadius:3, background:"var(--accent)" }} />}
              {active && (
                <span style={{ position:"absolute", left:0, right:0, top:-1, height:2, background:"var(--accent)" }} />
              )}
            </button>
          );
        })}
        <div style={{ flex:1 }} />
        {rightControls && (
          <div style={{ display:"flex", alignItems:"center", gap:6, padding:"0 8px" }}>
            {rightControls}
          </div>
        )}
      </div>
      {/* Body */}
      <div style={{ flex:1, display:"flex", overflow:"hidden", position:"relative" }}>
        {isMarkdown
          ? <WSMarkdownBody body={tab.body} preview={tab.preview} dark={tab.dark !== false} />
          : <WSCodeBody lines={tab.lines} highlight={highlight} breakpoints={breakpoints} dark={tab.dark !== false} />}
        {footnote && (
          <div style={{
            position:"absolute", right:10, bottom:8,
            display:"flex", alignItems:"center", gap:6,
            padding:"3px 8px", borderRadius:9,
            background:"color-mix(in oklch, var(--bg-inverse) 80%, transparent)",
            border:"1px solid var(--border-inverse)",
            color:"var(--fg-inverse-muted)",
            fontFamily:"var(--font-mono)", fontSize:10.5,
          }}>{footnote}</div>
        )}
      </div>
    </div>
  );
}

function WSCodeBody({ lines, highlight, breakpoints = [], dark = true }) {
  const fg     = dark ? "var(--fg-inverse)" : "var(--fg)";
  const muted  = dark ? "var(--fg-inverse-muted)" : "var(--fg-muted)";
  const border = dark ? "var(--border-inverse)" : "var(--border)";
  return (
    <div style={{ flex:1, display:"flex", overflow:"auto", fontFamily:"var(--font-mono)", fontSize:13, lineHeight:1.7, color:fg }}>
      <div style={{ padding:"10px 8px 10px 12px", color:muted, textAlign:"right",
                    borderRight:`1px solid ${border}`, minWidth:36, userSelect:"none", position:"relative" }}>
        {lines.map((_, i) => {
          const ln = i + 1;
          const bp = breakpoints.includes(ln);
          return (
            <div key={i} style={{ position:"relative",
                                  color: highlight === ln ? "var(--accent)" : (bp ? "var(--danger)" : muted),
                                  fontWeight: (highlight === ln || bp) ? 700 : 400 }}>
              {bp && <span style={{ position:"absolute", left:-2, top:6, width:8, height:8, borderRadius:4, background:"var(--danger)" }} />}
              {ln}
            </div>
          );
        })}
      </div>
      <pre style={{ flex:1, margin:0, padding:"10px 14px", whiteSpace:"pre", position:"relative" }}>
        {highlight && (
          <div style={{
            position:"absolute", left:0, right:0,
            top:`calc(10px + ${highlight - 1} * 1.7em)`, height:"1.7em",
            background:"color-mix(in oklch, var(--accent) 14%, transparent)",
            borderLeft:"2px solid var(--accent)",
          }} />
        )}
        {lines.join("\n")}
      </pre>
    </div>
  );
}

function WSMarkdownBody({ body, preview, dark }) {
  if (preview) {
    return (
      <div style={{ flex:1, overflow:"auto", padding:"20px 28px",
                    background: dark ? "var(--bg-inverse)" : "var(--bg)",
                    color: dark ? "var(--fg-inverse)" : "var(--fg)" }}>
        <WSMarkdownRender body={body} dark={dark} />
      </div>
    );
  }
  return (
    <div style={{ flex:1, display:"flex", overflow:"auto", fontFamily:"var(--font-mono)", fontSize:13, lineHeight:1.7,
                  color: dark ? "var(--fg-inverse)" : "var(--fg)" }}>
      <div style={{ padding:"10px 8px 10px 12px",
                    color: dark ? "var(--fg-inverse-muted)" : "var(--fg-muted)",
                    textAlign:"right",
                    borderRight: `1px solid ${dark ? "var(--border-inverse)" : "var(--border)"}`,
                    minWidth:36, userSelect:"none" }}>
        {body.split("\n").map((_, i) => <div key={i}>{i + 1}</div>)}
      </div>
      <pre style={{ flex:1, margin:0, padding:"10px 14px", whiteSpace:"pre-wrap" }}>{body}</pre>
    </div>
  );
}

function WSMarkdownRender({ body, dark }) {
  // Tiny markdown renderer for preview — handles paragraphs, **bold**, `code`,
  // indented code blocks, bullets. Not for production, just a faithful preview.
  const blocks = [];
  const lines = body.split("\n");
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    if (ln.startsWith("    ")) {
      const buf = [];
      while (i < lines.length && (lines[i].startsWith("    ") || lines[i] === "")) {
        buf.push(lines[i].replace(/^ {4}/, ""));
        i++;
      }
      while (buf.length && buf[buf.length-1] === "") buf.pop();
      blocks.push({ kind:"code", text: buf.join("\n") });
    } else if (ln.startsWith("**") && ln.endsWith("**") && ln.length > 4) {
      blocks.push({ kind:"h", text: ln.slice(2, -2) });
      i++;
    } else if (ln === "") {
      i++;
    } else {
      const buf = [ln];
      i++;
      while (i < lines.length && lines[i] !== "" && !lines[i].startsWith("    ")) {
        buf.push(lines[i]); i++;
      }
      blocks.push({ kind:"p", text: buf.join(" ") });
    }
  }
  const inline = (s) => {
    const parts = s.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    return parts.map((p, i) => {
      if (p.startsWith("`")) return <code key={i} style={{ fontFamily:"var(--font-mono)", background: dark ? "var(--bg-inverse-raised)" : "var(--bg-sunken)", padding:"1px 5px", borderRadius:3, fontSize:"0.92em" }}>{p.slice(1,-1)}</code>;
      if (p.startsWith("**")) return <strong key={i}>{p.slice(2,-2)}</strong>;
      return <React.Fragment key={i}>{p}</React.Fragment>;
    });
  };
  return (
    <div style={{ maxWidth: 720, fontSize:13.5, lineHeight:1.65 }}>
      {blocks.map((b, idx) => {
        if (b.kind === "h") return <div key={idx} style={{ fontWeight:700, fontSize:13, marginTop: idx === 0 ? 0 : 16, marginBottom:6, letterSpacing:0.2 }}>{b.text}</div>;
        if (b.kind === "code") return (
          <pre key={idx} style={{ margin:"10px 0", padding:"10px 12px", background: dark ? "var(--bg-inverse-raised)" : "var(--bg-sunken)", borderRadius:6, fontFamily:"var(--font-mono)", fontSize:12, lineHeight:1.55, whiteSpace:"pre", overflowX:"auto" }}>{b.text}</pre>
        );
        return <p key={idx} style={{ margin:"0 0 10px 0" }}>{inline(b.text)}</p>;
      })}
    </div>
  );
}

window.WSEditorPane = WSEditorPane;
window.WSMarkdownRender = WSMarkdownRender;
window.WSCodeBody = WSCodeBody;
