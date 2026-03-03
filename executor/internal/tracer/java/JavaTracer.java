import com.sun.jdi.*;
import com.sun.jdi.connect.*;
import com.sun.jdi.event.*;
import com.sun.jdi.request.*;

import javax.tools.*;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;

/**
 * Java JDI tracer for step-through debugging of student code.
 *
 * Accepts student code, stdin, and max_steps as command-line arguments.
 * Outputs a JSON trace matching the executor's TraceResponse format to stdout.
 *
 * Usage:
 *   java JavaTracer <student_code> <stdin> <max_steps>
 *
 * Output JSON structure:
 * {
 *   "steps": [
 *     {
 *       "line": 1,
 *       "event": "line",
 *       "locals": {"x": 5},
 *       "globals": {},
 *       "call_stack": [{"function_name": "main", "filename": "<student code>", "line": 1}],
 *       "stdout": ""
 *     }
 *   ],
 *   "total_steps": 1,
 *   "exit_code": 0,
 *   "error": "",
 *   "truncated": false
 * }
 */
public class JavaTracer {
    // Maximum length for string variable values before truncation.
    private static final int MAX_VAR_LENGTH = 1000;
    // Maximum number of collection items to include before truncation.
    private static final int MAX_COLLECTION_SIZE = 10;
    // Default maximum steps if not provided.
    private static final int DEFAULT_MAX_STEPS = 5000;

    // Class filter patterns — exclude JDK internals from step events.
    private static final String[] CLASS_EXCLUSIONS = {
        "java.*", "javax.*", "sun.*", "jdk.*", "com.sun.*"
    };

    public static void main(String[] args) {
        if (args.length < 1) {
            System.out.println(errorResponse("No code provided", 1));
            System.exit(1);
        }

        String studentCode = args[0];
        String stdinData   = args.length > 1 ? args[1] : "";
        int maxSteps       = DEFAULT_MAX_STEPS;
        if (args.length > 2) {
            try {
                maxSteps = Integer.parseInt(args[2]);
            } catch (NumberFormatException e) {
                maxSteps = DEFAULT_MAX_STEPS;
            }
        }

        new JavaTracer().run(studentCode, stdinData, maxSteps);
    }

    void run(String studentCode, String stdinData, int maxSteps) {
        Path tempDir = null;
        VirtualMachine vm = null;
        try {
            tempDir = Files.createTempDirectory("javatracer-");

            // 1. Determine class name from student code.
            String className = extractClassName(studentCode);

            // 2. Write source to a temp file.
            Path sourceFile = tempDir.resolve(className + ".java");
            Files.writeString(sourceFile, studentCode);

            // 3. Compile the student code with full debug info (-g).
            String compileError = compile(sourceFile, tempDir);
            if (compileError != null) {
                System.out.println(errorResponse(compileError, 1));
                return;
            }

            // 4. Launch the debuggee VM and set stdin.
            vm = launchVM(className, tempDir.toString(), stdinData);

            // 5. Configure event requests.
            EventRequestManager erm = vm.eventRequestManager();
            configureClassPrepareRequest(erm, className);

            // 6. Run event loop.
            TraceResult result = eventLoop(vm, maxSteps);

            // 7. Print JSON output.
            System.out.println(buildTraceResponse(result));

        } catch (Exception e) {
            System.out.println(errorResponse("Internal tracer error: " + e.getMessage(), 1));
        } finally {
            if (vm != null) {
                try { vm.exit(0); } catch (Exception ignored) {}
            }
            if (tempDir != null) {
                deleteDirectory(tempDir.toFile());
            }
        }
    }

    /** Extract the public class name from student code, defaulting to "Main". */
    static String extractClassName(String code) {
        Pattern p = Pattern.compile("public\\s+class\\s+(\\w+)");
        Matcher m = p.matcher(code);
        if (m.find()) {
            return m.group(1);
        }
        return "Main";
    }

    /**
     * Compile the source file using javax.tools.JavaCompiler.
     * Returns null on success, or the error message on failure.
     */
    private String compile(Path sourceFile, Path outputDir) {
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) {
            return "Java compiler not available (JDK required, not JRE)";
        }

        DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
        try (StandardJavaFileManager fileManager =
                compiler.getStandardFileManager(diagnostics, null, null)) {

            Iterable<? extends JavaFileObject> units =
                fileManager.getJavaFileObjects(sourceFile.toFile());

            // -g generates full debug info (line numbers + local variables).
            List<String> options = Arrays.asList("-d", outputDir.toString(), "-g");
            JavaCompiler.CompilationTask task =
                compiler.getTask(null, fileManager, diagnostics, options, null, units);

            boolean success = task.call();
            if (!success) {
                StringBuilder sb = new StringBuilder();
                for (Diagnostic<? extends JavaFileObject> d : diagnostics.getDiagnostics()) {
                    if (d.getKind() == Diagnostic.Kind.ERROR) {
                        sb.append(d.getMessage(null));
                        sb.append('\n');
                    }
                }
                return sb.toString().trim();
            }
        } catch (IOException e) {
            return "Compilation I/O error: " + e.getMessage();
        }
        return null;
    }

    /**
     * Launch the debuggee VM via JDI LaunchingConnector.
     * Sets up stdin from the provided stdinData string.
     */
    private VirtualMachine launchVM(String className, String classpath, String stdinData)
            throws com.sun.jdi.connect.IllegalConnectorArgumentsException,
                   VMStartException, IOException {

        LaunchingConnector connector =
            Bootstrap.virtualMachineManager().defaultConnector();
        Map<String, Connector.Argument> connArgs = connector.defaultArguments();

        connArgs.get("main").setValue(className);
        connArgs.get("options").setValue("-cp " + classpath);

        // Suspend = true so we can configure event requests before the VM runs.
        connArgs.get("suspend").setValue("true");

        VirtualMachine vm = connector.launch(connArgs);

        // Feed stdin to the debuggee process.
        if (stdinData != null && !stdinData.isEmpty()) {
            OutputStream vmStdin = vm.process().getOutputStream();
            vmStdin.write(stdinData.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            vmStdin.close();
        } else {
            // Close stdin immediately so any Scanner-based code doesn't hang.
            vm.process().getOutputStream().close();
        }

        return vm;
    }

    /** Configure a ClassPrepareRequest to get notified when user class loads. */
    private void configureClassPrepareRequest(EventRequestManager erm, String className) {
        ClassPrepareRequest cpr = erm.createClassPrepareRequest();
        cpr.addClassFilter(className);
        cpr.setSuspendPolicy(EventRequest.SUSPEND_ALL);
        cpr.enable();
    }

    /** Container for trace results accumulated during the event loop. */
    static class TraceResult {
        List<StepData> steps = new ArrayList<>();
        int exitCode = 0;
        String error = "";
        boolean truncated = false;
    }

    /** Data for a single trace step. */
    static class StepData {
        int line;
        String event = "line";
        Map<String, Object> locals = new LinkedHashMap<>();
        Map<String, Object> globals = new LinkedHashMap<>();
        List<CallFrameData> callStack = new ArrayList<>();
        String stdout = "";
    }

    /** Data for a call stack frame. */
    static class CallFrameData {
        String functionName;
        String filename;
        int line;
    }

    /**
     * Main JDI event loop.
     * Processes events until VMDeath/VMDisconnect or max_steps is reached.
     */
    private TraceResult eventLoop(VirtualMachine vm, int maxSteps) {
        TraceResult result = new TraceResult();
        EventQueue queue = vm.eventQueue();

        // Buffer to accumulate stdout from debuggee.
        StringBuilder stdoutBuffer = new StringBuilder();
        // Buffer to accumulate stderr from debuggee.
        StringBuilder stderrBuffer = new StringBuilder();

        // Background thread to drain the debuggee's stdout.
        InputStream debuggeeStdout = vm.process().getInputStream();
        Thread stdoutReader = new Thread(() -> {
            byte[] buf = new byte[4096];
            try {
                int n;
                while ((n = debuggeeStdout.read(buf)) != -1) {
                    synchronized (stdoutBuffer) {
                        stdoutBuffer.append(new String(buf, 0, n, java.nio.charset.StandardCharsets.UTF_8));
                    }
                }
            } catch (IOException ignored) {}
        });
        stdoutReader.setDaemon(true);
        stdoutReader.start();

        // Background thread to drain stderr to avoid blocking the VM on stderr writes.
        InputStream debuggeeStderr = vm.process().getErrorStream();
        Thread stderrReader = new Thread(() -> {
            byte[] buf = new byte[4096];
            try {
                int n;
                while ((n = debuggeeStderr.read(buf)) != -1) {
                    synchronized (stderrBuffer) {
                        stderrBuffer.append(new String(buf, 0, n, java.nio.charset.StandardCharsets.UTF_8));
                    }
                }
            } catch (IOException ignored) {}
        });
        stderrReader.setDaemon(true);
        stderrReader.start();

        // Track whether we have a step request active.
        StepRequest currentStepRequest = null;
        ThreadReference stepThread = null;

        // Process the initial VMStartEvent before entering the main loop.
        // The VM was launched with suspend=true, so it's suspended at start.
        // We must consume the VMStartEvent and resume the VM to proceed.
        try {
            EventSet startSet = queue.remove(10000);
            if (startSet != null) {
                startSet.resume();
            }
        } catch (InterruptedException | VMDisconnectedException e) {
            return result;
        }

        boolean connected = true;
        while (connected) {
            EventSet eventSet;
            try {
                eventSet = queue.remove(5000); // 5 second timeout
                if (eventSet == null) {
                    // Timed out waiting for events — VM may have exited.
                    break;
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            } catch (VMDisconnectedException e) {
                break;
            }

            for (Event event : eventSet) {
                if (event instanceof ClassPrepareEvent) {
                    ClassPrepareEvent cpe = (ClassPrepareEvent) event;
                    // The student class just loaded — set a breakpoint at the first
                    // executable line of main() so the VM stops inside student code.
                    // Using a StepRequest from ClassPrepareEvent doesn't work reliably
                    // in JDK 21+ because the VM may finish executing before the step
                    // event fires (the class exclusion filters suppress all internal
                    // JDK steps, and the VM completes before reaching student code).
                    stepThread = cpe.thread();
                    ReferenceType refType = cpe.referenceType();
                    try {
                        // Find the main method's first executable line for the breakpoint.
                        // Using allLineLocations() on the class would include the class
                        // declaration line which is not executable and won't trigger a breakpoint.
                        List<Method> mainMethods = refType.methodsByName("main");
                        if (!mainMethods.isEmpty()) {
                            List<Location> locs = mainMethods.get(0).allLineLocations();
                            if (!locs.isEmpty()) {
                                BreakpointRequest bp = vm.eventRequestManager().createBreakpointRequest(locs.get(0));
                                bp.setSuspendPolicy(EventRequest.SUSPEND_ALL);
                                bp.enable();
                            }
                        } else {
                            currentStepRequest = createStepRequest(vm.eventRequestManager(), stepThread);
                        }
                    } catch (AbsentInformationException e1) {
                        // No debug info — fall back to step request.
                        currentStepRequest = createStepRequest(vm.eventRequestManager(), stepThread);
                    }

                } else if (event instanceof BreakpointEvent) {
                    BreakpointEvent be = (BreakpointEvent) event;
                    // Hit the entry breakpoint — delete it and switch to stepping.
                    vm.eventRequestManager().deleteEventRequest(be.request());
                    stepThread = be.thread();

                    // Record this breakpoint location as the first step.
                    String currentStdout;
                    synchronized (stdoutBuffer) {
                        currentStdout = stdoutBuffer.toString();
                    }
                    StepData step = buildStep(be, currentStdout);
                    result.steps.add(step);

                    // Create step request for subsequent lines.
                    currentStepRequest = createStepRequest(vm.eventRequestManager(), stepThread);

                } else if (event instanceof StepEvent) {
                    StepEvent se = (StepEvent) event;

                    // Delete current step request; will re-create after processing.
                    if (currentStepRequest != null) {
                        vm.eventRequestManager().deleteEventRequest(currentStepRequest);
                        currentStepRequest = null;
                    }

                    if (result.steps.size() >= maxSteps) {
                        result.truncated = true;
                        // Don't add more steps — stop tracing.
                        vm.resume();
                        // Force VM to exit since we're done tracing.
                        try { vm.exit(0); } catch (Exception ignored) {}
                        connected = false;
                        break;
                    }

                    // Read current stdout snapshot from the shared buffer.
                    String currentStdout;
                    synchronized (stdoutBuffer) {
                        currentStdout = stdoutBuffer.toString();
                    }

                    // Build step data.
                    StepData step = buildStep(se, currentStdout);
                    result.steps.add(step);

                    // Create next step request.
                    stepThread = se.thread();
                    currentStepRequest = createStepRequest(vm.eventRequestManager(), stepThread);

                } else if (event instanceof VMDeathEvent) {
                    // VM exited normally.
                    try {
                        int exitCode = vm.process().waitFor();
                        result.exitCode = exitCode;
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                    connected = false;

                } else if (event instanceof VMDisconnectEvent) {
                    connected = false;
                }
            }

            try {
                eventSet.resume();
            } catch (VMDisconnectedException e) {
                connected = false;
            }
        }

        // Wait for stdout/stderr readers to finish (up to 2 seconds).
        try {
            stdoutReader.join(2000);
            stderrReader.join(2000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        // Update the last step's stdout with the complete accumulated output.
        synchronized (stdoutBuffer) {
            if (!result.steps.isEmpty()) {
                String finalStdout = stdoutBuffer.toString();
                result.steps.get(result.steps.size() - 1).stdout = finalStdout;
            }
        }

        // Capture any stderr for the error field.
        String stderr;
        synchronized (stderrBuffer) {
            stderr = stderrBuffer.toString().trim();
        }
        if (!stderr.isEmpty() && result.exitCode != 0) {
            result.error = stderr;
        }

        return result;
    }

    /** Create a line-level step request with class exclusions on the given thread. */
    private StepRequest createStepRequest(EventRequestManager erm, ThreadReference thread) {
        StepRequest sr = erm.createStepRequest(thread, StepRequest.STEP_LINE, StepRequest.STEP_INTO);
        sr.addCountFilter(1); // Fire once, then we re-create.
        for (String exclusion : CLASS_EXCLUSIONS) {
            sr.addClassExclusionFilter(exclusion);
        }
        sr.enable();
        return sr;
    }

    /** Build a StepData from a locatable event (StepEvent or BreakpointEvent). */
    private StepData buildStep(LocatableEvent le, String currentStdout) {
        StepData step = new StepData();
        step.stdout = currentStdout;

        Location location = le.location();
        step.line = location.lineNumber();

        // Extract local variables.
        try {
            StackFrame frame = le.thread().frame(0);
            step.locals = extractLocals(frame);
            step.callStack = buildCallStack(le.thread());
        } catch (IncompatibleThreadStateException e) {
            // Thread state changed (e.g., resumed by another event) — skip variable capture.
        }

        return step;
    }

    /**
     * Extract local variables from a stack frame.
     * Returns a map of variable name -> JSON-compatible value.
     * Returns an empty map if debug information is unavailable.
     */
    private Map<String, Object> extractLocals(StackFrame frame) {
        Map<String, Object> result = new LinkedHashMap<>();
        try {
            List<LocalVariable> vars = frame.visibleVariables();
            for (LocalVariable var : vars) {
                Value val = frame.getValue(var);
                result.put(var.name(), formatValue(val));
            }
        } catch (AbsentInformationException e) {
            // Debug info not available (class compiled without -g flag).
            // Return empty locals rather than crashing.
        }
        return result;
    }

    /**
     * Build call stack from all thread frames, filtering to student code only.
     * "Student code" is identified by not being in an excluded package.
     */
    private List<CallFrameData> buildCallStack(ThreadReference thread) {
        List<CallFrameData> stack = new ArrayList<>();
        try {
            List<StackFrame> frames = thread.frames();
            for (StackFrame frame : frames) {
                Location loc = frame.location();
                String declaringType = loc.declaringType().name();

                // Skip JDK internal classes.
                if (isExcludedClass(declaringType)) continue;

                CallFrameData cfd = new CallFrameData();
                cfd.functionName = loc.method().name();
                cfd.filename = "<student code>";
                cfd.line = loc.lineNumber();
                stack.add(cfd);
            }
        } catch (IncompatibleThreadStateException e) {
            // Thread may have resumed — return partial stack.
        }
        // Reverse so innermost frame is last (matching Python tracer behavior
        // where call_stack[0] is outermost and last is current).
        Collections.reverse(stack);
        return stack;
    }

    /** Check if a class name matches any of the excluded patterns. */
    private boolean isExcludedClass(String className) {
        for (String pattern : CLASS_EXCLUSIONS) {
            String prefix = pattern.endsWith(".*")
                ? pattern.substring(0, pattern.length() - 2)
                : pattern;
            if (className.startsWith(prefix)) return true;
        }
        return false;
    }

    /**
     * Format a JDI Value into a JSON-compatible Java object.
     * Returns String, Integer, Long, Double, Boolean, null, or a String representation.
     */
    private Object formatValue(Value val) {
        if (val == null) return null;

        if (val instanceof BooleanValue) {
            return ((BooleanValue) val).value();
        } else if (val instanceof ByteValue) {
            return (int) ((ByteValue) val).value();
        } else if (val instanceof CharValue) {
            return String.valueOf(((CharValue) val).value());
        } else if (val instanceof ShortValue) {
            return (int) ((ShortValue) val).value();
        } else if (val instanceof IntegerValue) {
            return ((IntegerValue) val).value();
        } else if (val instanceof LongValue) {
            return ((LongValue) val).value();
        } else if (val instanceof FloatValue) {
            return ((FloatValue) val).value();
        } else if (val instanceof DoubleValue) {
            return ((DoubleValue) val).value();
        } else if (val instanceof StringReference) {
            String s = ((StringReference) val).value();
            if (s.length() > MAX_VAR_LENGTH) {
                s = s.substring(0, MAX_VAR_LENGTH) + "...";
            }
            return s;
        } else if (val instanceof ArrayReference) {
            return formatArray((ArrayReference) val);
        } else if (val instanceof ObjectReference) {
            return formatObject((ObjectReference) val);
        } else {
            return val.toString();
        }
    }

    private Object formatArray(ArrayReference arr) {
        int len = arr.length();
        List<Object> result = new ArrayList<>();
        int limit = Math.min(len, MAX_COLLECTION_SIZE);
        for (int i = 0; i < limit; i++) {
            result.add(formatValue(arr.getValue(i)));
        }
        if (len > MAX_COLLECTION_SIZE) {
            result.add("...");
        }
        return result;
    }

    /**
     * Format an ObjectReference for display.
     *
     * We use the JDI reflective string representation rather than invoking
     * toString() on the remote VM. Invoking methods on the remote VM while
     * inside a StepEvent handler is error-prone and can deadlock if the method
     * itself triggers further JDI events. The type name + id is a safe fallback
     * that still gives the student useful information.
     */
    private Object formatObject(ObjectReference obj) {
        String typeName = obj.type().name();
        String shortType = shortTypeName(typeName);
        return "<" + shortType + ">";
    }

    /** Shorten a fully-qualified type name to its simple name. */
    private String shortTypeName(String typeName) {
        int dot = typeName.lastIndexOf('.');
        if (dot >= 0 && dot < typeName.length() - 1) {
            return typeName.substring(dot + 1);
        }
        return typeName;
    }

    /**
     * Serialize a TraceResult to the JSON string matching TraceResponse format.
     */
    String buildTraceResponse(TraceResult result) {
        JsonWriter w = new JsonWriter();
        w.beginObject();

        // "steps": [...]
        w.key("steps");
        w.beginArray();
        for (StepData step : result.steps) {
            w.beginObject();
            w.key("line").value(step.line);
            w.key("event").value(step.event);
            w.key("locals");
            writeValueMap(w, step.locals);
            w.key("globals");
            w.beginObject().endObject(); // always {}
            w.key("call_stack");
            w.beginArray();
            for (CallFrameData frame : step.callStack) {
                w.beginObject();
                w.key("function_name").value(frame.functionName);
                w.key("filename").value(frame.filename);
                w.key("line").value(frame.line);
                w.endObject();
            }
            w.endArray();
            w.key("stdout").value(step.stdout);
            w.endObject();
        }
        w.endArray();

        w.key("total_steps").value(result.steps.size());
        w.key("exit_code").value(result.exitCode);

        if (result.error != null && !result.error.isEmpty()) {
            w.key("error").value(result.error);
        } else {
            w.key("error").value("");
        }

        w.key("truncated").value(result.truncated);

        w.endObject();
        return w.toString();
    }

    /** Write a Map<String, Object> as a JSON object. */
    private void writeValueMap(JsonWriter w, Map<String, Object> map) {
        w.beginObject();
        for (Map.Entry<String, Object> entry : map.entrySet()) {
            w.key(entry.getKey());
            writeJsonValue(w, entry.getValue());
        }
        w.endObject();
    }

    /** Write an arbitrary Java object as a JSON value. */
    @SuppressWarnings("unchecked")
    private void writeJsonValue(JsonWriter w, Object val) {
        if (val == null) {
            w.valueNull();
        } else if (val instanceof Boolean) {
            w.value((Boolean) val);
        } else if (val instanceof Integer) {
            w.value((Integer) val);
        } else if (val instanceof Long) {
            w.value((Long) val);
        } else if (val instanceof Float) {
            w.value(((Float) val).floatValue());
        } else if (val instanceof Double) {
            w.value(((Double) val).doubleValue());
        } else if (val instanceof String) {
            w.value((String) val);
        } else if (val instanceof List) {
            List<Object> list = (List<Object>) val;
            w.beginArray();
            for (Object item : list) {
                writeJsonValue(w, item);
            }
            w.endArray();
        } else {
            w.value(val.toString());
        }
    }

    /** Build an error TraceResponse JSON string. */
    private static String errorResponse(String error, int exitCode) {
        JsonWriter w = new JsonWriter();
        w.beginObject();
        w.key("steps").beginArray().endArray();
        w.key("total_steps").value(0);
        w.key("exit_code").value(exitCode);
        w.key("error").value(error != null ? error : "");
        w.key("truncated").value(false);
        w.endObject();
        return w.toString();
    }

    /** Recursively delete a directory and all its contents. */
    private void deleteDirectory(File dir) {
        if (dir == null || !dir.exists()) return;
        File[] files = dir.listFiles();
        if (files != null) {
            for (File f : files) {
                if (f.isDirectory()) deleteDirectory(f);
                else f.delete();
            }
        }
        dir.delete();
    }
}
