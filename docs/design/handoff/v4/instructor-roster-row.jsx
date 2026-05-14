function RosterRow({ s, active }) {
  const colorMap = { run:"var(--run)", warn:"var(--warn)", danger:"var(--danger)", idle:"var(--fg-subtle)", missing:"var(--border-strong)" };
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:10, padding:"8px 12px",
      borderLeft:"2px solid " + (active ? "var(--accent)" : "transparent"),
      background: active ? "var(--bg-raised)" : "transparent",
      cursor:"pointer",
      opacity: s.state === "missing" ? 0.55 : 1,
    }}>
      <span style={{ width:6, height:6, borderRadius:3, background: colorMap[s.state] }} />
      <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
        <span style={{ fontSize:13, fontWeight: active ? 600 : 500 }}>{s.name}</span>
        <span style={{ fontSize:11, color:"var(--fg-muted)", fontFamily:"var(--font-mono)" }}>{s.detail}</span>
      </div>
    </div>
  );
}
window.RosterRow = RosterRow;
