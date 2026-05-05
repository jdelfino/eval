/* Problem library — tags first-class. Tag chips are the primary filter UI. */
function ProblemLibrary() {
  const { ScreenShell, AppBar, Btn, Pill, Kbd } = window.EvalUI;
  const [activeTags, setActiveTags] = React.useState(new Set(["hashing"]));
  const toggle = t => {
    const n = new Set(activeTags);
    n.has(t) ? n.delete(t) : n.add(t);
    setActiveTags(n);
  };
  return (
    <ScreenShell direction="workshop">
      <AppBar direction="workshop" breadcrumb={["CS 61A · Spring", "Problem library"]} right={<>
        <Btn variant="quiet" size="sm">Import</Btn>
        <Btn variant="accent" size="sm">+ New problem</Btn>
      </>}/>
      <window.LibTagBar activeTags={activeTags} onToggle={toggle}/>
      <window.LibToolbar/>
      <window.LibTable activeTags={activeTags}/>
    </ScreenShell>
  );
}
window.ProblemLibrary = ProblemLibrary;
