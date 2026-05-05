/* Roster with attendance (joined/missing). */
function InstrRoster({ mode = "focused" } = {}) {
  const tabs = [["Activity", true], ["Stuck", false], ["Joined 27/32", false]];
  const students = [
    { name:"Aarav Patel",     state:"run",    detail:"passed · 0.04s" },
    { name:"Bea Lin",         state:"run",    detail:"passed · 0.06s" },
    { name:"Maya Patel",      state:"warn",   detail:"stuck on duplicate · 4m" },
    { name:"Cory Mendes",     state:"run",    detail:"editing — line 6" },
    { name:"Devon Asher",     state:"danger", detail:"syntax error" },
    { name:"Ellis Park",      state:"idle",   detail:"idle 14m" },
    { name:"Farah Idris",     state:"run",    detail:"passed · 0.03s" },
    { name:"Gus Hwang",       state:"warn",   detail:"stuck 2m · 2 runs" },
    { name:"Halle Burroughs", state:"run",    detail:"editing — line 4" },
    { name:"Ivy Tanaka",      state:"missing",detail:"not joined" },
    { name:"Jules Kim",       state:"run",    detail:"editing — line 2" },
    { name:"Kade Oduya",      state:"missing",detail:"not joined" },
  ];
  return (
    <aside style={{ background:"var(--bg-sunken)", borderRight:"1px solid var(--border)", display:"flex", flexDirection:"column", minHeight:0 }}>
      <div style={{ padding:"10px 12px", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontSize:12, fontWeight:600 }}>Class</div>
        <div style={{ display:"flex", gap:4 }}>
          <window.EvalUI.Pill tone="run" dot>14</window.EvalUI.Pill>
          <window.EvalUI.Pill tone="warn" dot>9</window.EvalUI.Pill>
          <window.EvalUI.Pill tone="danger" dot>4</window.EvalUI.Pill>
        </div>
      </div>
      <div style={{ display:"flex", gap:6, padding:"8px 10px", borderBottom:"1px solid var(--border)" }}>
        {tabs.map(([t, a]) => (
          <button key={t} style={{
            height:22, padding:"0 8px", borderRadius:11,
            border:"1px solid " + (a ? "var(--border-strong)" : "transparent"),
            background: a ? "var(--bg-raised)" : "transparent",
            color: a ? "var(--fg)" : "var(--fg-muted)",
            fontSize:11, cursor:"pointer",
          }}>{t}</button>
        ))}
      </div>
      <div style={{ overflow:"auto", flex:1 }}>
        {students.map((s, i) => (
          <window.RosterRow key={s.name} s={s} active={mode === "focused" && i === 2} />
        ))}
      </div>
    </aside>
  );
}
window.InstrRoster = InstrRoster;
