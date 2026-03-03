/**
 * Minimal JSON writer that avoids external dependencies.
 *
 * Builds JSON incrementally using a StringBuilder. Supports objects, arrays,
 * string/int/boolean/null values with proper escaping.
 *
 * Usage:
 *   JsonWriter w = new JsonWriter();
 *   w.beginObject();
 *     w.key("name").value("Alice");
 *     w.key("age").value(30);
 *     w.key("active").value(true);
 *   w.endObject();
 *   String json = w.toString(); // {"name":"Alice","age":30,"active":true}
 */
public class JsonWriter {
    private final StringBuilder sb = new StringBuilder();
    // Track whether a comma is needed before the next element in each scope.
    // We use a simple boolean stack via a char[] for object/array nesting.
    private boolean needsComma = false;

    // Stack tracking nesting context: 'o' = object, 'a' = array
    private final char[] contextStack = new char[64];
    private int depth = 0;

    public JsonWriter beginObject() {
        writeCommaIfNeeded();
        sb.append('{');
        pushContext('o');
        needsComma = false;
        return this;
    }

    public JsonWriter endObject() {
        sb.append('}');
        popContext();
        needsComma = true;
        return this;
    }

    public JsonWriter beginArray() {
        writeCommaIfNeeded();
        sb.append('[');
        pushContext('a');
        needsComma = false;
        return this;
    }

    public JsonWriter endArray() {
        sb.append(']');
        popContext();
        needsComma = true;
        return this;
    }

    /**
     * Write an object key. Must be called inside an object.
     * Automatically appends ':' and prepares for the value.
     */
    public JsonWriter key(String name) {
        writeCommaIfNeeded();
        appendString(name);
        sb.append(':');
        needsComma = false; // value follows immediately, comma logic handled by value methods
        return this;
    }

    /** Write a string value (with proper escaping). */
    public JsonWriter value(String s) {
        if (!inObject()) {
            writeCommaIfNeeded();
        }
        appendString(s);
        needsComma = true;
        return this;
    }

    /** Write an integer value. */
    public JsonWriter value(int n) {
        if (!inObject()) {
            writeCommaIfNeeded();
        }
        sb.append(n);
        needsComma = true;
        return this;
    }

    /** Write a long value. */
    public JsonWriter value(long n) {
        if (!inObject()) {
            writeCommaIfNeeded();
        }
        sb.append(n);
        needsComma = true;
        return this;
    }

    /** Write a double value (emits a JSON number, not a string). */
    public JsonWriter value(double d) {
        if (!inObject()) {
            writeCommaIfNeeded();
        }
        if (Double.isNaN(d) || Double.isInfinite(d)) {
            // JSON does not support NaN/Infinity — emit as null.
            sb.append("null");
        } else {
            sb.append(d);
        }
        needsComma = true;
        return this;
    }

    /** Write a float value (emits a JSON number, not a string). */
    public JsonWriter value(float f) {
        if (!inObject()) {
            writeCommaIfNeeded();
        }
        if (Float.isNaN(f) || Float.isInfinite(f)) {
            sb.append("null");
        } else {
            sb.append(f);
        }
        needsComma = true;
        return this;
    }

    /** Write a boolean value. */
    public JsonWriter value(boolean b) {
        if (!inObject()) {
            writeCommaIfNeeded();
        }
        sb.append(b ? "true" : "false");
        needsComma = true;
        return this;
    }

    /** Write a null value. */
    public JsonWriter valueNull() {
        if (!inObject()) {
            writeCommaIfNeeded();
        }
        sb.append("null");
        needsComma = true;
        return this;
    }

    /**
     * Write a raw JSON fragment (already-serialized JSON). Use with care —
     * no escaping is applied. Useful for embedding nested JsonWriter output.
     */
    public JsonWriter rawValue(String raw) {
        if (!inObject()) {
            writeCommaIfNeeded();
        }
        sb.append(raw);
        needsComma = true;
        return this;
    }

    @Override
    public String toString() {
        return sb.toString();
    }

    // --- Private helpers ---

    private void writeCommaIfNeeded() {
        if (needsComma) {
            sb.append(',');
            needsComma = false;
        }
    }

    private void appendString(String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':  sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n");  break;
                case '\r': sb.append("\\r");  break;
                case '\t': sb.append("\\t");  break;
                case '\b': sb.append("\\b");  break;
                case '\f': sb.append("\\f");  break;
                default:
                    if (c < 0x20) {
                        // Control characters: unicode escape
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        sb.append('"');
    }

    private void pushContext(char type) {
        contextStack[depth++] = type;
    }

    private void popContext() {
        if (depth > 0) depth--;
    }

    private boolean inObject() {
        return depth > 0 && contextStack[depth - 1] == 'o';
    }
}
