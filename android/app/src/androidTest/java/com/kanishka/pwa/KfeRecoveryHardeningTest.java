package com.kanishka.pwa;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;


import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;


/**
 * Failure-oriented tests for durable native work records and canonical idempotency.
 */
@RunWith(AndroidJUnit4.class)
public class KfeRecoveryHardeningTest {
  private Context context;

  @Before public void setUp() {
    context = InstrumentationRegistry.getInstrumentation().getTargetContext();
  }

  @Test public void nativeEventQueueReadFailureMustNotMasqueradeAsSuccessfulEmptyRecovery() throws Exception {
    KfeNativeEventStore store = KfeNativeEventStore.get(context);
    KfeNativeEventStore.failPendingReadForTests = true;
    try {
      store.pending(100);
      fail("A failed durable queue read must not return an empty array as successful recovery.");
    } catch (IllegalStateException expected) {
      assertTrue("Failure must explicitly identify incomplete recovery.",
          expected.getMessage().contains("recovery is incomplete")
              || expected.getMessage().contains("Injected native event queue read failure"));
    } finally {
      KfeNativeEventStore.failPendingReadForTests = false;
    }
    // Verify the queue remains readable after the injected fault is removed.
    assertNotNull("The event queue must recover after the temporary read failure.", store.pending(100));
  }

  @Test public void canonicalWritesRemainIdempotentAfterLostAcknowledgementAndRejectStaleSnapshots() throws Exception {
    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    String suffix = Long.toString(System.currentTimeMillis());
    String shiftId = "recovery-shift-" + suffix;
    String tripA = "recovery-trip-a-" + suffix;
    String tripB = "recovery-trip-b-" + suffix;
    String shiftOperation = "recovery-shift-op-" + suffix;
    String fareAOperation = "recovery-fare-a-op-" + suffix;
    String fareBOperation = "recovery-fare-b-op-" + suffix;
    String t1 = "2026-10-16T01:00:00.000Z";
    String t2 = "2026-10-16T01:01:00.000Z";

    JSONObject fareA = new JSONObject().put("id", tripA).put("shiftId", shiftId)
        .put("status", "COMPLETED").put("fare", 250).put("updatedAt", t1);
    JSONObject fareB = new JSONObject().put("id", tripB).put("shiftId", shiftId)
        .put("status", "COMPLETED").put("fare", 150).put("updatedAt", t2);
    JSONObject shift = new JSONObject().put("id", shiftId).put("status", "ACTIVE")
        .put("revenue", 400).put("updatedAt", t2);

    assertLostAckRetryIsIdempotent(store, fareAOperation, "TRIP", fareA);
    JSONObject reusedOperationWithDifferentPayload = new JSONObject(fareA.toString()).put("fare", 999);
    try {
      store.putRecord(fareAOperation, "TRIP", reusedOperationWithDifferentPayload);
      fail("Expected operation-ID reuse with a changed payload to be rejected.");
    } catch (IllegalArgumentException expected) {
      assertTrue("Unexpected rejection: " + expected.getMessage(),
          expected.getMessage().contains("operationId was already used with a different payload"));
    }
    assertTrue("Rejecting changed-payload replay must preserve the original operation outcome.",
        store.getOperation(fareAOperation).getBoolean("found"));
    assertEquals("Rejected operation-ID reuse must not change the committed fare.", 250,
        store.getRecord("TRIP", tripA).getJSONObject("record").getInt("fare"));
    assertLostAckRetryIsIdempotent(store, fareBOperation, "TRIP", fareB);
    assertLostAckRetryIsIdempotent(store, shiftOperation, "SHIFT", shift);

    assertEquals(250, store.getRecord("TRIP", tripA).getJSONObject("record").getInt("fare"));
    assertEquals(150, store.getRecord("TRIP", tripB).getJSONObject("record").getInt("fare"));
    assertEquals(400, store.getRecord("SHIFT", shiftId).getJSONObject("record").getInt("revenue"));
    assertEquals("A repeated read after an acknowledgement retry must not increment revenue again.", 400,
        store.getRecord("SHIFT", shiftId).getJSONObject("record").getInt("revenue"));

    JSONObject stale = new JSONObject(shift.toString()).put("revenue", 250).put("updatedAt", t1);
    assertRejectedWrite(store, "recovery-stale-op-" + suffix, "SHIFT", stale, "Stale canonical write rejected");
    JSONObject equalVersionConflict = new JSONObject(shift.toString()).put("revenue", 999);
    assertRejectedWrite(store, "recovery-equal-op-" + suffix, "SHIFT", equalVersionConflict,
        "different payloads share updatedAt");
    assertEquals("Rejected stale/conflicting snapshots must not roll back the acknowledged projection.", 400,
        store.getRecord("SHIFT", shiftId).getJSONObject("record").getInt("revenue"));

    assertAuditCount(store, fareAOperation, 1);
    assertAuditCount(store, fareBOperation, 1);
    assertAuditCount(store, shiftOperation, 1);
  }

  private static void assertLostAckRetryIsIdempotent(KfeCanonicalWorkStore store, String operationId,
      String entityType, JSONObject record) throws Exception {
    KfeCanonicalWorkStore.Outcome committed = store.putRecord(operationId, entityType, record);
    assertTrue("First write must commit before the simulated acknowledgement is lost.", committed.accepted);
    // The process/bridge loses the response after SQLite commits. Retrying the
    // same operation ID must return the persisted outcome instead of applying it twice.
    KfeCanonicalWorkStore.Outcome retry = store.putRecord(operationId, entityType, record);
    assertTrue("Retry must report the already committed operation as accepted.", retry.accepted);
    assertTrue("Retry must be identified as a duplicate operation.", retry.duplicate);
    assertTrue(store.getOperation(operationId).getBoolean("found"));
  }

  private static void assertRejectedWrite(KfeCanonicalWorkStore store, String operationId,
      String entityType, JSONObject record, String expectedMessage) throws Exception {
    try {
      store.putRecord(operationId, entityType, record);
      fail("Expected canonical write to be rejected: " + expectedMessage);
    } catch (IllegalArgumentException expected) {
      assertTrue("Unexpected rejection: " + expected.getMessage(),
          expected.getMessage().contains(expectedMessage));
    }
    assertFalse(store.getOperation(operationId).optBoolean("found", false));
  }

  private static void assertAuditCount(KfeCanonicalWorkStore store, String operationId, int expected) {
    SQLiteDatabase db = store.getReadableDatabase();
    try (Cursor cursor = db.query("canonical_audit", new String[]{"operation_id"},
        "operation_id=?", new String[]{operationId}, null, null, null)) {
      assertEquals("One durable audit row must exist per logical operation.", expected, cursor.getCount());
    }
  }

}
