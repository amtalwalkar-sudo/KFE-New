package com.kanishka.pwa;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Set;

/** Durable offline journal for the four one-shot ride GPS snapshots. */
final class KfeGpsEventJournal {
  private static final String STORAGE_KEY = "pendingEventGpsCaptures.v1";
  private static final long[] RETRY_DELAYS_MS = {30_000L, 60_000L, 2*60_000L, 5*60_000L, 15*60_000L, 30*60_000L};
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
        item.put("retryAttempts", 0); item.put("nextAttemptAt", 0L); items.put(item);
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
    synchronized (LOCK) { try { return read().length(); } catch (Exception error) { return 0; } }
  }

  /** Returns the earliest pending item, including future-due items, or null. */
  JSONObject earliestPending(Set<String> inFlight, long now) {
    synchronized (LOCK) {
      try {
        JSONArray items = read();
        JSONObject selected = null;
        long earliest = Long.MAX_VALUE;
        for (int i=0; i<items.length(); i++) {
          JSONObject item = items.optJSONObject(i);
          if (item == null) continue;
          String key = item.optString("key", "");
          if (inFlight != null && inFlight.contains(key)) continue;
          long due = item.optLong("nextAttemptAt", 0L);
          if (due <= 0L) due = now;
          if (due < earliest) { earliest = due; selected = new JSONObject(item.toString()); }
        }
        return selected;
      } catch (Exception error) { return null; }
    }
  }

  boolean recordFailure(String entityType, String entityId, String eventType, long now) {
    synchronized (LOCK) {
      try {
        JSONArray current = read(), next = new JSONArray();
        String key = KfeGpsEventPolicy.key(entityType, entityId, eventType);
        boolean found = false;
        for (int i=0; i<current.length(); i++) {
          JSONObject item = current.optJSONObject(i);
          if (item == null) continue;
          if (key.equals(item.optString("key", ""))) {
            int attempts = Math.max(0, item.optInt("retryAttempts", 0)) + 1;
            long delay = RETRY_DELAYS_MS[Math.min(attempts-1, RETRY_DELAYS_MS.length-1)];
            item.put("retryAttempts", attempts); item.put("nextAttemptAt", now + delay); found = true;
          }
          next.put(item);
        }
        return found && preferences.edit().putString(STORAGE_KEY, next.toString()).commit();
      } catch (Exception error) { return false; }
    }
  }

  private JSONArray read() throws Exception {
    return new JSONArray(preferences.getString(STORAGE_KEY, "[]"));
  }
}
