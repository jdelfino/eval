function SigCard({ label, value, trend, tone="neutral" }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", padding:"8px 10px", background:"var(--bg-raised)", border:"1px solid var(--border)", borderRadius:"var(--radius)" }}>
      <span style={{ fontSize:12, color:"var(--fg-muted)" }}>{label}</span>
      <div style={{ display:"flex", gap:8, alignItems:"baseline" }}>
        <span style={{ fontFamily:"var(--font-mono)", fontSize:14, fontWeight:600, color: tone === "warn" ? "var(--warn)" : "var(--fg)" }}>{value}</span>
        {trend && <span style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--fg-subtle)" }}>{trend}</span>}
      </div>
    </div>
  );
}
window.SigCard = SigCard;

function BugCluster({ title, n, who, open, onClick }) {
  return (
    <div onClick={onClick} style={{
      padding:"8px 10px", background:"var(--bg-raised)",
      border:"1px solid " + (open ? "var(--accent)" : "var(--border)"),
      borderRadius:"var(--radius)", fontSize:12, cursor:"pointer",
      display:"flex", flexDirection:"column", gap: open ? 8 : 0,
    }}>
      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <span style={{ color:"var(--fg)" }}>{title}</span>
        <window.EvalUI.Pill tone={open ? "accent" : "warn"}>{n}</window.EvalUI.Pill>
      </div>
      {open && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
          {who.map(w => (
            <span key={w} style={{ fontSize:10.5, padding:"2px 6px", background:"var(--bg-sunken)", border:"1px solid var(--border)", borderRadius:9, color:"var(--fg-muted)" }}>{w}</span>
          ))}
        </div>
      )}
    </div>
  );
}
window.BugCluster = BugCluster;
