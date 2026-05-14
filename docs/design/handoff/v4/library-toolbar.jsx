function LibToolbar() {
  return (
    <div style={{ padding:"10px 16px", display:"flex", gap:8, alignItems:"center", borderBottom:"1px solid var(--border)" }}>
      <div style={{ flex:1, display:"flex", alignItems:"center", gap:8, padding:"0 10px", height:30, background:"var(--bg-raised)", border:"1px solid var(--border)", borderRadius:"var(--radius)" }}>
        <span style={{ color:"var(--fg-subtle)" }}>⌕</span>
        <input placeholder="Search problems · author, title, code" style={{ flex:1, background:"transparent", border:"none", outline:"none", color:"var(--fg)", fontSize:13 }}/>
        <window.EvalUI.Kbd>⌘K</window.EvalUI.Kbd>
      </div>
      <window.EvalUI.Pill tone="neutral" mono>sort: updated</window.EvalUI.Pill>
      <window.EvalUI.Pill tone="neutral" mono>group by tag</window.EvalUI.Pill>
    </div>
  );
}
window.LibToolbar = LibToolbar;
