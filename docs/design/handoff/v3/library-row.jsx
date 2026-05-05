function LibRow({ p, activeTags, last }) {
  return (
    <div style={{
      display:"grid", gridTemplateColumns:"32px 1.4fr 1.6fr 90px 110px 130px 110px",
      padding:"10px 12px", borderBottom: last ? "none" : "1px solid var(--border)",
      alignItems:"center", fontSize:13,
    }}>
      <span style={{ width:6, height:6, borderRadius:3, background: p.draft ? "var(--warn)" : "var(--run)" }}/>
      <span style={{ fontWeight:500, fontFamily:"var(--font-serif)", fontSize:14 }}>{p.title}</span>
      <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
        {p.tags.map(t => (
          <span key={t} style={{
            padding:"2px 7px", borderRadius:10,
            background: activeTags.has(t) ? "var(--accent-soft)" : "var(--bg-sunken)",
            color: activeTags.has(t) ? "var(--accent-ink)" : "var(--fg-muted)",
            border:"1px solid " + (activeTags.has(t) ? "var(--accent-soft)" : "var(--border)"),
            fontSize:10.5, fontFamily:"var(--font-mono)",
          }}>#{t}</span>
        ))}
      </div>
      <window.EvalUI.Pill tone={p.diff === "Easy" ? "run" : p.diff === "Medium" ? "warn" : "danger"}>{p.diff}</window.EvalUI.Pill>
      <span style={{ fontFamily:"var(--font-mono)", fontSize:11.5, color:"var(--fg-muted)" }}>{p.tests}</span>
      <span style={{ fontFamily:"var(--font-mono)", fontSize:11.5, color:"var(--fg-muted)" }}>{p.last}</span>
      <div style={{ display:"flex", gap:6, justifyContent:"flex-end" }}>
        <window.EvalUI.Btn variant="quiet" size="sm">Edit</window.EvalUI.Btn>
        <window.EvalUI.Btn variant="accent" size="sm">Start</window.EvalUI.Btn>
      </div>
    </div>
  );
}
window.LibRow = LibRow;
