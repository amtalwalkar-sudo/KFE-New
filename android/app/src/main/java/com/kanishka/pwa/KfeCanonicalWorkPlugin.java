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
  public void prepareCreateIntent(PluginCall call) {
    try {
      JSONObject intent = KfeCanonicalWorkStore.get(getContext()).prepareCreateIntent(
          call.getString("entityType", ""), call.getString("intentKey", ""), call.getObject("record"));
      call.resolve(new JSObject(intent.toString()));
    } catch (IllegalArgumentException error) {
      call.reject(error.getMessage(), "CANONICAL_CREATE_INTENT_REJECTED");
    } catch (Exception error) {
      call.reject("Canonical create intent could not be journaled.", "CANONICAL_CREATE_INTENT_FAILED", error);
    }
  }

  @com.getcapacitor.PluginMethod
  public void completeCreateIntent(PluginCall call) {
    try {
      JSONObject result = KfeCanonicalWorkStore.get(getContext()).completeCreateIntent(call.getString("intentId", ""));
      call.resolve(new JSObject(result.toString()));
    } catch (Exception error) {
      call.reject("Canonical create intent completion failed.", "CANONICAL_CREATE_INTENT_COMPLETE_FAILED", error);
    }
  }

  @com.getcapacitor.PluginMethod
  public void putRecord(PluginCall call) {
    String operationId = call.getString("operationId", "");
    String entityType = call.getString("entityType", "");
    JSObject record = call.getObject("record");
    String expectedUpdatedAt = call.getString("expectedUpdatedAt", null);
    boolean expectAbsent = call.getBoolean("expectAbsent", false);
    try {
      KfeCanonicalWorkStore.Outcome outcome = KfeCanonicalWorkStore.get(getContext())
          .putRecord(operationId, entityType, record, expectedUpdatedAt, expectAbsent);
      call.resolve(new JSObject(outcome.toJson().toString()));
    } catch (IllegalArgumentException error) {
      call.reject(error.getMessage(), "CANONICAL_COMMAND_REJECTED");
    } catch (Exception error) {
      call.reject("Canonical record commit failed.", "CANONICAL_COMMIT_FAILED", error);
    }
  }

  @com.getcapacitor.PluginMethod
  public void persistTripBoundarySnapshot(PluginCall call) {
    String operationId = call.getString("operationId", "");
    String tripId = call.getString("tripId", "");
    String field = call.getString("field", "");
    JSObject snapshot = call.getObject("snapshot");
    try {
      KfeCanonicalWorkStore.Outcome outcome = KfeCanonicalWorkStore.get(getContext())
          .persistTripBoundarySnapshot(operationId, tripId, field, snapshot);
      call.resolve(new JSObject(outcome.toJson().toString()));
    } catch (IllegalArgumentException error) {
      call.reject(error.getMessage(), "CANONICAL_BOUNDARY_SNAPSHOT_REJECTED");
    } catch (Exception error) {
      call.reject("Canonical trip-boundary snapshot commit failed.", "CANONICAL_BOUNDARY_SNAPSHOT_FAILED", error);
    }
  }

  @com.getcapacitor.PluginMethod
  public void updateTripBoundaryPlaceName(PluginCall call) {
    String operationId = call.getString("operationId", "");
    String tripId = call.getString("tripId", "");
    String field = call.getString("field", "");
    String placeName = call.getString("placeName", "");
    try {
      KfeCanonicalWorkStore.Outcome outcome = KfeCanonicalWorkStore.get(getContext())
          .updateTripBoundaryPlaceName(operationId, tripId, field, placeName);
      call.resolve(new JSObject(outcome.toJson().toString()));
    } catch (IllegalArgumentException error) {
      call.reject(error.getMessage(), "CANONICAL_BOUNDARY_LABEL_REJECTED");
    } catch (Exception error) {
      call.reject("Canonical trip-boundary label update failed.", "CANONICAL_BOUNDARY_LABEL_FAILED", error);
    }
  }

  @com.getcapacitor.PluginMethod
  public void migrateLegacySnapshot(PluginCall call) {
    try {
      String migrationId = call.getString("migrationId", "");
      JSObject snapshot = call.getObject("snapshot");
      JSONObject result = KfeCanonicalWorkStore.get(getContext()).migrateLegacySnapshot(migrationId, snapshot);
      call.resolve(new JSObject(result.toString()));
    } catch (IllegalArgumentException error) {
      call.reject(error.getMessage(), "CANONICAL_MIGRATION_REJECTED");
    } catch (Exception error) {
      call.reject("Legacy canonical migration failed.", "CANONICAL_MIGRATION_FAILED", error);
    }
  }

  @com.getcapacitor.PluginMethod
  public void verifyLegacyMigration(PluginCall call) {
    try {
      JSONObject result = KfeCanonicalWorkStore.get(getContext()).verifyLegacyMigration(call.getString("migrationId", ""));
      call.resolve(new JSObject(result.toString()));
    } catch (Exception error) {
      call.reject("Legacy canonical migration verification failed.", "CANONICAL_MIGRATION_VERIFY_FAILED", error);
    }
  }

  @com.getcapacitor.PluginMethod
  public void getMigration(PluginCall call) {
    try {
      JSONObject result = KfeCanonicalWorkStore.get(getContext()).getMigration(call.getString("migrationId", ""));
      call.resolve(new JSObject(result.toString()));
    } catch (Exception error) {
      call.reject("Canonical migration query failed.", "CANONICAL_MIGRATION_QUERY_FAILED", error);
    }
  }

  @com.getcapacitor.PluginMethod
  public void beginCanonicalReset(PluginCall call) {
    String resetId = call.getString("resetId", "");
    try {
      KfeNativeWorkActionsPlugin.beginResetBarrier(getContext(), resetId);
      JSONObject result = KfeCanonicalWorkStore.get(getContext()).beginReset(resetId);
      call.resolve(new JSObject(result.toString()));
    } catch (IllegalStateException error) {
      if (error.getMessage() != null && error.getMessage().toLowerCase(java.util.Locale.US).contains("active shift")) {
        KfeNativeWorkActionsPlugin.releaseResetBarrier(getContext(), resetId);
      }
      call.reject(error.getMessage(), "CANONICAL_RESET_REJECTED", error);
    } catch (IllegalArgumentException error) {
      call.reject(error.getMessage(), "CANONICAL_RESET_REJECTED");
    } catch (Exception error) {
      call.reject("Canonical reset protocol operation failed.", "CANONICAL_RESET_FAILED", error);
    }
  }

  @com.getcapacitor.PluginMethod
  public void clearCanonicalReset(PluginCall call) {
    String resetId = call.getString("resetId", "");
    try {
      KfeNativeWorkActionsPlugin.cancelPendingForReset(getContext(), resetId);
      JSONObject result = KfeCanonicalWorkStore.get(getContext()).clearForReset(resetId);
      call.resolve(new JSObject(result.toString()));
    } catch (IllegalArgumentException error) {
      call.reject(error.getMessage(), "CANONICAL_RESET_REJECTED");
    } catch (Exception error) {
      call.reject("Canonical reset protocol operation failed.", "CANONICAL_RESET_FAILED", error);
    }
  }

  @com.getcapacitor.PluginMethod
  public void completeCanonicalReset(PluginCall call) {
    try {
      JSONObject result = KfeCanonicalWorkStore.get(getContext()).completeReset(call.getString("resetId", ""));
      call.resolve(new JSObject(result.toString()));
    } catch (IllegalArgumentException error) {
      call.reject(error.getMessage(), "CANONICAL_RESET_REJECTED");
    } catch (Exception error) {
      call.reject("Canonical reset protocol operation failed.", "CANONICAL_RESET_FAILED", error);
    }
  }

  @com.getcapacitor.PluginMethod
  public void releaseCanonicalReset(PluginCall call) {
    String resetId = call.getString("resetId", "");
    try {
      JSONObject state = KfeCanonicalWorkStore.get(getContext()).getResetState();
      if (state.optBoolean("found") && resetId.equals(state.optString("resetId"))
          && !"COMPLETE".equals(state.optString("state"))) {
        throw new IllegalStateException("Native reset cannot release its event barrier before completion.");
      }
      KfeNativeWorkActionsPlugin.releaseResetBarrier(getContext(), resetId);
      JSONObject result = new JSONObject().put("resetId", resetId).put("released", true);
      call.resolve(new JSObject(result.toString()));
    } catch (Exception error) {
      call.reject("Native reset event barrier could not be released.", "CANONICAL_RESET_RELEASE_FAILED", error);
    }
  }

  @com.getcapacitor.PluginMethod
  public void getCanonicalResetState(PluginCall call) {
    try {
      JSONObject result = KfeCanonicalWorkStore.get(getContext()).getResetState(call.getString("resetId", ""));
      call.resolve(new JSObject(result.toString()));
    } catch (IllegalArgumentException error) {
      call.reject(error.getMessage(), "CANONICAL_RESET_REJECTED");
    } catch (Exception error) {
      call.reject("Canonical reset protocol operation failed.", "CANONICAL_RESET_FAILED", error);
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
