/* Tag bar — the headline filter. Counts shown next to each. */
function LibTagBar({ activeTags, onToggle }) {
  const tags = [
    ["hashing", 6], ["arrays", 9], ["strings", 7], ["recursion", 5],
    ["two-pointers", 4], ["dp", 6], ["graphs", 3], ["stacks", 3],
    ["pointers", 2], ["matching", 1], ["i/o", 4], ["files", 2],
  ];
  return (
    <div style={{
      padding:"12px 16px", borderBottom:"1px solid var(--border)",
      background:"var(--bg-raised)", display:"flex", flexWrap:"wrap", gap:6, alignItems:"center",
    }}>
      <span style={{ fontSize:11, fontWeight:600, color:"var(--fg-muted)", letterSpacing:0.5, textTransform:"uppercase", marginRight:6 }}>Tags</span>
      {tags.map(([t, n]) => {
        const active = activeTags.has(t);
        return (
          <button key={t} onClick={() => onToggle(t)} style={{
            display:"inline-flex", alignItems:"center", gap:6,
            padding:"3px 9px", borderRadius:14, height:24,
            background: active ? "var(--accent)" : "var(--bg-sunken)",
            color: active ? "var(--accent-fg)" : "var(--fg)",
            border:"1px solid " + (active ? "var(--accent)" : "var(--border)"),
            fontSize:12, fontFamily:"var(--font-mono)", cursor:"pointer",
          }}>
            #{t}
            <span style={{ fontSize:10, opacity:0.7 }}>{n}</span>
          </button>
        );
      })}
      {activeTags.size > 0 && (
        <button onClick={() => activeTags.forEach(t => onToggle(t))} style={{
          marginLeft:6, fontSize:11, color:"var(--fg-subtle)", background:"transparent", border:"none", cursor:"pointer",
        }}>clear</button>
      )}
    </div>
  );
}
window.LibTagBar = LibTagBar;
