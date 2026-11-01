package com.kanishka.pwa;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Set;

/** Durable offline journal for the four one-shot ride GPS snapshots. */
final class KfeGpsEventJournal {
  private static final String STORAGE_KEY = "pendingEventGpsCaptures.v1";
  private static final Object LOCK = new Object();
  private final SharedPreferences preferences;

  KfeGpsEventJournal(Context context) {
    preferences = context.getSharedPreferences("kfe_overlay", Context.MODE_PRIVATE);
  }

  boolean enqueue(String entityType, String entityId, String eventType, String eventAt) {
    if (entityType == null || entityType.trim().isEmpty() || entityId == null || entityId.trim().isEmpty()
        || !KfeGpsEventPolicy.supports(entityType, eventType)) return false;
    synchronized (LOCK) {
      try {
        JSONArray items = read();
        String key = KfeGpsEventPolicy.key(entityType, entityId, eventType);
        for (int i=0; i<items.length(); i++) {
          JSONObject existing = items.optJSONObject(i);
          if (existing != null && key.equals(existing.optString("key", ""))) return true;
        }
        JSONObject item = new JSONObject();
        item.put("key", key); item.put("entityType", entityType); item.put("entityId", entityId);
        if ("TRIP".equals(entityType)) item.put("tripId", entityId);
        item.put("eventType", eventType); item.put("eventAt", eventAt == null ? "" : eventAt);
        item.put("queuedAt", java.time.Instant.now().toString());
        items.put(item);
        return preferences.edit().putString(STORAGE_KEY, items.toString()).commit();
      } catch (Exception error) { return false; }
    }
  }

  boolean remove(String entityType, String entityId, String eventType) {
    synchronized (LOCK) {
      try {
        JSONArray current = read(), next = new JSONArray();
        String key = KfeGpsEventPolicy.key(entityType, entityId, eventType);
        for (int i=0; i<current.length(); i++) {
          JSONObject item = current.optJSONObject(i);
          if (item != null && !key.equals(item.optString("key", ""))) next.put(item);
        }
        return preferences.edit().putString(STORAGE_KEY, next.toString()).commit();
      } catch (Exception error) { return false; }
    }
  }

  boolean hasPending() { return count() > 0; }
  int count() {
    synchronized (LOCK) {
      try { return read().length(); }
      catch (Exception error) { throw new IllegalStateException("GPS event journal could not be read.", error); }
    }
  }

  /** Returns every pending item not already being captured, in original event order. */
  JSONArray pending(Set<String> inFlight) {
    synchronized (LOCK) {
      try {
        JSONArray items = read(), result = new JSONArray();
        for (int i=0; i<items.length(); i++) {
          JSONObject item = items.optJSONObject(i);
          if (item == null) continue;
          String key = item.optString("key", "");
          if (inFlight != null && inFlight.contains(key)) continue;
          result.put(new JSONObject(item.toString()));
        }
        return result;
      } catch (Exception error) { throw new IllegalStateException("GPS event journal could not be read for retry.", error); }
    }
  }

  private JSONArray read() throws Exception {
    return new JSONArray(preferences.getString(STORAGE_KEY, "[]"));
  }
}
