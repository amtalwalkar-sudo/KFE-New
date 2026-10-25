package com.kanishka.pwa;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Crash/retry contract for the durable SQLite create-intent journal. */
@RunWith(AndroidJUnit4.class)
public class KfeCreateIntentRecoveryTest {
  @Test public void pendingCreateIntentReusesIdentityAndOperationAfterLostAcknowledgement() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    String suffix = Long.toString(System.currentTimeMillis());
    String intentKey = "crash-retry-trip-" + suffix;
    JSONObject firstProposal = new JSONObject()
        .put("id", "trip-proposal-a-" + suffix)
        .put("shiftId", "shift-" + suffix)
        .put("status", "ACTIVE")
        .put("createdAt", "2026-10-24T12:00:00.000Z")
        .put("updatedAt", "2026-10-24T12:00:00.000Z");

    JSONObject first = store.prepareCreateIntent("TRIP", intentKey, firstProposal);
    assertFalse("First request must create a new pending intent.", first.getBoolean("reused"));
    assertEquals("PENDING", first.getString("status"));
    JSONObject durableRecord = first.getJSONObject("record");
    String durableRecordId = durableRecord.getString("id");
    String durableOperationId = first.getString("operationId");

    JSONObject retryProposal = new JSONObject()
        .put("id", "trip-proposal-b-" + suffix)
        .put("shiftId", "shift-" + suffix)
        .put("status", "ACTIVE")
        .put("createdAt", "2026-10-24T12:00:05.000Z")
        .put("updatedAt", "2026-10-24T12:00:05.000Z");

    // Simulate process death after journaling but before the canonical write.
    store.close();
    JSONObject retryBeforeCommit = store.prepareCreateIntent("TRIP", intentKey, retryProposal);
    assertTrue("Retry before commit must reuse the pending intent.", retryBeforeCommit.getBoolean("reused"));
    assertEquals(first.getString("intentId"), retryBeforeCommit.getString("intentId"));
    assertEquals(durableOperationId, retryBeforeCommit.getString("operationId"));
    assertEquals(durableRecordId, retryBeforeCommit.getJSONObject("record").getString("id"));

    // Simulate the native write succeeding but the app/process losing its acknowledgement
    // before it can mark the intent complete.
    KfeCanonicalWorkStore.Outcome committed = store.putRecord(
        durableOperationId, "TRIP", durableRecord, null, true);
    assertTrue(committed.accepted);

    // Close the SQLiteOpenHelper and reopen it on the retry path. This verifies
    // that the intent and original record identity survive storage/process teardown.
    store.close();
    JSONObject retry = store.prepareCreateIntent("TRIP", intentKey, retryProposal);
    assertTrue("Retry must recover the still-pending intent.", retry.getBoolean("reused"));
    assertEquals(first.getString("intentId"), retry.getString("intentId"));
    assertEquals(durableOperationId, retry.getString("operationId"));
    assertEquals(durableRecordId, retry.getJSONObject("record").getString("id"));

    KfeCanonicalWorkStore.Outcome replay = store.putRecord(
        retry.getString("operationId"), "TRIP", retry.getJSONObject("record"), null, true);
    assertTrue("Lost-ack retry must be accepted.", replay.accepted);
    assertTrue("Replay must not create a second canonical operation.", replay.duplicate);
    assertEquals(durableRecordId, store.getRecord("TRIP", durableRecordId).getJSONObject("record").getString("id"));

    JSONObject completed = store.completeCreateIntent(retry.getString("intentId"));
    assertTrue(completed.getBoolean("completed"));
    JSONObject completedRetry = store.prepareCreateIntent("TRIP", intentKey, retryProposal);
    assertTrue("Retry after the final acknowledgement is lost must reuse the completed intent.", completedRetry.getBoolean("reused"));
    assertEquals("COMPLETED", completedRetry.getString("status"));
    assertEquals(first.getString("intentId"), completedRetry.getString("intentId"));
    assertEquals(durableOperationId, completedRetry.getString("operationId"));
    assertEquals(durableRecordId, completedRetry.getJSONObject("record").getString("id"));

    // A genuinely new user submission has a fresh durable token and may create a new Trip.
    JSONObject nextIntent = store.prepareCreateIntent("TRIP", intentKey + "-new-submission", retryProposal);
    assertFalse("A new submission token must create a new intent.", nextIntent.getBoolean("reused"));
    assertTrue("A new create must receive a new identity.",
        !durableRecordId.equals(nextIntent.getJSONObject("record").getString("id")));
  }
  @Test public void shiftCreateIntentAlsoSurvivesRestartAndReusesRecordIdentity() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    String suffix = Long.toString(System.currentTimeMillis());
    String intentKey = "crash-retry-shift-" + suffix;
    JSONObject proposal = new JSONObject()
        .put("id", "shift-proposal-a-" + suffix)
        .put("startOdometer", 12000)
        .put("status", "ACTIVE")
        .put("createdAt", "2026-10-24T12:00:00.000Z")
        .put("updatedAt", "2026-10-24T12:00:00.000Z");
    JSONObject first = store.prepareCreateIntent("SHIFT", intentKey, proposal);
    String recordId = first.getJSONObject("record").getString("id");
    String operationId = first.getString("operationId");
    KfeCanonicalWorkStore.Outcome commit = store.putRecord(operationId, "SHIFT", first.getJSONObject("record"), null, true);
    assertTrue(commit.accepted);

    // Simulate process/database teardown after the native commit but before intent completion.
    store.close();
    JSONObject retry = store.prepareCreateIntent("SHIFT", intentKey,
        new JSONObject().put("id", "shift-proposal-b-" + suffix).put("startOdometer", 12000)
            .put("status", "ACTIVE").put("createdAt", "2026-10-24T12:00:05.000Z")
            .put("updatedAt", "2026-10-24T12:00:05.000Z"));
    assertTrue(retry.getBoolean("reused"));
    assertEquals(recordId, retry.getJSONObject("record").getString("id"));
    assertEquals(operationId, retry.getString("operationId"));
    KfeCanonicalWorkStore.Outcome replay = store.putRecord(
        retry.getString("operationId"), "SHIFT", retry.getJSONObject("record"), null, true);
    assertTrue(replay.accepted);
    assertTrue(replay.duplicate);
    assertEquals(recordId, store.getRecord("SHIFT", recordId).getJSONObject("record").getString("id"));
  }


  @Test public void prepareCreateIntentProcessDeathAtDurableBoundary() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    android.os.Bundle args = InstrumentationRegistry.getArguments();
    String entityType = args.getString("createEntityType", "TRIP");
    String boundary = args.getString("createBoundary", "AFTER_INTENT");
    assertTrue("Create-intent process-death test supports SHIFT or TRIP.", entityType.equals("SHIFT") || entityType.equals("TRIP"));
    assertTrue("Create-intent process-death boundary must be AFTER_INTENT or AFTER_CANONICAL.",
        boundary.equals("AFTER_INTENT") || boundary.equals("AFTER_CANONICAL"));

    String suffix = Long.toString(System.currentTimeMillis());
    String intentKey = "process-death-" + entityType.toLowerCase() + "-" + suffix;
    String parentShiftId = "create-intent-parent-shift-" + suffix;
    String proposedId = "create-intent-proposal-" + entityType.toLowerCase() + "-" + suffix;
    SharedPreferences prefs = context.getSharedPreferences("kfe_overlay", Context.MODE_PRIVATE);
    prefs.edit()
        .putString("createIntentDeathEntityType", entityType)
        .putString("createIntentDeathBoundary", boundary)
        .putString("createIntentDeathKey", intentKey)
        .putString("createIntentDeathParentShiftId", parentShiftId)
        .putString("createIntentDeathIntentId", "")
        .putString("createIntentDeathOperationId", "")
        .putString("createIntentDeathRecordId", "")
        .putString("createIntentDeathReady", "")
        .commit();

    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    if (entityType.equals("TRIP")) {
      assertTrue("Trip fixture parent shift must be durable.",
          store.putRecord("create-intent-parent-create-" + suffix, "SHIFT",
              new JSONObject().put("id", parentShiftId).put("status", "ACTIVE")
                  .put("revenue", 0d).put("updatedAt", java.time.Instant.now().toString())).accepted);
    }
    JSONObject proposal = new JSONObject()
        .put("id", proposedId)
        .put("status", "ACTIVE")
        .put("createdAt", "2026-10-25T00:00:00.000Z")
        .put("updatedAt", "2026-10-25T00:00:00.000Z");
    if (entityType.equals("SHIFT")) proposal.put("startOdometer", 12000);
    else proposal.put("shiftId", parentShiftId).put("tripStage", "GOING_TO_PICKUP");

    JSONObject intent = store.prepareCreateIntent(entityType, intentKey, proposal);
    String intentId = intent.getString("intentId");
    String operationId = intent.getString("operationId");
    String recordId = intent.getJSONObject("record").getString("id");
    assertEquals("New intent must begin pending.", "PENDING", intent.getString("status"));
    prefs.edit()
        .putString("createIntentDeathIntentId", intentId)
        .putString("createIntentDeathOperationId", operationId)
        .putString("createIntentDeathRecordId", recordId)
        .commit();

    if (boundary.equals("AFTER_CANONICAL")) {
      KfeCanonicalWorkStore.Outcome committed = store.putRecord(
          operationId, entityType, intent.getJSONObject("record"), null, true);
      assertTrue("Canonical record must commit before the simulated lost completion acknowledgement.", committed.accepted);
      assertTrue("Initial canonical commit must not be classified as a retry.", !committed.duplicate);
    } else {
      assertTrue("Canonical record must not exist before the intent is replayed.",
          !store.getRecord(entityType, recordId).optBoolean("found", false));
    }

    prefs.edit().putString("createIntentDeathReady", entityType + "_" + boundary).commit();
    android.util.Log.i("KFE_CREATE_INTENT_DEATH",
        "READY_FOR_PROCESS_KILL entityType=" + entityType + " boundary=" + boundary + " recordId=" + recordId);
    // The exact-APK gate SIGKILLs the app at this point. For AFTER_CANONICAL,
    // the canonical record exists but the intent-completion acknowledgement does not.
    for (int i = 0; i < 90; i++) android.os.SystemClock.sleep(1000L);
    throw new AssertionError("CI harness did not kill the app at " + entityType + "/" + boundary);
  }

  @Test public void verifyCreateIntentProcessDeathRecovery() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    SharedPreferences prefs = context.getSharedPreferences("kfe_overlay", Context.MODE_PRIVATE);
    String entityType = prefs.getString("createIntentDeathEntityType", "");
    String boundary = prefs.getString("createIntentDeathBoundary", "");
    String intentKey = prefs.getString("createIntentDeathKey", "");
    String parentShiftId = prefs.getString("createIntentDeathParentShiftId", "");
    String expectedIntentId = prefs.getString("createIntentDeathIntentId", "");
    String expectedOperationId = prefs.getString("createIntentDeathOperationId", "");
    String expectedRecordId = prefs.getString("createIntentDeathRecordId", "");
    assertEquals("Harness must kill the app at the requested create-intent boundary.",
        entityType + "_" + boundary, prefs.getString("createIntentDeathReady", ""));
    assertTrue("Intent identity must survive process death.", !expectedIntentId.isEmpty());
    assertTrue("Operation identity must survive process death.", !expectedOperationId.isEmpty());
    assertTrue("Record identity must survive process death.", !expectedRecordId.isEmpty());

    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    JSONObject retryProposal = new JSONObject()
        .put("id", "different-proposal-after-process-death")
        .put("status", "ACTIVE")
        .put("createdAt", "2026-10-25T00:00:05.000Z")
        .put("updatedAt", "2026-10-25T00:00:05.000Z");
    if (entityType.equals("SHIFT")) retryProposal.put("startOdometer", 12000);
    else retryProposal.put("shiftId", parentShiftId).put("tripStage", "GOING_TO_PICKUP");

    JSONObject retryIntent = store.prepareCreateIntent(entityType, intentKey, retryProposal);
    assertTrue("Retry after process death must reuse the durable intent.", retryIntent.getBoolean("reused"));
    assertEquals(expectedIntentId, retryIntent.getString("intentId"));
    assertEquals(expectedOperationId, retryIntent.getString("operationId"));
    assertEquals(expectedRecordId, retryIntent.getJSONObject("record").getString("id"));

    JSONObject beforeReplay = store.getRecord(entityType, expectedRecordId);
    if (boundary.equals("AFTER_INTENT")) {
      assertTrue("No canonical record should appear before replay after an intent-only interruption.",
          !beforeReplay.optBoolean("found", false));
    } else {
      assertTrue("Canonical record committed before process death must survive restart.",
          beforeReplay.optBoolean("found", false));
    }

    KfeCanonicalWorkStore.Outcome replay = store.putRecord(
        retryIntent.getString("operationId"), entityType, retryIntent.getJSONObject("record"), null, true);
    assertTrue("Recovery replay must be accepted.", replay.accepted);
    assertEquals("Replay is duplicate only when canonical commit preceded process death.",
        boundary.equals("AFTER_CANONICAL"), replay.duplicate);
    JSONObject completed = store.completeCreateIntent(expectedIntentId);
    assertTrue("Intent completion must be durable after canonical acknowledgement.", completed.getBoolean("completed"));

    JSONObject completedRetry = store.prepareCreateIntent(entityType, intentKey, retryProposal);
    assertTrue("A retry after final acknowledgement loss must reuse the completed intent.", completedRetry.getBoolean("reused"));
    assertEquals("COMPLETED", completedRetry.getString("status"));
    assertEquals(expectedIntentId, completedRetry.getString("intentId"));
    assertEquals(expectedOperationId, completedRetry.getString("operationId"));
    assertEquals(expectedRecordId, completedRetry.getJSONObject("record").getString("id"));
    assertEquals(expectedRecordId, store.getRecord(entityType, expectedRecordId).getJSONObject("record").getString("id"));

    if (entityType.equals("TRIP")) {
      JSONArray trips = store.listRecords("TRIP", 1000).getJSONArray("records");
      int matches = 0;
      for (int i = 0; i < trips.length(); i++) {
        JSONObject trip = trips.optJSONObject(i);
        if (trip != null && expectedRecordId.equals(trip.optString("id", ""))
            && parentShiftId.equals(trip.optString("shiftId", ""))) matches++;
      }
      assertEquals("Create-intent recovery must leave exactly one trip with the original identity.", 1, matches);
    }

    android.util.Log.i("KFE_CREATE_INTENT_DEATH",
        "CREATE_INTENT_PROCESS_DEATH_CASE_PASS entityType=" + entityType + " boundary=" + boundary);
    prefs.edit()
        .remove("createIntentDeathEntityType").remove("createIntentDeathBoundary")
        .remove("createIntentDeathKey").remove("createIntentDeathParentShiftId")
        .remove("createIntentDeathIntentId").remove("createIntentDeathOperationId")
        .remove("createIntentDeathRecordId").remove("createIntentDeathReady").commit();
  }

}
