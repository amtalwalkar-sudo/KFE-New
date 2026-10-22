package com.kanishka.pwa;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Authoritative native-backed business record boundary.
 *
 * The existing native event queue remains transport only. This store owns
 * canonical JSON business records and commits each record mutation, operation
 * outcome, and audit row in one SQLite transaction.
 */
final class KfeCanonicalWorkStore extends SQLiteOpenHelper {
  private static final String DB_NAME = "kfe_canonical_work.db";
  private static final int DB_VERSION = 2;
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
    db.execSQL("CREATE TABLE canonical_migrations (migration_id TEXT PRIMARY KEY, snapshot_hash TEXT NOT NULL, record_count INTEGER NOT NULL, verified INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, verified_at TEXT)");
    db.execSQL("CREATE TABLE canonical_migration_items (migration_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, payload_hash TEXT NOT NULL, PRIMARY KEY(migration_id, entity_type, entity_id))");
  }

  @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
    if (oldVersion < 2) {
      db.execSQL("CREATE TABLE IF NOT EXISTS canonical_migrations (migration_id TEXT PRIMARY KEY, snapshot_hash TEXT NOT NULL, record_count INTEGER NOT NULL, verified INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, verified_at TEXT)");
      db.execSQL("CREATE TABLE IF NOT EXISTS canonical_migration_items (migration_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, payload_hash TEXT NOT NULL, PRIMARY KEY(migration_id, entity_type, entity_id))");
    }
  }

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
    String now = timestampNow();
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
          JSONObject priorRecord = prior.optJSONObject("record");
          boolean sameRecord = priorRecord != null && ("TRIP".equals(entityType)
              ? jsonEquivalent(withoutTripBoundarySnapshots(priorRecord), withoutTripBoundarySnapshots(record))
              : jsonEquivalent(priorRecord, record));
          if (!sameRecord) {
            throw new IllegalArgumentException("operationId was already used with a different payload.");
          }
          db.setTransactionSuccessful();
          return new Outcome("ACCEPTED".equals(cursor.getString(3)), true, prior);
        }
      }

      // A delayed PWA full-record mirror may be newer in business fields but
      // stale in optional GPS metadata. Existing native boundary snapshots win.
      if ("TRIP".equals(entityType)) {
        try (Cursor current = db.query("canonical_records", new String[]{"payload"},
            "entity_type='TRIP' AND entity_id=?", new String[]{entityId}, null, null, null, "1")) {
          if (current.moveToFirst()) preserveTripBoundaryMetadata(new JSONObject(current.getString(0)), record);
        }
      }
      String payload = record.toString();

      // Android SQLite is authoritative for lifecycle/fare records. Never let a
      // delayed mirror replace a newer canonical payload. ISO-8601 updatedAt
      // values sort chronologically; missing/equal-but-different versions fail
      // closed rather than guessing which snapshot is newer.
      try (Cursor existing = db.query("canonical_records", new String[]{"payload"},
          "entity_type=? AND entity_id=?", new String[]{entityType, entityId}, null, null, null, "1")) {
        if (existing.moveToFirst()) {
          String existingPayload = existing.getString(0);
          if (!jsonEquivalent(new JSONObject(payload), new JSONObject(existingPayload))) {
            String existingVersion = new JSONObject(existingPayload).optString("updatedAt", "");
            String incomingVersion = record.optString("updatedAt", "");
            if (empty(existingVersion) || empty(incomingVersion)) {
              throw new IllegalArgumentException("Canonical version conflict: updatedAt is required to replace an existing record.");
            }
            final int versionOrder;
            try {
              // ISO-8601 strings are not safely ordered lexicographically when
              // their fractional-second precision differs (for example,
              // "...55Z" sorts after the newer "...55.123Z"). Compare instants
              // so a legitimate newer lifecycle write is not rejected.
              versionOrder = java.time.Instant.parse(incomingVersion)
                  .compareTo(java.time.Instant.parse(existingVersion));
            } catch (java.time.format.DateTimeParseException invalidVersion) {
              throw new IllegalArgumentException(
                  "Canonical version conflict: updatedAt must be a valid ISO-8601 instant.", invalidVersion);
            }
            if (versionOrder < 0) {
              throw new IllegalArgumentException("Stale canonical write rejected for " + entityType + "/" + entityId + ".");
            }
            if (versionOrder == 0) {
              throw new IllegalArgumentException("Canonical version conflict: different payloads share updatedAt for " + entityType + "/" + entityId + ".");
            }
          }
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


  /**
   * Atomically merges optional boundary metadata into the latest canonical trip.
   * Keep trip.updatedAt unchanged: a late GPS callback must not stale a durable
   * fare/cancellation event or overwrite a newer business payload.
   */
  synchronized Outcome persistTripBoundarySnapshot(String operationId, String tripId,
      String field, JSONObject snapshot) throws Exception {
    if (empty(operationId) || empty(tripId)) throw new IllegalArgumentException("operationId and tripId are required.");
    if (!"tripStartLocation".equals(field) && !"tripEndLocation".equals(field)) {
      throw new IllegalArgumentException("Unsupported trip-boundary snapshot field.");
    }
    if (snapshot == null) throw new IllegalArgumentException("snapshot is required.");
    Object latitude = snapshot.opt("latitude"), longitude = snapshot.opt("longitude");
    if (!(latitude instanceof Number) || !Double.isFinite(((Number) latitude).doubleValue())
        || ((Number) latitude).doubleValue() < -90d || ((Number) latitude).doubleValue() > 90d
        || !(longitude instanceof Number) || !Double.isFinite(((Number) longitude).doubleValue())
        || ((Number) longitude).doubleValue() < -180d || ((Number) longitude).doubleValue() > 180d) {
      throw new IllegalArgumentException("Snapshot must contain valid latitude and longitude.");
    }
    Object accuracy = snapshot.opt("accuracy");
    if (accuracy != null && accuracy != JSONObject.NULL
        && (!(accuracy instanceof Number) || !Double.isFinite(((Number) accuracy).doubleValue())
            || ((Number) accuracy).doubleValue() < 0d)) {
      throw new IllegalArgumentException("Snapshot accuracy must be blank or a non-negative number.");
    }
    String capturedAt = snapshot.optString("capturedAt", "");
    try {
      if (empty(capturedAt)) throw new IllegalArgumentException("Snapshot provider timestamp is required.");
      java.time.Instant.parse(capturedAt);
    } catch (java.time.format.DateTimeParseException invalidTimestamp) {
      throw new IllegalArgumentException("Snapshot provider timestamp must be a valid ISO-8601 instant.", invalidTimestamp);
    }

    String now = timestampNow();
    SQLiteDatabase db = getWritableDatabase();
    db.beginTransaction();
    try {
      try (Cursor prior = db.query("canonical_operations",
          new String[]{"command", "entity_type", "entity_id", "status", "result_json"},
          "operation_id=?", new String[]{operationId}, null, null, null, "1")) {
        if (prior.moveToFirst()) {
          JSONObject previous = new JSONObject(prior.getString(4));
          if (!"SAVE_TRIP_BOUNDARY_SNAPSHOT".equals(prior.getString(0))
              || !"TRIP".equals(prior.getString(1)) || !tripId.equals(prior.getString(2))
              || !field.equals(previous.optString("field", ""))
              || !jsonEquivalent(previous.optJSONObject("snapshot"), snapshot)) {
            throw new IllegalArgumentException("operationId was already used for a different trip-boundary snapshot.");
          }
          db.setTransactionSuccessful();
          return new Outcome("ACCEPTED".equals(prior.getString(3)), true, previous);
        }
      }

      JSONObject trip;
      try (Cursor current = db.query("canonical_records", new String[]{"payload"},
          "entity_type='TRIP' AND entity_id=?", new String[]{tripId}, null, null, null, "1")) {
        if (!current.moveToFirst()) throw new IllegalArgumentException("Canonical trip does not exist for boundary snapshot.");
        trip = new JSONObject(current.getString(0));
      }

      boolean applied = !trip.has(field) || trip.isNull(field);
      if (applied) {
        trip.put(field, snapshot);
        trip.put("tripStartLocation".equals(field) ? "tripStartLocationStatus" : "tripEndLocationStatus", "CAPTURED");
        ContentValues recordValues = new ContentValues();
        recordValues.put("entity_type", "TRIP");
        recordValues.put("entity_id", tripId);
        recordValues.put("payload", trip.toString());
        recordValues.put("updated_at", now);
        db.insertWithOnConflict("canonical_records", null, recordValues, SQLiteDatabase.CONFLICT_REPLACE);
      }

      JSONObject result = new JSONObject().put("operationId", operationId)
          .put("entityType", "TRIP").put("entityId", tripId).put("field", field)
          .put("snapshot", snapshot).put("applied", applied).put("record", trip).put("committedAt", now);
      ContentValues operation = new ContentValues();
      operation.put("operation_id", operationId);
      operation.put("command", "SAVE_TRIP_BOUNDARY_SNAPSHOT");
      operation.put("entity_type", "TRIP");
      operation.put("entity_id", tripId);
      operation.put("status", "ACCEPTED");
      operation.put("result_json", result.toString());
      operation.put("created_at", now);
      db.insertOrThrow("canonical_operations", null, operation);

      ContentValues audit = new ContentValues();
      audit.put("operation_id", operationId);
      audit.put("entity_type", "TRIP");
      audit.put("entity_id", tripId);
      audit.put("action", "SAVE_TRIP_BOUNDARY_SNAPSHOT");
      audit.put("payload", new JSONObject().put("field", field).put("snapshot", snapshot).put("applied", applied).toString());
      audit.put("created_at", now);
      db.insertOrThrow("canonical_audit", null, audit);

      db.setTransactionSuccessful();
      return new Outcome(true, false, result);
    } finally {
      db.endTransaction();
    }
  }

  /**
   * Persists a locality label onto an already captured trip boundary. This is
   * metadata-only: it never changes business updatedAt, GPS coordinates, or
   * fare/cancellation fields. The operation and audit row commit atomically.
   */
  synchronized Outcome updateTripBoundaryPlaceName(String operationId, String tripId,
      String field, String placeName) throws Exception {
    if (empty(operationId) || empty(tripId)) throw new IllegalArgumentException("operationId and tripId are required.");
    if (!"tripStartLocation".equals(field) && !"tripEndLocation".equals(field)) {
      throw new IllegalArgumentException("Unsupported trip-boundary place-name field.");
    }
    if (empty(placeName) || !placeName.equals(placeName.trim())) {
      throw new IllegalArgumentException("placeName must be a non-empty trimmed locality label.");
    }
    String now = timestampNow();
    SQLiteDatabase db = getWritableDatabase();
    db.beginTransaction();
    try {
      try (Cursor prior = db.query("canonical_operations",
          new String[]{"command", "entity_type", "entity_id", "status", "result_json"},
          "operation_id=?", new String[]{operationId}, null, null, null, "1")) {
        if (prior.moveToFirst()) {
          JSONObject previous = new JSONObject(prior.getString(4));
          if (!"UPDATE_TRIP_BOUNDARY_PLACE_NAME".equals(prior.getString(0))
              || !"TRIP".equals(prior.getString(1)) || !tripId.equals(prior.getString(2))
              || !field.equals(previous.optString("field", ""))
              || !placeName.equals(previous.optString("placeName", ""))) {
            throw new IllegalArgumentException("operationId was already used for a different trip-boundary label.");
          }
          db.setTransactionSuccessful();
          return new Outcome("ACCEPTED".equals(prior.getString(3)), true, previous);
        }
      }
      JSONObject trip;
      try (Cursor current = db.query("canonical_records", new String[]{"payload"},
          "entity_type='TRIP' AND entity_id=?", new String[]{tripId}, null, null, null, "1")) {
        if (!current.moveToFirst()) throw new IllegalArgumentException("Canonical trip does not exist for boundary label.");
        trip = new JSONObject(current.getString(0));
      }
      JSONObject snapshot = trip.optJSONObject(field);
      if (snapshot == null || !snapshot.has("latitude") || !snapshot.has("longitude")
          || !snapshot.has("capturedAt")) {
        throw new IllegalArgumentException("A durable GPS boundary snapshot is required before adding its locality label.");
      }
      snapshot.put("placeName", placeName);
      // Intentionally leave the canonical business updatedAt unchanged.
      ContentValues recordValues = new ContentValues();
      recordValues.put("entity_type", "TRIP");
      recordValues.put("entity_id", tripId);
      recordValues.put("payload", trip.toString());
      recordValues.put("updated_at", now);
      db.insertWithOnConflict("canonical_records", null, recordValues, SQLiteDatabase.CONFLICT_REPLACE);

      JSONObject result = new JSONObject().put("operationId", operationId)
          .put("entityType", "TRIP").put("entityId", tripId).put("field", field)
          .put("placeName", placeName).put("record", trip).put("committedAt", now);
      ContentValues operation = new ContentValues();
      operation.put("operation_id", operationId);
      operation.put("command", "UPDATE_TRIP_BOUNDARY_PLACE_NAME");
      operation.put("entity_type", "TRIP");
      operation.put("entity_id", tripId);
      operation.put("status", "ACCEPTED");
      operation.put("result_json", result.toString());
      operation.put("created_at", now);
      db.insertOrThrow("canonical_operations", null, operation);
      ContentValues audit = new ContentValues();
      audit.put("operation_id", operationId);
      audit.put("entity_type", "TRIP");
      audit.put("entity_id", tripId);
      audit.put("action", "UPDATE_TRIP_BOUNDARY_PLACE_NAME");
      audit.put("payload", new JSONObject().put("field", field).put("placeName", placeName).toString());
      audit.put("created_at", now);
      db.insertOrThrow("canonical_audit", null, audit);
      db.setTransactionSuccessful();
      return new Outcome(true, false, result);
    } finally {
      db.endTransaction();
    }
  }

  /**
   * Commits a native overlay fare/cancellation and the authoritative shift
   * revenue projection in one transaction. This deliberately implements only
   * the stable native command invariants; richer domain rules remain in the PWA.
   */
  synchronized Outcome commitTripForm(String operationId, String mode, JSONObject trip) throws Exception {
    if (empty(operationId)) throw new IllegalArgumentException("operationId is required.");
    if (!"FARE".equals(mode) && !"CANCEL".equals(mode)) throw new IllegalArgumentException("Unsupported trip form mode.");
    if (trip == null || empty(trip.optString("id", "")) || empty(trip.optString("shiftId", ""))) {
      throw new IllegalArgumentException("Trip and shift identity are required.");
    }
    String tripId = trip.optString("id", "");
    String shiftId = trip.optString("shiftId", "");
    if ("FARE".equals(mode) && !"COMPLETED".equals(trip.optString("status", ""))) {
      throw new IllegalArgumentException("Fare submission requires a completed trip.");
    }
    if ("CANCEL".equals(mode) && !"CANCELLED".equals(trip.optString("status", ""))) {
      throw new IllegalArgumentException("Cancellation submission requires a cancelled trip.");
    }
    if ("FARE".equals(mode)) {
      if (!(trip.opt("fareDetailsSkipped") instanceof Boolean)) {
        throw new IllegalArgumentException("fareDetailsSkipped must be explicitly true or false.");
      }
      boolean skipped = trip.optBoolean("fareDetailsSkipped", false);
      Object fare = trip.opt("revenue");
      if (!skipped && (!(fare instanceof Number) || !Double.isFinite(((Number) fare).doubleValue())
          || ((Number) fare).doubleValue() < 0d)) {
        throw new IllegalArgumentException("A valid non-negative fare or skipped-fare flag is required.");
      }
      if (skipped && !(fare == null || fare == JSONObject.NULL || (fare instanceof Number && ((Number) fare).doubleValue() == 0d))) {
        throw new IllegalArgumentException("Skipped fare details must not contribute revenue.");
      }
    } else {
      if (empty(trip.optString("cancelReason", ""))) {
        throw new IllegalArgumentException("Cancellation reason is required.");
      }
      Object fee = trip.has("cancelledRevenue") ? trip.opt("cancelledRevenue") : JSONObject.NULL;
      if (fee != JSONObject.NULL && (!(fee instanceof Number) || !Double.isFinite(((Number) fee).doubleValue())
          || ((Number) fee).doubleValue() < 0d)) {
        throw new IllegalArgumentException("Cancellation fee must be blank/not applicable or a non-negative number.");
      }
      if (fee == JSONObject.NULL) trip.put("cancelledRevenue", 0d);
    }
    String now = timestampNow();
    SQLiteDatabase db = getWritableDatabase();
    db.beginTransaction();
    try {
      try (Cursor prior = db.query("canonical_operations",
          new String[]{"command", "entity_type", "entity_id", "status", "result_json"},
          "operation_id=?", new String[]{operationId}, null, null, null, "1")) {
        if (prior.moveToFirst()) {
          JSONObject previous = new JSONObject(prior.getString(4));
          JSONObject previousTrip = previous.optJSONObject("trip");
          if (!"SUBMIT_TRIP_FORM".equals(prior.getString(0)) || !"TRIP".equals(prior.getString(1))
              || !tripId.equals(prior.getString(2)) || previousTrip == null
              || !jsonEquivalent(withoutTripBoundarySnapshots(previousTrip), withoutTripBoundarySnapshots(trip))
              || !mode.equals(previous.optString("mode", ""))) {
            throw new IllegalArgumentException("operationId was already used for a different trip form.");
          }
          db.setTransactionSuccessful();
          return new Outcome("ACCEPTED".equals(prior.getString(3)), true, previous);
        }
      }

      JSONObject existingTrip;
      try (Cursor current = db.query("canonical_records", new String[]{"payload"},
          "entity_type='TRIP' AND entity_id=?", new String[]{tripId}, null, null, null, "1")) {
        if (!current.moveToFirst()) throw new IllegalArgumentException("Canonical trip does not exist.");
        existingTrip = new JSONObject(current.getString(0));
      }
      if (!shiftId.equals(existingTrip.optString("shiftId", ""))) {
        throw new IllegalArgumentException("Trip shift identity cannot change during form submission.");
      }
      preserveTripBoundaryMetadata(existingTrip, trip);
      String existingStatus = existingTrip.optString("status", "");
      if ("FARE".equals(mode) && !"COMPLETED".equals(existingStatus)) {
        throw new IllegalArgumentException("Fare submission requires the canonical trip to be completed.");
      }
      if ("CANCEL".equals(mode) && !"ACTIVE".equals(existingStatus)) {
        throw new IllegalArgumentException("Cancellation requires a non-terminal active trip.");
      }
      String oldTripVersion = existingTrip.optString("updatedAt", "");
      String newTripVersion = trip.optString("updatedAt", "");
      if (empty(oldTripVersion) || empty(newTripVersion)) {
        throw new IllegalArgumentException("Trip updatedAt is required for a canonical form commit.");
      }
      if (!jsonEquivalent(existingTrip, trip)) {
        int order = java.time.Instant.parse(newTripVersion).compareTo(java.time.Instant.parse(oldTripVersion));
        if (order <= 0) throw new IllegalArgumentException("Stale or conflicting canonical trip form rejected.");
      }

      JSONObject shift;
      try (Cursor currentShift = db.query("canonical_records", new String[]{"payload"},
          "entity_type='SHIFT' AND entity_id=?", new String[]{shiftId}, null, null, null, "1")) {
        if (!currentShift.moveToFirst()) throw new IllegalArgumentException("Canonical shift does not exist.");
        shift = new JSONObject(currentShift.getString(0));
      }
      if (!"ACTIVE".equals(shift.optString("status", ""))) {
        throw new IllegalArgumentException("The canonical shift is no longer active.");
      }

      String tripPayload = trip.toString();
      JSONObject commandPayload = new JSONObject().put("mode", mode).put("trip", trip);
      ContentValues tripValues = new ContentValues();
      tripValues.put("entity_type", "TRIP");
      tripValues.put("entity_id", tripId);
      tripValues.put("payload", tripPayload);
      tripValues.put("updated_at", now);
      db.insertWithOnConflict("canonical_records", null, tripValues, SQLiteDatabase.CONFLICT_REPLACE);

      double revenue = 0d;
      java.time.Instant latest = java.time.Instant.parse(newTripVersion);
      String oldShiftVersion = shift.optString("updatedAt", "");
      if (!empty(oldShiftVersion)) {
        java.time.Instant shiftInstant = java.time.Instant.parse(oldShiftVersion);
        if (shiftInstant.isAfter(latest)) latest = shiftInstant;
      }
      try (Cursor trips = db.query("canonical_records", new String[]{"payload"},
          "entity_type='TRIP'", null, null, null, null)) {
        while (trips.moveToNext()) {
          JSONObject item = new JSONObject(trips.getString(0));
          if (!shiftId.equals(item.optString("shiftId", ""))
              || item.has("deletedAt") && !item.isNull("deletedAt")
              || item.optBoolean("deleted", false)) continue;
          String status = item.optString("status", "");
          if ("COMPLETED".equals(status) && !item.optBoolean("fareDetailsSkipped", false)) {
            Object amount = item.opt("revenue");
            if (amount instanceof Number && Double.isFinite(((Number) amount).doubleValue())
                && ((Number) amount).doubleValue() >= 0d) revenue += ((Number) amount).doubleValue();
          } else if ("CANCELLED".equals(status)) {
            Object amount = item.has("cancelledRevenue") ? item.opt("cancelledRevenue") : JSONObject.NULL;
            if (amount instanceof Number && Double.isFinite(((Number) amount).doubleValue())
                && ((Number) amount).doubleValue() >= 0d) revenue += ((Number) amount).doubleValue();
          }
          String itemVersion = item.optString("updatedAt", "");
          if (!empty(itemVersion)) {
            java.time.Instant itemInstant = java.time.Instant.parse(itemVersion);
            if (itemInstant.isAfter(latest)) latest = itemInstant;
          }
        }
      }
      java.time.Instant nowInstant = java.time.Instant.parse(now);
      if (!nowInstant.isAfter(latest)) latest = latest.plusMillis(1);
      String shiftUpdatedAt = latest.toString();
      shift.put("revenue", revenue);
      shift.put("liveFareRevenue", revenue);
      shift.put("revenueSource", "TRIP_FARES");
      shift.put("updatedAt", shiftUpdatedAt);
      ContentValues shiftValues = new ContentValues();
      shiftValues.put("entity_type", "SHIFT");
      shiftValues.put("entity_id", shiftId);
      shiftValues.put("payload", shift.toString());
      shiftValues.put("updated_at", now);
      db.insertWithOnConflict("canonical_records", null, shiftValues, SQLiteDatabase.CONFLICT_REPLACE);

      JSONObject result = new JSONObject().put("operationId", operationId).put("mode", mode)
          .put("tripId", tripId).put("shiftId", shiftId).put("trip", trip)
          .put("shift", shift).put("revenue", revenue).put("committedAt", now);
      ContentValues operation = new ContentValues();
      operation.put("operation_id", operationId);
      operation.put("command", "SUBMIT_TRIP_FORM");
      operation.put("entity_type", "TRIP");
      operation.put("entity_id", tripId);
      operation.put("status", "ACCEPTED");
      operation.put("result_json", result.toString());
      operation.put("created_at", now);
      db.insertOrThrow("canonical_operations", null, operation);
      ContentValues audit = new ContentValues();
      audit.put("operation_id", operationId);
      audit.put("entity_type", "TRIP");
      audit.put("entity_id", tripId);
      audit.put("action", "SUBMIT_TRIP_FORM_" + mode);
      audit.put("payload", commandPayload.toString());
      audit.put("created_at", now);
      db.insertOrThrow("canonical_audit", null, audit);

      db.setTransactionSuccessful();
      return new Outcome(true, false, result);
    } finally {
      db.endTransaction();
    }
  }


  synchronized JSONObject migrateLegacySnapshot(String migrationId, JSONObject snapshot) throws Exception {
    if (empty(migrationId)) throw new IllegalArgumentException("migrationId is required.");
    if (snapshot == null || !(snapshot.opt("entities") instanceof JSONObject)) {
      throw new IllegalArgumentException("snapshot.entities is required.");
    }
    JSONObject entities = snapshot.getJSONObject("entities");
    String snapshotHash = sha256(snapshot.toString());
    String now = timestampNow();
    SQLiteDatabase db = getWritableDatabase();
    db.beginTransaction();
    try {
      try (Cursor cursor = db.query("canonical_migrations", new String[]{"snapshot_hash", "record_count", "verified"},
          "migration_id=?", new String[]{migrationId}, null, null, null, "1")) {
        if (cursor.moveToFirst()) {
          if (!snapshotHash.equals(cursor.getString(0))) {
            throw new IllegalArgumentException("migrationId was already used with a different source snapshot.");
          }
          db.setTransactionSuccessful();
          return new JSONObject().put("migrationId", migrationId).put("snapshotHash", snapshotHash)
              .put("recordCount", cursor.getInt(1)).put("verified", cursor.getInt(2) == 1).put("duplicate", true);
        }
      }
      int importedCount = 0;
      JSONArray entityNames = entities.names();
      if (entityNames == null) throw new IllegalArgumentException("snapshot.entities must not be empty.");
      for (int i = 0; i < entityNames.length(); i++) {
        String entityType = entityNames.getString(i);
        JSONArray records = entities.optJSONArray(entityType);
        if (records == null) throw new IllegalArgumentException("Migration entity must be an array: " + entityType);
        for (int j = 0; j < records.length(); j++) {
          JSONObject record = records.optJSONObject(j);
          if (record == null) throw new IllegalArgumentException("Migration records must be objects.");
          String entityId = record.optString("id", "");
          if (empty(entityId)) throw new IllegalArgumentException("Migration record id is required for " + entityType);
          String payload = record.toString();
          String payloadHash = sha256(payload);
          try (Cursor existing = db.query("canonical_records", new String[]{"payload"},
              "entity_type=? AND entity_id=?", new String[]{entityType, entityId}, null, null, null, "1")) {
            if (existing.moveToFirst()) {
              if (!payload.equals(existing.getString(0))) {
                throw new IllegalArgumentException("Migration conflict: native record differs for " + entityType + "/" + entityId);
              }
            } else {
              ContentValues values = new ContentValues();
              values.put("entity_type", entityType);
              values.put("entity_id", entityId);
              values.put("payload", payload);
              values.put("updated_at", record.optString("updatedAt", now));
              db.insertOrThrow("canonical_records", null, values);
            }
          }
          ContentValues item = new ContentValues();
          item.put("migration_id", migrationId);
          item.put("entity_type", entityType);
          item.put("entity_id", entityId);
          item.put("payload_hash", payloadHash);
          db.insertOrThrow("canonical_migration_items", null, item);
          importedCount++;
        }
      }
      ContentValues migration = new ContentValues();
      migration.put("migration_id", migrationId);
      migration.put("snapshot_hash", snapshotHash);
      migration.put("record_count", importedCount);
      migration.put("verified", 0);
      migration.put("created_at", now);
      db.insertOrThrow("canonical_migrations", null, migration);
      db.setTransactionSuccessful();
      return new JSONObject().put("migrationId", migrationId).put("snapshotHash", snapshotHash)
          .put("recordCount", importedCount).put("verified", false).put("duplicate", false);
    } finally {
      db.endTransaction();
    }
  }

  synchronized JSONObject verifyLegacyMigration(String migrationId) throws Exception {
    if (empty(migrationId)) throw new IllegalArgumentException("migrationId is required.");
    SQLiteDatabase db = getWritableDatabase();
    db.beginTransaction();
    try {
      String expectedHash;
      int expectedCount;
      try (Cursor migration = db.query("canonical_migrations", new String[]{"snapshot_hash", "record_count"},
          "migration_id=?", new String[]{migrationId}, null, null, null, "1")) {
        if (!migration.moveToFirst()) throw new IllegalArgumentException("Migration has not been imported.");
        expectedHash = migration.getString(0);
        expectedCount = migration.getInt(1);
      }
      int verifiedCount = 0;
      try (Cursor items = db.query("canonical_migration_items", new String[]{"entity_type", "entity_id", "payload_hash"},
          "migration_id=?", new String[]{migrationId}, null, null, null)) {
        while (items.moveToNext()) {
          String entityType = items.getString(0), entityId = items.getString(1), expectedPayloadHash = items.getString(2);
          try (Cursor record = db.query("canonical_records", new String[]{"payload"},
              "entity_type=? AND entity_id=?", new String[]{entityType, entityId}, null, null, null, "1")) {
            if (!record.moveToFirst() || !expectedPayloadHash.equals(sha256(record.getString(0)))) {
              throw new IllegalStateException("Migration verification failed for " + entityType + "/" + entityId);
            }
          }
          verifiedCount++;
        }
      }
      if (verifiedCount != expectedCount) throw new IllegalStateException("Migration record count mismatch.");
      ContentValues verified = new ContentValues();
      verified.put("verified", 1);
      verified.put("verified_at", timestampNow());
      db.update("canonical_migrations", verified, "migration_id=?", new String[]{migrationId});
      db.setTransactionSuccessful();
      return new JSONObject().put("migrationId", migrationId).put("snapshotHash", expectedHash)
          .put("recordCount", verifiedCount).put("verified", true);
    } finally {
      db.endTransaction();
    }
  }

  synchronized JSONObject getMigration(String migrationId) throws JSONException {
    if (empty(migrationId)) throw new IllegalArgumentException("migrationId is required.");
    try (Cursor cursor = getReadableDatabase().query("canonical_migrations",
        new String[]{"snapshot_hash", "record_count", "verified", "created_at", "verified_at"},
        "migration_id=?", new String[]{migrationId}, null, null, null, "1")) {
      if (!cursor.moveToFirst()) return new JSONObject().put("found", false);
      return new JSONObject().put("found", true).put("migrationId", migrationId)
          .put("snapshotHash", cursor.getString(0)).put("recordCount", cursor.getInt(1))
          .put("verified", cursor.getInt(2) == 1).put("createdAt", cursor.getString(3))
          .put("verifiedAt", cursor.isNull(4) ? JSONObject.NULL : cursor.getString(4));
    }
  }

  private static String sha256(String value) throws Exception {
    byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
    StringBuilder out = new StringBuilder();
    for (byte item : digest) out.append(String.format(java.util.Locale.US, "%02x", item & 0xff));
    return out.toString();
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

  private static void preserveTripBoundaryMetadata(JSONObject existing, JSONObject incoming) throws JSONException {
    if (existing == null || incoming == null) return;
    for (String field : new String[]{"tripStartLocation", "tripEndLocation"}) {
      if (existing.has(field) && !existing.isNull(field)) {
        incoming.put(field, existing.get(field));
        String statusField = "tripStartLocation".equals(field) ? "tripStartLocationStatus" : "tripEndLocationStatus";
        if (existing.has(statusField) && !existing.isNull(statusField)) incoming.put(statusField, existing.get(statusField));
      }
    }
  }

  private static JSONObject withoutTripBoundarySnapshots(JSONObject trip) throws JSONException {
    JSONObject copy = new JSONObject(trip.toString());
    copy.remove("tripStartLocation");
    copy.remove("tripEndLocation");
    copy.remove("tripStartLocationStatus");
    copy.remove("tripEndLocationStatus");
    return copy;
  }

  private static boolean jsonEquivalent(Object left, Object right) throws JSONException {
    if (left == right) return true;
    if (left == null || right == null) return false;
    if (left instanceof JSONObject && right instanceof JSONObject) {
      JSONObject a = (JSONObject) left, b = (JSONObject) right;
      if (a.length() != b.length()) return false;
      java.util.Iterator<String> keys = a.keys();
      while (keys.hasNext()) {
        String key = keys.next();
        if (!b.has(key) || !jsonEquivalent(a.opt(key), b.opt(key))) return false;
      }
      return true;
    }
    if (left instanceof JSONArray && right instanceof JSONArray) {
      JSONArray a = (JSONArray) left, b = (JSONArray) right;
      if (a.length() != b.length()) return false;
      for (int i = 0; i < a.length(); i++) {
        if (!jsonEquivalent(a.opt(i), b.opt(i))) return false;
      }
      return true;
    }
    if (left instanceof Number && right instanceof Number) {
      return Double.compare(((Number) left).doubleValue(), ((Number) right).doubleValue()) == 0;
    }
    return left.equals(right);
  }

  private static String timestampNow() {
    java.text.SimpleDateFormat format = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US);
    format.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
    return format.format(new java.util.Date());
  }

  private static boolean empty(String value) { return value == null || value.trim().isEmpty(); }
}
