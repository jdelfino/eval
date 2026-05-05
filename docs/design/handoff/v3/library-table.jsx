function LibTable({ activeTags }) {
  const rows = [
    { title:"Two Sum", diff:"Easy", lang:"python", tags:["hashing","arrays"], tests:"3 fn · 1 hidden", last:"5m ago" },
    { title:"Word Count", diff:"Easy", lang:"python", tags:["i/o","strings","files"], tests:"4 i/o · 2 pytest", last:"2h ago" },
    { title:"Valid Parentheses", diff:"Easy", lang:"python", tags:["stacks","strings"], tests:"5 fn", last:"yesterday" },
    { title:"Reverse a Linked List", diff:"Medium", lang:"python", tags:["pointers","recursion"], tests:"4 fn", last:"yesterday" },
    { title:"Coin Change", diff:"Medium", lang:"python", tags:["dp"], tests:"draft", last:"3d ago", draft:true },
    { title:"Sort a Log File", diff:"Medium", lang:"python", tags:["files","i/o"], tests:"3 file · 2 i/o", last:"1w ago" },
    { title:"Stable Marriage", diff:"Hard", lang:"python", tags:["graphs","matching"], tests:"draft", last:"draft", draft:true },
  ];
  return (
    <div style={{ flex:1, overflow:"auto", padding:"0 16px 16px" }}>
      <div style={{ display:"flex", flexDirection:"column", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", overflow:"hidden", background:"var(--bg-raised)" }}>
        <div style={{ display:"grid", gridTemplateColumns:"32px 1.4fr 1.6fr 90px 110px 130px 110px", padding:"8px 12px", background:"var(--bg-sunken)", borderBottom:"1px solid var(--border)", fontSize:10.5, fontWeight:600, color:"var(--fg-muted)", letterSpacing:0.5, textTransform:"uppercase" }}>
          <span/><span>Title</span><span>Tags</span><span>Difficulty</span><span>Tests</span><span>Last run</span><span style={{ textAlign:"right" }}>Actions</span>
        </div>
        {rows.map((p, i) => <window.LibRow key={p.title} p={p} activeTags={activeTags} last={i === rows.length - 1}/>)}
      </div>
    </div>
  );
}
window.LibTable = LibTable;
