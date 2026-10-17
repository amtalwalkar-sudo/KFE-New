package com.kanishka.pwa;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONObject;

final class KfeNativeEventStore extends SQLiteOpenHelper {
  private static final String DB_NAME = "kfe_native_events.db";
  private static final int DB_VERSION = 1;
  private static volatile KfeNativeEventStore instance;

  static synchronized KfeNativeEventStore get(Context context) {
    if (instance == null) instance = new KfeNativeEventStore(context.getApplicationContext());
    return instance;
  }

  private KfeNativeEventStore(Context context) { super(context, DB_NAME, null, DB_VERSION); }

  @Override public void onCreate(SQLiteDatabase db) {
    db.execSQL("CREATE TABLE native_events (id TEXT PRIMARY KEY, stage TEXT NOT NULL, trip_id TEXT NOT NULL, input TEXT, created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT)");
    db.execSQL("CREATE INDEX native_events_pending_order ON native_events(status, created_at)");
  }

  @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { }

  synchronized String append(String stage, String tripId, String input) {
    String safeStage = stage == null ? "" : stage;
    String safeTripId = tripId == null ? "" : tripId;
    String safeInput = input == null ? "" : input;
    SQLiteDatabase db = getWritableDatabase();

    // A process may die after the event is durably appended but before the
    // canonical record and workflow preferences advance. Retrying the same
    // logical action must recover the existing event, including when PWA replay
    // has already acknowledged it, rather than creating a second side effect.
    try (Cursor existing = db.query("native_events", new String[]{"id"},
        "stage=? AND trip_id=? AND COALESCE(input,'')=?",
        new String[]{safeStage, safeTripId, safeInput}, null, null,
        "created_at ASC, rowid ASC", "1")) {
      if (existing.moveToFirst()) return existing.getString(0);
    }

    String id = java.util.UUID.randomUUID().toString();
    ContentValues values = new ContentValues();
    values.put("id", id);
    values.put("stage", safeStage);
    values.put("trip_id", safeTripId);
    values.put("input", input);
    values.put("created_at", System.currentTimeMillis());
    values.put("status", "PENDING");
    db.insertOrThrow("native_events", null, values);
    return id;
  }

  synchronized JSONArray pending(int limit) {
    JSONArray events = new JSONArray();
    try (Cursor cursor = getReadableDatabase().query("native_events",
        new String[]{"id", "stage", "trip_id", "input", "created_at", "attempts"},
        "status=?", new String[]{"PENDING"}, null, null, "created_at ASC, rowid ASC", Integer.toString(Math.max(1, Math.min(limit, 500))))) {
      while (cursor.moveToNext()) {
        JSONObject event = new JSONObject();
        event.put("eventId", cursor.getString(0));
        event.put("stage", cursor.getString(1));
        event.put("tripId", cursor.getString(2));
        if (!cursor.isNull(3)) event.put("input", cursor.getString(3));
        event.put("createdAt", cursor.getLong(4));
        event.put("attempts", cursor.getInt(5));
        events.put(event);
      }
    } catch (Exception ignored) { }
    return events;
  }

  synchronized boolean isAcknowledged(String id) {
    if (id == null || id.trim().isEmpty()) return false;
    try (Cursor cursor = getReadableDatabase().query("native_events", new String[]{"status"}, "id=?", new String[]{id}, null, null, null, "1")) {
      return cursor.moveToFirst() && "ACKNOWLEDGED".equals(cursor.getString(0));
    }
  }

  synchronized boolean acknowledge(String id) {
    if (id == null || id.trim().isEmpty()) return false;
    ContentValues values = new ContentValues();
    values.put("status", "ACKNOWLEDGED");
    values.put("last_error", (String) null);
    return getWritableDatabase().update("native_events", values, "id=? AND status='PENDING'", new String[]{id}) == 1;
  }

  synchronized void recordFailure(String id, String error) {
    if (id == null || id.trim().isEmpty()) return;
    getWritableDatabase().execSQL("UPDATE native_events SET attempts=attempts+1, last_error=? WHERE id=? AND status='PENDING'",
        new Object[]{error == null ? "Processing failed" : error, id});
  }
}
