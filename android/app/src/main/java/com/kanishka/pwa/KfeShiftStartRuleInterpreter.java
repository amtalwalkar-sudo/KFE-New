package com.kanishka.pwa;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * Interpreter for the shared declarative shift-start rules.
 * Business formulas live in spec/work-domain/shift-start-rules.json; this class
 * interprets the AST and deliberately does not maintain separate rule formulas.
 */
public final class KfeShiftStartRuleInterpreter {
  private final JSONObject rules;

  public KfeShiftStartRuleInterpreter(Context context) throws Exception {
    try (InputStream input = context.getAssets().open("shift-start-rules.json")) {
      byte[] bytes = new byte[input.available()];
      int offset = 0;
      while (offset < bytes.length) {
        int read = input.read(bytes, offset, bytes.length - offset);
        if (read < 0) break;
        offset += read;
      }
      JSONObject source = new JSONObject(new String(bytes, 0, offset, StandardCharsets.UTF_8));
      if (source.optInt("schemaVersion", -1) != 1) {
        throw new IllegalStateException("Unsupported shift-start rule schema version.");
      }
      rules = source.getJSONObject("rules");
    }
  }

  public JSONObject evaluate(String ruleName, JSONObject input) throws JSONException {
    if (!rules.has(ruleName)) throw new IllegalArgumentException("Unknown shift-start rule: " + ruleName);
    return (JSONObject) eval(rules.getJSONObject(ruleName).getJSONObject("expression"), input);
  }

  private Object eval(JSONObject node, JSONObject input) throws JSONException {
    if (node.has("const")) return clean(node.get("const"));
    if (node.has("input")) return clean(input.has(node.getString("input")) ? input.get(node.getString("input")) : null);
    if (node.has("number")) {
      JSONObject source = node.getJSONObject("number");
      if (source.has("input")) return number(input.has(source.getString("input")) ? input.get(source.getString("input")) : null);
      return number(eval(source, input));
    }
    if (node.has("object")) {
      JSONObject definition = node.getJSONObject("object");
      JSONObject result = new JSONObject();
      java.util.Iterator<String> keys = definition.keys();
      while (keys.hasNext()) {
        String key = keys.next();
        Object value = eval(definition.getJSONObject(key), input);
        result.put(key, value == null ? JSONObject.NULL : (value instanceof Double && !Double.isFinite((Double) value) ? JSONObject.NULL : value));
      }
      return result;
    }
    if (node.has("if")) {
      boolean condition = truth(eval(node.getJSONObject("if"), input));
      return eval(node.getJSONObject(condition ? "then" : "else"), input);
    }
    if (!node.has("op")) throw new IllegalArgumentException("Unsupported rule AST node: " + node);
    String op = node.getString("op");
    if ("notFinite".equals(op)) {
      Object value = eval(node.getJSONObject("value"), input);
      return value == null || !Double.isFinite(number(value));
    }
    if ("finiteAndPresent".equals(op)) {
      Object value = eval(node.getJSONObject("value"), input);
      return value != null && !value.equals("") && Double.isFinite(number(value));
    }
    if ("notFiniteOrMissing".equals(op)) {
      Object value = eval(node.getJSONObject("value"), input);
      return value == null || value.equals("") || !Double.isFinite(number(value));
    }
    if ("and".equals(op) || "or".equals(op)) {
      JSONArray args = node.getJSONArray("args");
      boolean result = "and".equals(op);
      for (int i = 0; i < args.length(); i++) {
        boolean current = truth(eval(args.getJSONObject(i), input));
        result = "and".equals(op) ? result && current : result || current;
      }
      return result;
    }
    if ("not".equals(op)) return !truth(eval(node.getJSONObject("value"), input));
    Object left = eval(node.getJSONObject("left"), input);
    Object right = eval(node.getJSONObject("right"), input);
    if ("eq".equals(op)) {\n      if (left == null) return right == null;\n      if (left instanceof Number && right instanceof Number) {\n        return Double.compare(((Number) left).doubleValue(), ((Number) right).doubleValue()) == 0;\n      }\n      return left.equals(right);\n    }
    double a = number(left);
    double b = number(right);
    if ("lte".equals(op)) return a <= b;
    if ("lt".equals(op)) return a < b;
    if ("gt".equals(op)) return a > b;
    if ("subtract".equals(op)) return a - b;
    throw new IllegalArgumentException("Unsupported rule operation: " + op);
  }

  private static Object clean(Object value) {
    return value == JSONObject.NULL ? null : value;
  }

  private static double number(Object value) {
    if (value == null || value == JSONObject.NULL || "".equals(value)) return Double.NaN;
    if (value instanceof Number) return ((Number) value).doubleValue();
    try { return Double.parseDouble(String.valueOf(value)); }
    catch (NumberFormatException ignored) { return Double.NaN; }
  }

  private static boolean truth(Object value) {
    if (value instanceof Boolean) return (Boolean) value;
    if (value == null) return false;
    if (value instanceof Number) return ((Number) value).doubleValue() != 0;
    return !value.equals("");
  }
}
