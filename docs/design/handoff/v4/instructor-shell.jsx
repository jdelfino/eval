/* Instructor live session — dashboard.
   Two states:
     - mode="overview": no student selected, focus prompt panel
     - mode="focused" : student selected, embedded workspace shell in center
*/

function InstructorLive({ mode = "focused" } = {}) {
  const { ScreenShell, AppBar, Btn, Pill, Kbd } = window.EvalUI;
  return (
    <ScreenShell direction="workshop">
      <AppBar
        direction="workshop"
        breadcrumb={["CS 61A · Spring", "Section 03", "Two Sum · live"]}
        right={<>
          <Pill tone="info" dot>live</Pill>
          <Pill tone="neutral" mono>code · 9F4K2</Pill>
          <Btn variant="danger" size="sm">End session</Btn>
        </>}
      />
      <div style={{ flex:1, display:"grid", gridTemplateColumns:"260px 1fr 320px", minHeight:0 }}>
        <window.InstrRoster mode={mode}/>
        <window.InstrCenter mode={mode}/>
        <window.InstrSignals/>
      </div>
    </ScreenShell>
  );
}
window.InstructorLive = InstructorLive;
function InstructorLiveOverview() { return <InstructorLive mode="overview"/>; }
window.InstructorLiveOverview = InstructorLiveOverview;
