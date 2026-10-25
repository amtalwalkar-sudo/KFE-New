package com.kanishka.pwa;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Exercises native reset barriers, active-shift protection, and process-death retry. */
@RunWith(AndroidJUnit4.class)
public class KfeCanonicalResetProtocolTest {
  @Test public void resetBlocksActiveShiftAndResumesIdempotentlyAfterStoreReopen() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    String databaseName = "kfe_canonical_reset_test_" + System.currentTimeMillis() + ".db";
    String suffix = Long.toString(System.currentTimeMillis());
    String shiftId = "reset-test-shift-" + suffix;
    String resetId = "reset-test-" + suffix;
    KfeCanonicalWorkStore store = new KfeCanonicalWorkStore(context, databaseName);
    try {
      JSONObject activeShift = new JSONObject()
          .put("id", shiftId).put("status", "ACTIVE")
          .put("updatedAt", "2026-10-25T10:00:00.000Z");
      assertTrue(store.putRecord("reset-test-create-" + suffix, "SHIFT", activeShift).accepted);
      try {
        store.beginReset(resetId);
        fail("Reset must reject an active canonical shift.");
      } catch (IllegalStateException expected) {
        assertTrue(expected.getMessage().contains("active"));
      }

      JSONObject completedShift = new JSONObject(activeShift.toString())
          .put("status", "COMPLETED").put("updatedAt", "2026-10-25T10:01:00.000Z");
      assertTrue(store.putRecord("reset-test-close-" + suffix, "SHIFT", completedShift).accepted);
      assertEquals("PREPARED", store.beginReset(resetId).getString("state"));

      // Simulate process death after the durable intent commit but before clear.
      store.close();
      store = new KfeCanonicalWorkStore(context, databaseName);
      JSONObject recovered = store.getResetState();
      assertTrue(recovered.getBoolean("found"));
      assertEquals(resetId, recovered.getString("resetId"));
      assertEquals("PREPARED", recovered.getString("state"));

      try {
        store.prepareCreateIntent("TRIP", "reset-test-intent-" + suffix,
            new JSONObject().put("id", "reset-test-trip-" + suffix));
        fail("Create intents must be blocked while reset is pending.");
      } catch (IllegalStateException expected) {
        assertTrue(expected.getMessage().contains("reset"));
      }

      assertEquals("CLEARED", store.clearForReset(resetId).getString("state"));
      assertFalse(store.getRecord("SHIFT", shiftId).getBoolean("found"));
      assertEquals("CLEARED", store.clearForReset(resetId).getString("state"));
      assertEquals("COMPLETE", store.completeReset(resetId).getString("state"));
      assertEquals("COMPLETE", store.completeReset(resetId).getString("state"));
      assertEquals("COMPLETE", store.beginReset(resetId).getString("state"));
      assertEquals("CLEARED", store.clearForReset(resetId).getString("state"));
    } finally {
      try { store.close(); } catch (Exception ignored) {}
      context.deleteDatabase(databaseName);
    }
  }
}
