function MinimapPeek({ idx }) {
  return (
    <div style={{
      position:"absolute", right:14, bottom:14, width:280,
      background:"var(--bg-inverse)", color:"var(--fg-inverse)",
      borderRadius:"var(--radius)", boxShadow:"var(--shadow-lg)",
      padding:10, fontFamily:"var(--font-mono)", fontSize:11.5, lineHeight:1.6,
      pointerEvents:"none", zIndex:5,
    }}>
      <div style={{ color:"var(--fg-inverse-muted)", fontSize:10, marginBottom:4 }}>student {idx+1} · live preview</div>
      <pre style={{ margin:0, whiteSpace:"pre" }}>
{`def two_sum(nums, target):
  for i in range(len(nums)):
    for j in range(len(nums)):
      if nums[i] + nums[j] == target:
        return [i, j]
`}
      </pre>
    </div>
  );
}
window.MinimapPeek = MinimapPeek;
