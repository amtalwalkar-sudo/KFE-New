package com.kanishka.pwa;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Authoritative native-backed business record boundary.
 *
 * The existing native event queue remains transport only. This store owns
 * canonical JSON business records and commits each record mutation, operation
 * outcome, and audit row in one SQLite transaction.
 */
final class KfeCanonicalWorkStore extends SQLiteOpenHelper {
  private static final String DB_NAME = "kfe_canonical_work.db";
  private static final int DB_VERSION = 1;
  private static volatile KfeCanonicalWorkStore instance;

  static synchronized KfeCanonicalWorkStore get(Context context) {
    if (instance == null) instance = new KfeCanonicalWorkStore(context.getApplicationContext());
    return instance;
  }

  private KfeCanonicalWorkStore(Context context) { super(context, DB_NAME, null, DB_VERSION); }

  @Override public void onCreate(SQLiteDatabase db) {
    db.execSQL("CREATE TABLE canonical_records (entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(entity_type, entity_id))");
    db.execSQL("CREATE INDEX canonical_records_updated ON canonical_records(updated_at)");
    db.execSQL("CREATE TABLE canonical_operations (operation_id TEXT PRIMARY KEY, command TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, status TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL)");
    db.execSQL("CREATE TABLE canonical_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, operation_id TEXT NOT NULL UNIQUE, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL)");
  }

  @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { }

  static final class Outcome {
    final boolean accepted;
    final boolean duplicate;
    final JSONObject result;
    Outcome(boolean accepted, boolean duplicate, JSONObject result) {
      this.accepted = accepted; this.duplicate = duplicate; this.result = result;
    }
    JSONObject toJson() throws JSONException {
      JSONObject out = new JSONObject();
      out.put("accepted", accepted); out.put("duplicate", duplicate); out.put("outcome", result);
      return out;
    }
  }

  synchronized Outcome putRecord(String operationId, String entityType, JSONObject record) throws Exception {
    if (empty(operationId)) throw new IllegalArgumentException("operationId is required.");
    if (empty(entityType)) throw new IllegalArgumentException("entityType is required.");
    if (record == null) throw new IllegalArgumentException("record is required.");
    String entityId = record.optString("id", "");
    if (empty(entityId)) throw new IllegalArgumentException("record.id is required.");
    String payload = record.toString();
    String now = java.time.Instant.now().toString();
    SQLiteDatabase db = getWritableDatabase();
    db.beginTransaction();
    try {
      try (Cursor cursor = db.query("canonical_operations",
          new String[]{"command", "entity_type", "entity_id", "status", "result_json"},
          "operation_id=?", new String[]{operationId}, null, null, null, "1")) {
        if (cursor.moveToFirst()) {
          String command = cursor.getString(0);
          String priorType = cursor.getString(1);
          String priorId = cursor.getString(2);
          if (!"PUT_RECORD".equals(command) || !entityType.equals(priorType) || !entityId.equals(priorId)) {
            throw new IllegalArgumentException("operationId was already used for a different command.");
          }
          JSONObject prior = new JSONObject(cursor.getString(4));
          db.setTransactionSuccessful();
          return new Outcome("ACCEPTED".equals(cursor.getString(3)), true, prior);
        }
      }

      ContentValues recordValues = new ContentValues();
      recordValues.put("entity_type", entityType);
      recordValues.put("entity_id", entityId);
      recordValues.put("payload", payload);
      recordValues.put("updated_at", now);
      db.insertWithOnConflict("canonical_records", null, recordValues, SQLiteDatabase.CONFLICT_REPLACE);

      JSONObject result = new JSONObject();
      result.put("operationId", operationId);
      result.put("entityType", entityType);
      result.put("entityId", entityId);
      result.put("committedAt", now);
      result.put("record", record);

      ContentValues operationValues = new ContentValues();
      operationValues.put("operation_id", operationId);
      operationValues.put("command", "PUT_RECORD");
      operationValues.put("entity_type", entityType);
      operationValues.put("entity_id", entityId);
      operationValues.put("status", "ACCEPTED");
      operationValues.put("result_json", result.toString());
      operationValues.put("created_at", now);
      db.insertOrThrow("canonical_operations", null, operationValues);

      ContentValues auditValues = new ContentValues();
      auditValues.put("operation_id", operationId);
      auditValues.put("entity_type", entityType);
      auditValues.put("entity_id", entityId);
      auditValues.put("action", "PUT_RECORD");
      auditValues.put("payload", payload);
      auditValues.put("created_at", now);
      db.insertOrThrow("canonical_audit", null, auditValues);

      db.setTransactionSuccessful();
      return new Outcome(true, false, result);
    } finally {
      db.endTransaction();
    }
  }

  synchronized JSONObject getRecord(String entityType, String entityId) throws JSONException {
    if (empty(entityType) || empty(entityId)) throw new IllegalArgumentException("entityType and entityId are required.");
    try (Cursor cursor = getReadableDatabase().query("canonical_records", new String[]{"payload", "updated_at"},
        "entity_type=? AND entity_id=?", new String[]{entityType, entityId}, null, null, null, "1")) {
      if (!cursor.moveToFirst()) return new JSONObject().put("found", false);
      return new JSONObject().put("found", true).put("record", new JSONObject(cursor.getString(0))).put("updatedAt", cursor.getString(1));
    }
  }

  synchronized JSONObject listRecords(String entityType, int requestedLimit) throws JSONException {
    if (empty(entityType)) throw new IllegalArgumentException("entityType is required.");
    int limit = Math.max(1, Math.min(requestedLimit, 1000));
    JSONArray records = new JSONArray();
    try (Cursor cursor = getReadableDatabase().query("canonical_records", new String[]{"payload", "updated_at"},
        "entity_type=?", new String[]{entityType}, null, null, "updated_at ASC, entity_id ASC", Integer.toString(limit))) {
      while (cursor.moveToNext()) records.put(new JSONObject(cursor.getString(0)));
    }
    return new JSONObject().put("entityType", entityType).put("records", records).put("count", records.length());
  }

  synchronized JSONObject getOperation(String operationId) throws JSONException {
    if (empty(operationId)) throw new IllegalArgumentException("operationId is required.");
    try (Cursor cursor = getReadableDatabase().query("canonical_operations",
        new String[]{"command", "entity_type", "entity_id", "status", "result_json", "created_at"},
        "operation_id=?", new String[]{operationId}, null, null, null, "1")) {
      if (!cursor.moveToFirst()) return new JSONObject().put("found", false);
      return new JSONObject().put("found", true).put("command", cursor.getString(0))
          .put("entityType", cursor.getString(1)).put("entityId", cursor.getString(2))
          .put("status", cursor.getString(3)).put("outcome", new JSONObject(cursor.getString(4)))
          .put("createdAt", cursor.getString(5));
    }
  }

  private static boolean empty(String value) { return value == null || value.trim().isEmpty(); }
}
