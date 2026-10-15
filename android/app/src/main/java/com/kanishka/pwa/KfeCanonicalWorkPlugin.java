package com.kanishka.pwa;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "KfeCanonicalWork")
public class KfeCanonicalWorkPlugin extends Plugin {
  @com.getcapacitor.PluginMethod
  public void putRecord(PluginCall call) {
    String operationId = call.getString("operationId", "");
    String entityType = call.getString("entityType", "");
    JSObject record = call.getObject("record");
    try {
      KfeCanonicalWorkStore.Outcome outcome = KfeCanonicalWorkStore.get(getContext()).putRecord(operationId, entityType, record);
      call.resolve(new JSObject(outcome.toJson().toString()));
    } catch (IllegalArgumentException error) {
      call.reject(error.getMessage(), "CANONICAL_COMMAND_REJECTED");
    } catch (Exception error) {
      call.reject("Canonical record commit failed.", "CANONICAL_COMMIT_FAILED", error);
    }
  }

  @com.getcapacitor.PluginMethod
  public void getRecord(PluginCall call) {
    try {
      JSONObject result = KfeCanonicalWorkStore.get(getContext()).getRecord(call.getString("entityType", ""), call.getString("entityId", ""));
      call.resolve(new JSObject(result.toString()));
    } catch (Exception error) {
      call.reject("Canonical record query failed.", "CANONICAL_QUERY_FAILED", error);
    }
  }

  @com.getcapacitor.PluginMethod
  public void listRecords(PluginCall call) {
    try {
      JSONObject result = KfeCanonicalWorkStore.get(getContext()).listRecords(
          call.getString("entityType", ""), call.getInt("limit", 500));
      call.resolve(new JSObject(result.toString()));
    } catch (Exception error) {
      call.reject("Canonical record list failed.", "CANONICAL_QUERY_FAILED", error);
    }
  }

  @com.getcapacitor.PluginMethod
  public void getOperation(PluginCall call) {
    try {
      JSONObject result = KfeCanonicalWorkStore.get(getContext()).getOperation(call.getString("operationId", ""));
      call.resolve(new JSObject(result.toString()));
    } catch (Exception error) {
      call.reject("Canonical operation query failed.", "CANONICAL_QUERY_FAILED", error);
    }
  }
}
