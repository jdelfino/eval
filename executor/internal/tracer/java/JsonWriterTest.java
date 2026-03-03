import java.util.*;

/**
 * Self-contained tests for JsonWriter.
 * Run with: javac JsonWriter.java JsonWriterTest.java && java JsonWriterTest
 */
public class JsonWriterTest {
    private static int passed = 0;
    private static int failed = 0;

    public static void main(String[] args) {
        testStringEscaping();
        testNullValue();
        testBooleanValues();
        testIntValue();
        testSimpleObject();
        testNestedObject();
        testArrayOfStrings();
        testEmptyObject();
        testEmptyArray();
        testSpecialCharsInString();
        testBackslashEscaping();
        testNewlineEscaping();
        testTabEscaping();
        testUnicodeEscaping();
        testLongStringTruncation();
        testDoubleValue();
        testFloatValue();
        testNaNDouble();
        testInfinityDouble();
        testObjectInArray();
        testLongValue();

        System.out.println("\nResults: " + passed + " passed, " + failed + " failed");
        if (failed > 0) {
            System.exit(1);
        }
    }

    static void assertEquals(String testName, String expected, String actual) {
        if (expected.equals(actual)) {
            System.out.println("PASS: " + testName);
            passed++;
        } else {
            System.out.println("FAIL: " + testName);
            System.out.println("  Expected: " + expected);
            System.out.println("  Actual:   " + actual);
            failed++;
        }
    }

    static void testStringEscaping() {
        JsonWriter w = new JsonWriter();
        w.beginObject();
        w.key("key").value("hello");
        w.endObject();
        assertEquals("string value", "{\"key\":\"hello\"}", w.toString());
    }

    static void testNullValue() {
        JsonWriter w = new JsonWriter();
        w.beginObject();
        w.key("k").valueNull();
        w.endObject();
        assertEquals("null value", "{\"k\":null}", w.toString());
    }

    static void testBooleanValues() {
        JsonWriter w = new JsonWriter();
        w.beginObject();
        w.key("t").value(true);
        w.key("f").value(false);
        w.endObject();
        assertEquals("boolean values", "{\"t\":true,\"f\":false}", w.toString());
    }

    static void testIntValue() {
        JsonWriter w = new JsonWriter();
        w.beginObject();
        w.key("n").value(42);
        w.endObject();
        assertEquals("int value", "{\"n\":42}", w.toString());
    }

    static void testSimpleObject() {
        JsonWriter w = new JsonWriter();
        w.beginObject();
        w.key("a").value("1");
        w.key("b").value("2");
        w.endObject();
        assertEquals("simple object", "{\"a\":\"1\",\"b\":\"2\"}", w.toString());
    }

    static void testNestedObject() {
        JsonWriter w = new JsonWriter();
        w.beginObject();
        w.key("outer");
        w.beginObject();
        w.key("inner").value("val");
        w.endObject();
        w.endObject();
        assertEquals("nested object", "{\"outer\":{\"inner\":\"val\"}}", w.toString());
    }

    static void testArrayOfStrings() {
        JsonWriter w = new JsonWriter();
        w.beginArray();
        w.value("a");
        w.value("b");
        w.endArray();
        assertEquals("array of strings", "[\"a\",\"b\"]", w.toString());
    }

    static void testEmptyObject() {
        JsonWriter w = new JsonWriter();
        w.beginObject();
        w.endObject();
        assertEquals("empty object", "{}", w.toString());
    }

    static void testEmptyArray() {
        JsonWriter w = new JsonWriter();
        w.beginArray();
        w.endArray();
        assertEquals("empty array", "[]", w.toString());
    }

    static void testSpecialCharsInString() {
        JsonWriter w = new JsonWriter();
        w.beginObject();
        w.key("k").value("say \"hello\"");
        w.endObject();
        assertEquals("quoted string", "{\"k\":\"say \\\"hello\\\"\"}", w.toString());
    }

    static void testBackslashEscaping() {
        JsonWriter w = new JsonWriter();
        w.beginObject();
        w.key("k").value("C:\\path");
        w.endObject();
        assertEquals("backslash escaping", "{\"k\":\"C:\\\\path\"}", w.toString());
    }

    static void testNewlineEscaping() {
        JsonWriter w = new JsonWriter();
        w.beginObject();
        w.key("k").value("line1\nline2");
        w.endObject();
        assertEquals("newline escaping", "{\"k\":\"line1\\nline2\"}", w.toString());
    }

    static void testTabEscaping() {
        JsonWriter w = new JsonWriter();
        w.beginObject();
        w.key("k").value("a\tb");
        w.endObject();
        assertEquals("tab escaping", "{\"k\":\"a\\tb\"}", w.toString());
    }

    static void testUnicodeEscaping() {
        JsonWriter w = new JsonWriter();
        w.beginObject();
        // Control character: char 0x01
        w.key("k").value("\u0001");
        w.endObject();
        assertEquals("control char escaping", "{\"k\":\"\\u0001\"}", w.toString());
    }

    static void testLongStringTruncation() {
        // JsonWriter itself doesn't truncate - that's done in the tracer.
        // This tests that long strings are NOT truncated by JsonWriter.
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 100; i++) sb.append("x");
        String s = sb.toString();
        JsonWriter w = new JsonWriter();
        w.beginObject();
        w.key("k").value(s);
        w.endObject();
        String result = w.toString();
        // The string should appear verbatim (no truncation by JsonWriter)
        if (result.contains(s)) {
            System.out.println("PASS: long string not truncated by JsonWriter");
            passed++;
        } else {
            System.out.println("FAIL: long string not truncated by JsonWriter");
            failed++;
        }
    }

    static void testDoubleValue() {
        JsonWriter w = new JsonWriter();
        w.beginObject();
        w.key("d").value(3.14);
        w.endObject();
        String result = w.toString();
        assertEquals("double value", "{\"d\":3.14}", result);
    }

    static void testFloatValue() {
        JsonWriter w = new JsonWriter();
        w.beginObject();
        w.key("f").value(2.5f);
        w.endObject();
        String result = w.toString();
        assertEquals("float value", "{\"f\":2.5}", result);
    }

    static void testNaNDouble() {
        JsonWriter w = new JsonWriter();
        w.beginObject();
        w.key("n").value(Double.NaN);
        w.endObject();
        assertEquals("NaN emitted as null", "{\"n\":null}", w.toString());
    }

    static void testInfinityDouble() {
        JsonWriter w = new JsonWriter();
        w.beginObject();
        w.key("n").value(Double.POSITIVE_INFINITY);
        w.endObject();
        assertEquals("Infinity emitted as null", "{\"n\":null}", w.toString());
    }

    static void testObjectInArray() {
        JsonWriter w = new JsonWriter();
        w.beginArray();
        w.beginObject();
        w.key("a").value(1);
        w.endObject();
        w.beginObject();
        w.key("b").value(2);
        w.endObject();
        w.endArray();
        assertEquals("objects in array", "[{\"a\":1},{\"b\":2}]", w.toString());
    }

    static void testLongValue() {
        JsonWriter w = new JsonWriter();
        w.beginObject();
        w.key("n").value(9999999999L);
        w.endObject();
        assertEquals("long value", "{\"n\":9999999999}", w.toString());
    }
}
