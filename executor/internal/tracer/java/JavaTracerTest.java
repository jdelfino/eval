import java.io.*;
import java.nio.file.*;
import java.util.*;

/**
 * Integration-style tests for JavaTracer.
 *
 * Tests the tracer end-to-end by invoking JavaTracer.main() with test code and
 * validating the JSON output format matches the TraceResponse contract.
 *
 * Run with (from executor/internal/tracer/java/):
 *   javac -cp $JAVA_HOME/lib/tools.jar:. *.java && java -cp $JAVA_HOME/lib/tools.jar:. JavaTracerTest
 *
 * Or with JDK 21 (where tools.jar is on module path by default):
 *   javac *.java && java JavaTracerTest
 */
public class JavaTracerTest {
    private static int passed = 0;
    private static int failed = 0;

    public static void main(String[] args) throws Exception {
        testSimpleProgram();
        testCompilationError();
        testPrintOutput();
        testPrintOutputInStdoutField();
        testMaxStepsRespected();
        testGlobalsAlwaysEmpty();
        testCallStackHasMainMethod();
        testExitCodeZeroOnSuccess();
        testExitCodeOneOnCompileError();
        testIntVariable();
        testIntVariableInLocalsField();
        testStringVariable();
        testStringVariableInLocalsField();
        testJsonOutputIsValid();
        testStdinPassedToProgram();
        testLineFieldCorrectness();

        System.out.println("\nResults: " + passed + " passed, " + failed + " failed");
        if (failed > 0) {
            System.exit(1);
        }
    }

    /** Capture stdout from JavaTracer.main() invocation. */
    static String runTracer(String code, String stdin, int maxSteps) throws Exception {
        PrintStream originalOut = System.out;
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        PrintStream capture = new PrintStream(baos);
        System.setOut(capture);
        try {
            JavaTracer.main(new String[]{code, stdin, String.valueOf(maxSteps)});
        } finally {
            System.setOut(originalOut);
        }
        return baos.toString("UTF-8").trim();
    }

    static void assertTrue(String testName, boolean condition) {
        if (condition) {
            System.out.println("PASS: " + testName);
            passed++;
        } else {
            System.out.println("FAIL: " + testName);
            failed++;
        }
    }

    static void assertEquals(String testName, Object expected, Object actual) {
        if (expected.equals(actual)) {
            System.out.println("PASS: " + testName);
            passed++;
        } else {
            System.out.println("FAIL: " + testName + " — expected " + expected + " but got " + actual);
            failed++;
        }
    }

    /**
     * Extract the JSON string value for a given key from a JSON object string.
     * For example, extractStringField("{\"stdout\":\"hello\\n\"}", "stdout") -> "hello\n"
     * Returns null if the key is not found or the value is not a string.
     * This is a simple parser adequate for the flat fields we check in tests.
     */
    static String extractStringField(String json, String key) {
        // Look for "key":"value" pattern (handles escaped quotes in value)
        String searchKey = "\"" + key + "\":\"";
        int keyIdx = json.indexOf(searchKey);
        if (keyIdx < 0) return null;
        int valueStart = keyIdx + searchKey.length();
        // Scan for the closing quote, respecting backslash escapes.
        StringBuilder value = new StringBuilder();
        int i = valueStart;
        while (i < json.length()) {
            char c = json.charAt(i);
            if (c == '\\' && i + 1 < json.length()) {
                char next = json.charAt(i + 1);
                switch (next) {
                    case '"':  value.append('"');  i += 2; continue;
                    case '\\': value.append('\\'); i += 2; continue;
                    case 'n':  value.append('\n'); i += 2; continue;
                    case 'r':  value.append('\r'); i += 2; continue;
                    case 't':  value.append('\t'); i += 2; continue;
                    default:   value.append('\\'); value.append(next); i += 2; continue;
                }
            } else if (c == '"') {
                // End of string value.
                break;
            } else {
                value.append(c);
            }
            i++;
        }
        return value.toString();
    }

    /**
     * Extract the raw JSON object or value string for a given key.
     * For example, extractRawField("{\"locals\":{\"x\":42}}", "locals") -> "{\"x\":42}"
     * Returns null if the key is not found.
     * Handles both string values and non-string (object/array/number/boolean) values.
     */
    static String extractRawField(String json, String key) {
        String searchKey = "\"" + key + "\":";
        int keyIdx = json.indexOf(searchKey);
        if (keyIdx < 0) return null;
        int valueStart = keyIdx + searchKey.length();
        if (valueStart >= json.length()) return null;
        char firstChar = json.charAt(valueStart);
        if (firstChar == '{' || firstChar == '[') {
            // Find matching closing bracket.
            char open = firstChar;
            char close = (open == '{') ? '}' : ']';
            int depth = 0;
            int i = valueStart;
            while (i < json.length()) {
                char c = json.charAt(i);
                if (c == '"') {
                    // Skip string contents.
                    i++;
                    while (i < json.length()) {
                        char sc = json.charAt(i);
                        if (sc == '\\') { i += 2; continue; }
                        if (sc == '"') break;
                        i++;
                    }
                } else if (c == open) {
                    depth++;
                } else if (c == close) {
                    depth--;
                    if (depth == 0) {
                        return json.substring(valueStart, i + 1);
                    }
                }
                i++;
            }
            return null;
        } else if (firstChar == '"') {
            // String value — use extractStringField.
            return extractStringField(json, key);
        } else {
            // Number, boolean, null — scan until comma, }, or ]
            int end = valueStart;
            while (end < json.length()) {
                char c = json.charAt(end);
                if (c == ',' || c == '}' || c == ']') break;
                end++;
            }
            return json.substring(valueStart, end);
        }
    }

    /**
     * Extract the first step object from the "steps" array in the trace JSON.
     * Returns null if no steps are present.
     */
    static String extractFirstStep(String json) {
        String stepsRaw = extractRawField(json, "steps");
        if (stepsRaw == null || stepsRaw.equals("[]")) return null;
        // Find the first '{' inside the array.
        int start = stepsRaw.indexOf('{');
        if (start < 0) return null;
        // Find matching '}'.
        int depth = 0;
        int i = start;
        while (i < stepsRaw.length()) {
            char c = stepsRaw.charAt(i);
            if (c == '"') {
                // Skip string.
                i++;
                while (i < stepsRaw.length()) {
                    char sc = stepsRaw.charAt(i);
                    if (sc == '\\') { i += 2; continue; }
                    if (sc == '"') break;
                    i++;
                }
            } else if (c == '{') {
                depth++;
            } else if (c == '}') {
                depth--;
                if (depth == 0) {
                    return stepsRaw.substring(start, i + 1);
                }
            }
            i++;
        }
        return null;
    }

    /**
     * Extract the last step object from the "steps" array in the trace JSON.
     * Returns null if no steps are present.
     */
    static String extractLastStep(String json) {
        String stepsRaw = extractRawField(json, "steps");
        if (stepsRaw == null || stepsRaw.equals("[]")) return null;
        // Find all steps by scanning for outermost { } pairs inside the array.
        String lastStep = null;
        int i = 0;
        while (i < stepsRaw.length()) {
            char c = stepsRaw.charAt(i);
            if (c == '"') {
                i++;
                while (i < stepsRaw.length()) {
                    char sc = stepsRaw.charAt(i);
                    if (sc == '\\') { i += 2; continue; }
                    if (sc == '"') break;
                    i++;
                }
            } else if (c == '{') {
                int start = i;
                int depth = 0;
                while (i < stepsRaw.length()) {
                    char sc = stepsRaw.charAt(i);
                    if (sc == '"') {
                        i++;
                        while (i < stepsRaw.length()) {
                            char ssc = stepsRaw.charAt(i);
                            if (ssc == '\\') { i += 2; continue; }
                            if (ssc == '"') break;
                            i++;
                        }
                    } else if (sc == '{') {
                        depth++;
                    } else if (sc == '}') {
                        depth--;
                        if (depth == 0) {
                            lastStep = stepsRaw.substring(start, i + 1);
                            break;
                        }
                    }
                    i++;
                }
            }
            i++;
        }
        return lastStep;
    }

    static void testSimpleProgram() throws Exception {
        String code = "public class Main { public static void main(String[] args) { int x = 5; } }";
        String output = runTracer(code, "", 100);
        assertTrue("simple program produces JSON output", output.startsWith("{"));
        assertTrue("simple program has steps key", output.contains("\"steps\""));
        assertTrue("simple program has total_steps key", output.contains("\"total_steps\""));
        assertTrue("simple program has exit_code key", output.contains("\"exit_code\""));
        assertTrue("simple program has truncated key", output.contains("\"truncated\""));
    }

    static void testCompilationError() throws Exception {
        String code = "public class Main { this is not valid java }";
        String output = runTracer(code, "", 100);
        assertTrue("compile error produces JSON", output.startsWith("{"));
        assertTrue("compile error has exit_code", output.contains("\"exit_code\""));
        assertTrue("compile error has non-empty error field", output.contains("\"error\""));
        // exit_code should be 1 for compilation failure
        assertTrue("compile error has exit_code:1", output.contains("\"exit_code\":1"));
        // steps should be empty array
        assertTrue("compile error has empty steps", output.contains("\"steps\":[]"));
    }

    static void testPrintOutput() throws Exception {
        String code = "public class Main { public static void main(String[] args) { System.out.println(\"hello\"); } }";
        String output = runTracer(code, "", 100);
        assertTrue("print output captured somewhere in JSON", output.contains("hello"));
    }

    /**
     * Stronger assertion: verify "hello" appears specifically in the "stdout" field
     * of a step, not just anywhere in the JSON output.
     */
    static void testPrintOutputInStdoutField() throws Exception {
        String code = "public class Main { public static void main(String[] args) { System.out.println(\"hello\"); } }";
        String output = runTracer(code, "", 100);
        // The last step should have stdout containing "hello\n"
        String lastStep = extractLastStep(output);
        assertTrue("print output: last step exists", lastStep != null);
        if (lastStep != null) {
            String stdout = extractStringField(lastStep, "stdout");
            assertTrue("print output appears in stdout field of a step", stdout != null && stdout.contains("hello"));
        }
    }

    static void testMaxStepsRespected() throws Exception {
        // A simple loop that would run many steps
        String code = "public class Main { public static void main(String[] args) { for(int i=0;i<1000;i++){} } }";
        String output = runTracer(code, "", 5);
        // Should be truncated since 1000 iterations > 5 steps
        assertTrue("max steps causes truncation", output.contains("\"truncated\":true"));
    }

    static void testGlobalsAlwaysEmpty() throws Exception {
        String code = "public class Main { public static void main(String[] args) { int x = 5; } }";
        String output = runTracer(code, "", 100);
        // Java has no global variables concept; globals should always be {}
        assertTrue("globals is always empty object", output.contains("\"globals\":{}"));
    }

    static void testCallStackHasMainMethod() throws Exception {
        String code = "public class Main { public static void main(String[] args) { int x = 5; } }";
        String output = runTracer(code, "", 100);
        // Call stack should include "main" method name
        assertTrue("call stack contains main method", output.contains("\"function_name\":\"main\""));
    }

    static void testExitCodeZeroOnSuccess() throws Exception {
        String code = "public class Main { public static void main(String[] args) { int x = 5; } }";
        String output = runTracer(code, "", 100);
        assertTrue("successful program has exit_code:0", output.contains("\"exit_code\":0"));
    }

    static void testExitCodeOneOnCompileError() throws Exception {
        String code = "not valid java at all!!!";
        String output = runTracer(code, "", 100);
        assertTrue("compile error has exit_code:1", output.contains("\"exit_code\":1"));
    }

    static void testIntVariable() throws Exception {
        String code = "public class Main { public static void main(String[] args) { int x = 42; int y = x; } }";
        String output = runTracer(code, "", 100);
        // After assignment, x=42 should appear in locals
        assertTrue("int variable captured in locals", output.contains("42"));
    }

    /**
     * Stronger assertion: verify 42 appears specifically in the "locals" field of a step.
     */
    static void testIntVariableInLocalsField() throws Exception {
        String code = "public class Main { public static void main(String[] args) { int x = 42; int y = x; } }";
        String output = runTracer(code, "", 100);
        // Find any step where locals contains x:42
        assertTrue("int variable 42 appears in locals field of some step",
                anyStepLocalsContains(output, "42"));
    }

    static void testStringVariable() throws Exception {
        String code = "public class Main { public static void main(String[] args) { String s = \"hello\"; } }";
        String output = runTracer(code, "", 100);
        // The string variable should appear
        assertTrue("string variable captured", output.contains("hello"));
    }

    /**
     * Stronger assertion: verify the string value "hello" appears specifically in
     * the "locals" field of a step, not just anywhere in the JSON.
     */
    static void testStringVariableInLocalsField() throws Exception {
        String code = "public class Main { public static void main(String[] args) { String s = \"hello\"; } }";
        String output = runTracer(code, "", 100);
        assertTrue("string variable 'hello' appears in locals field of some step",
                anyStepLocalsContains(output, "hello"));
    }

    static void testJsonOutputIsValid() throws Exception {
        String code = "public class Main { public static void main(String[] args) { int x = 1; } }";
        String output = runTracer(code, "", 100);
        // Basic JSON validity: starts with { and ends with }
        assertTrue("output starts with {", output.startsWith("{"));
        assertTrue("output ends with }", output.endsWith("}"));
        // Required top-level keys
        assertTrue("has steps array", output.contains("\"steps\":["));
        assertTrue("has total_steps", output.contains("\"total_steps\":"));
        assertTrue("has exit_code", output.contains("\"exit_code\":"));
    }

    /**
     * Test that stdin is passed to the program and the read value appears in trace output.
     * Uses Scanner to read a line from stdin and assigns it to a variable;
     * the value should appear in the locals of a step after the read completes.
     */
    static void testStdinPassedToProgram() throws Exception {
        String code =
            "import java.util.Scanner;" +
            "public class Main {" +
            "  public static void main(String[] args) {" +
            "    Scanner sc = new Scanner(System.in);" +
            "    String line = sc.nextLine();" +
            "    int len = line.length();" +
            "  }" +
            "}";
        String stdin = "world";
        String output = runTracer(code, stdin, 200);
        // The program should complete without error (exit_code 0).
        assertTrue("stdin test: exit_code is 0", output.contains("\"exit_code\":0"));
        // The read value "world" should appear in locals once assigned to 'line'.
        assertTrue("stdin test: value read from stdin appears in locals",
                anyStepLocalsContains(output, "world"));
    }

    /**
     * Test that the "line" field in step objects reflects the correct source line number.
     * We use a two-line main method and verify that at least one step reports line >= 1
     * and that different lines are reported for the different statements.
     */
    static void testLineFieldCorrectness() throws Exception {
        // Multi-line program with distinct statements on different lines.
        // Line 1: class declaration / method start
        // We write it to span multiple lines so we can check distinct line numbers.
        String code =
            "public class Main {\n" +
            "  public static void main(String[] args) {\n" +
            "    int a = 1;\n" +
            "    int b = 2;\n" +
            "    int c = a + b;\n" +
            "  }\n" +
            "}";
        String output = runTracer(code, "", 100);
        assertTrue("line field test: steps present", !output.contains("\"steps\":[]"));

        // Verify the first step has a "line" field with a positive integer value.
        String firstStep = extractFirstStep(output);
        assertTrue("line field test: first step exists", firstStep != null);
        if (firstStep != null) {
            String lineRaw = extractRawField(firstStep, "line");
            assertTrue("line field exists in step", lineRaw != null);
            if (lineRaw != null) {
                try {
                    int lineNum = Integer.parseInt(lineRaw.trim());
                    assertTrue("line field is a positive integer", lineNum >= 1);
                } catch (NumberFormatException e) {
                    assertTrue("line field is a valid integer: " + lineRaw, false);
                }
            }
        }

        // Collect all step line numbers and verify multiple distinct lines are traced
        // (since the program has statements on lines 3, 4, and 5).
        Set<Integer> observedLines = collectStepLineNumbers(output);
        assertTrue("multiple distinct source lines are traced", observedLines.size() >= 2);
    }

    // --- JSON parsing helpers ---

    /**
     * Return true if any step in the trace JSON has a "locals" field whose
     * raw JSON contains the given substring (e.g. "42" or "world").
     */
    static boolean anyStepLocalsContains(String json, String substring) {
        String stepsRaw = extractRawField(json, "steps");
        if (stepsRaw == null || stepsRaw.equals("[]")) return false;

        // Iterate over all step objects in the array.
        int i = 0;
        while (i < stepsRaw.length()) {
            char c = stepsRaw.charAt(i);
            if (c == '"') {
                i++;
                while (i < stepsRaw.length()) {
                    char sc = stepsRaw.charAt(i);
                    if (sc == '\\') { i += 2; continue; }
                    if (sc == '"') break;
                    i++;
                }
            } else if (c == '{') {
                // Extract this step object.
                int start = i;
                int depth = 0;
                while (i < stepsRaw.length()) {
                    char sc = stepsRaw.charAt(i);
                    if (sc == '"') {
                        i++;
                        while (i < stepsRaw.length()) {
                            char ssc = stepsRaw.charAt(i);
                            if (ssc == '\\') { i += 2; continue; }
                            if (ssc == '"') break;
                            i++;
                        }
                    } else if (sc == '{') {
                        depth++;
                    } else if (sc == '}') {
                        depth--;
                        if (depth == 0) {
                            String stepJson = stepsRaw.substring(start, i + 1);
                            String localsRaw = extractRawField(stepJson, "locals");
                            if (localsRaw != null && localsRaw.contains(substring)) {
                                return true;
                            }
                            break;
                        }
                    }
                    i++;
                }
            }
            i++;
        }
        return false;
    }

    /**
     * Collect all distinct "line" field values from all step objects in the trace JSON.
     */
    static Set<Integer> collectStepLineNumbers(String json) {
        Set<Integer> lines = new HashSet<>();
        String stepsRaw = extractRawField(json, "steps");
        if (stepsRaw == null || stepsRaw.equals("[]")) return lines;

        int i = 0;
        while (i < stepsRaw.length()) {
            char c = stepsRaw.charAt(i);
            if (c == '"') {
                i++;
                while (i < stepsRaw.length()) {
                    char sc = stepsRaw.charAt(i);
                    if (sc == '\\') { i += 2; continue; }
                    if (sc == '"') break;
                    i++;
                }
            } else if (c == '{') {
                int start = i;
                int depth = 0;
                while (i < stepsRaw.length()) {
                    char sc = stepsRaw.charAt(i);
                    if (sc == '"') {
                        i++;
                        while (i < stepsRaw.length()) {
                            char ssc = stepsRaw.charAt(i);
                            if (ssc == '\\') { i += 2; continue; }
                            if (ssc == '"') break;
                            i++;
                        }
                    } else if (sc == '{') {
                        depth++;
                    } else if (sc == '}') {
                        depth--;
                        if (depth == 0) {
                            String stepJson = stepsRaw.substring(start, i + 1);
                            String lineRaw = extractRawField(stepJson, "line");
                            if (lineRaw != null) {
                                try {
                                    lines.add(Integer.parseInt(lineRaw.trim()));
                                } catch (NumberFormatException ignored) {}
                            }
                            break;
                        }
                    }
                    i++;
                }
            }
            i++;
        }
        return lines;
    }
}
