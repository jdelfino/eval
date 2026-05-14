/* Big glanceable class minimap with hover-zoom code peek. */
function ClassMinimap() {
  const [hover, setHover] = React.useState(null);
  return (
    <div style={{ padding:14, borderBottom:"1px solid var(--border)", background:"var(--bg-raised)", position:"relative" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <div style={{ fontSize:11, fontWeight:600, color:"var(--fg-muted)", letterSpacing:0.5, textTransform:"uppercase" }}>Class minimap · live</div>
        <div style={{ display:"flex", gap:6 }}>
          <window.EvalUI.Pill tone="neutral" mono>sort: progress</window.EvalUI.Pill>
          <window.EvalUI.Pill tone="neutral" mono>zoom: hover</window.EvalUI.Pill>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(8, 1fr)", gap:6 }}>
        {Array.from({length:24}).map((_, i) => {
          const status = ["run","run","run","warn","run","danger","idle","run","run","warn","run","run"][i % 12];
          const lines = (i * 7) % 14 + 6;
          return (
            <div key={i}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              style={{
                height: 70, background:"var(--bg-sunken)", border:"1px solid var(--border)",
                borderRadius:4, overflow:"hidden", position:"relative",
                display:"flex", flexDirection:"column", justifyContent:"flex-end", padding:4, cursor:"pointer",
                outline: hover === i ? "2px solid var(--accent)" : "none",
              }}>
              {Array.from({length: lines}).map((_, j) => (
                <div key={j} style={{
                  height:2, marginBottom:2, width:`${30 + ((i*j) % 60)}%`,
                  background:"var(--fg-subtle)", opacity:0.5,
                }}/>
              ))}
              <div style={{ position:"absolute", top:5, right:5, width:6, height:6, borderRadius:3,
                background: status === "idle" ? "var(--fg-subtle)" : `var(--${status})`}}/>
              <div style={{ position:"absolute", top:5, left:6, fontFamily:"var(--font-mono)", fontSize:9, color:"var(--fg-subtle)" }}>{i+1}</div>
            </div>
          );
        })}
      </div>
      {hover !== null && <window.MinimapPeek idx={hover}/>}
    </div>
  );
}
window.ClassMinimap = ClassMinimap;
