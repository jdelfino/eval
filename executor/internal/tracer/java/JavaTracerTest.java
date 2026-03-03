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
        testMaxStepsRespected();
        testGlobalsAlwaysEmpty();
        testCallStackHasMainMethod();
        testExitCodeZeroOnSuccess();
        testExitCodeOneOnCompileError();
        testIntVariable();
        testStringVariable();
        testJsonOutputIsValid();

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
        assertTrue("print output captured in stdout field", output.contains("hello"));
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

    static void testStringVariable() throws Exception {
        String code = "public class Main { public static void main(String[] args) { String s = \"hello\"; } }";
        String output = runTracer(code, "", 100);
        // The string variable should appear
        assertTrue("string variable captured", output.contains("hello"));
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
}
