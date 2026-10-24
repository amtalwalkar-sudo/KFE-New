package com.kanishka.pwa;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

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

}
