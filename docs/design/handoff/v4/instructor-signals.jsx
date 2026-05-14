/* Right pane: signals + clickable bug clusters. */
function InstrSignals() {
  const [openCluster, setOpenCluster] = React.useState(0);
  const clusters = [
    ["O(n²) double loop, same index", 7, ["Jamie Dawson","Devon Asher","Cory Mendes","Halle Burroughs","Bea Lin","Aarav Patel","Jules Kim"]],
    ["off-by-one on enumerate", 3, ["Gus Hwang","Ellis Park","Farah Idris"]],
    ["forgot return []", 2, ["Kade Oduya","Ivy Tanaka"]],
  ];
  return (
    <aside style={{ background:"var(--bg-sunken)", borderLeft:"1px solid var(--border)", padding:14, display:"flex", flexDirection:"column", gap:12, overflow:"auto" }}>
      <div style={{ fontSize:11, fontWeight:600, color:"var(--fg-muted)", letterSpacing:0.5, textTransform:"uppercase" }}>Class signal</div>
      <window.SigCard label="Stuck > 3min" value="4" trend="+2" tone="warn"/>
      <window.SigCard label="Joined" value="27 / 32" trend=""/>
      <div style={{ height:1, background:"var(--border)" }}/>
      <div style={{ fontSize:11, fontWeight:600, color:"var(--fg-muted)", letterSpacing:0.5, textTransform:"uppercase" }}>Common bugs · click to focus</div>
      {clusters.map(([t, n, who], i) => (
        <window.BugCluster key={t} title={t} n={n} who={who} open={openCluster === i} onClick={() => setOpenCluster(i)}/>
      ))}
      <window.EvalUI.Btn variant="accent" size="sm">Discuss as class</window.EvalUI.Btn>
    </aside>
  );
}
window.InstrSignals = InstrSignals;
