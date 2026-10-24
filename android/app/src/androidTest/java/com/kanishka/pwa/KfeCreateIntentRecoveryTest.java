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
    JSONObject durableRecord = first.getJSONObject("record");
    String durableRecordId = durableRecord.getString("id");
    String durableOperationId = first.getString("operationId");

    // Simulate the native write succeeding but the app/process losing its acknowledgement
    // before it can mark the intent complete.
    KfeCanonicalWorkStore.Outcome committed = store.putRecord(
        durableOperationId, "TRIP", durableRecord, null, true);
    assertTrue(committed.accepted);

    JSONObject retryProposal = new JSONObject()
        .put("id", "trip-proposal-b-" + suffix)
        .put("shiftId", "shift-" + suffix)
        .put("status", "ACTIVE")
        .put("createdAt", "2026-10-24T12:00:05.000Z")
        .put("updatedAt", "2026-10-24T12:00:05.000Z");
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
    JSONObject nextIntent = store.prepareCreateIntent("TRIP", intentKey, retryProposal);
    assertFalse("A completed intent must not suppress a later legitimate create.", nextIntent.getBoolean("reused"));
    assertTrue("A new create after completion must receive a new identity.",
        !durableRecordId.equals(nextIntent.getJSONObject("record").getString("id")));
  }
}
