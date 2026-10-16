package com.kanishka.pwa;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.os.SystemClock;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import com.squareup.moshi.Moshi;
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory;
import com.valhalla.valhalla.Valhalla;
import com.valhalla.valhalla.config.ValhallaConfigFactory;
import com.valhalla.valhalla.config.ValhallaConfigManager;
import com.valhalla.valhalla.files.ValhallaFile;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.Locale;

/**
 * Failure-oriented tests for durable work records, native GPS lifecycle recovery,
 * and actual on-device Valhalla routing against an externally installed tile extract.
 *
 * GPS preparation/verification methods are intentionally separate so the CI shell
 * can place screen-off and reboot boundaries between instrumentation invocations.
 */
@RunWith(AndroidJUnit4.class)
public class KfeRecoveryHardeningTest {
  private Context context;

  @Before public void setUp() {
    context = InstrumentationRegistry.getInstrumentation().getTargetContext();
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
    assertLostAckRetryIsIdempotent(store, fareBOperation, "TRIP", fareB);
    assertLostAckRetryIsIdempotent(store, shiftOperation, "SHIFT", shift);

    assertEquals(250, store.getRecord("TRIP", tripA).getJSONObject("record").getInt("fare"));
    assertEquals(150, store.getRecord("TRIP", tripB).getJSONObject("record").getInt("fare"));
    assertEquals(400, store.getRecord("SHIFT", shiftId).getJSONObject("record").getInt("revenue"));
    assertEquals(400,
        store.getRecord("SHIFT", shiftId).getJSONObject("record").getInt("revenue"),
        "A repeated read after an acknowledgement retry must not increment revenue again.");

    JSONObject stale = new JSONObject(shift.toString()).put("revenue", 250).put("updatedAt", t1);
    assertRejectedWrite(store, "recovery-stale-op-" + suffix, "SHIFT", stale, "Stale canonical write rejected");
    JSONObject equalVersionConflict = new JSONObject(shift.toString()).put("revenue", 999);
    assertRejectedWrite(store, "recovery-equal-op-" + suffix, "SHIFT", equalVersionConflict,
        "different payloads share updatedAt");
    assertEquals(400, store.getRecord("SHIFT", shiftId).getJSONObject("record").getInt("revenue"),
        "Rejected stale/conflicting snapshots must not roll back the acknowledged projection.");

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

  @Test public void gpsCollectorRecoversAfterServiceInterruption() throws Exception {
    String tripId = "gps-service-recovery-" + System.currentTimeMillis();
    KfeNativeGpsService.start(context, tripId, "PASSENGER_RIDE_TRACE", "TRIP");
    await("GPS collector start", 12000L,
        () -> KfeNativeGpsService.isPersistedTracking(context, tripId, "PASSENGER_RIDE_TRACE", "TRIP"));

    context.stopService(new Intent(context, KfeNativeGpsService.class));
    await("GPS service interruption", 8000L, () -> !KfeNativeGpsService.isAnyPersistedTracking(context));
    assertEquals("Service interruption must preserve the active trip identity.",
        tripId, KfeNativeGpsService.persistedActiveTripId(context));

    KfeNativeGpsService.resumePersisted(context);
    await("GPS collector recovery", 12000L,
        () -> KfeNativeGpsService.isPersistedTracking(context, tripId, "PASSENGER_RIDE_TRACE", "TRIP"));
    assertEquals("Recovered collector must preserve the movement phase.",
        "PASSENGER_RIDE_TRACE", KfeNativeGpsService.persistedActiveEventType(context));

    KfeNativeGpsService.stop(context, tripId);
    await("GPS collector cleanup", 8000L, () -> KfeNativeGpsService.persistedActiveTripId(context).isEmpty());
  }

  @Test public void prepareGpsCollectorForScreenOff() throws Exception {
    startPersistentGps("gps-screen-off-" + System.currentTimeMillis());
  }

  @Test public void verifyGpsCollectorAfterScreenOff() throws Exception {
    String tripId = context.getSharedPreferences("kfe_native_gps", Context.MODE_PRIVATE)
        .getString("activeTripId", "");
    assertTrue("The GPS trip identity must survive screen-off.", tripId.startsWith("gps-screen-off-"));
    await("GPS collector after screen-off", 8000L,
        () -> KfeNativeGpsService.isPersistedTracking(context, tripId, "PASSENGER_RIDE_TRACE", "TRIP"));
  }

  @Test public void prepareGpsCollectorForReboot() throws Exception {
    startPersistentGps("gps-reboot-" + System.currentTimeMillis());
  }

  @Test public void verifyGpsCollectorAfterReboot() throws Exception {
    String tripId = context.getSharedPreferences("kfe_native_gps", Context.MODE_PRIVATE)
        .getString("activeTripId", "");
    assertTrue("Boot recovery must retain the pre-reboot trip identity.", tripId.startsWith("gps-reboot-"));
    await("GPS collector after reboot", 25000L,
        () -> KfeNativeGpsService.isPersistedTracking(context, tripId, "PASSENGER_RIDE_TRACE", "TRIP"));
  }

  @Test public void cleanupRecoveredGpsCollector() throws Exception {
    String tripId = KfeNativeGpsService.persistedActiveTripId(context);
    if (tripId.startsWith("gps-screen-off-") || tripId.startsWith("gps-reboot-")) {
      KfeNativeGpsService.stop(context, tripId);
      await("Recovered GPS cleanup", 8000L, () -> KfeNativeGpsService.persistedActiveTripId(context).isEmpty());
    }
  }

  private void startPersistentGps(String tripId) throws Exception {
    KfeNativeGpsService.start(context, tripId, "PASSENGER_RIDE_TRACE", "TRIP");
    await("Persistent GPS collector start", 12000L,
        () -> KfeNativeGpsService.isPersistedTracking(context, tripId, "PASSENGER_RIDE_TRACE", "TRIP"));
  }

  @Test public void installedOfflineValhallaRoutesWithNetworkDisabled() throws Exception {
    File source = new File("/data/local/tmp/valhalla-tiles.tar");
    assertTrue("CI must push the actual region tile extract before the offline test.", source.isFile() && source.length() > 0);
    File mapDir = new File(context.getFilesDir(), "offline-maps");
    if (!mapDir.exists()) assertTrue("Unable to create offline map directory.", mapDir.mkdirs());
    File tiles = new File(mapDir, "valhalla-tiles.tar");
    try (InputStream input = new FileInputStream(source); FileOutputStream output = new FileOutputStream(tiles)) {
      byte[] buffer = new byte[1024 * 1024];
      int read;
      while ((read = input.read(buffer)) >= 0) if (read > 0) output.write(buffer, 0, read);
      output.getFD().sync();
    }
    JSONObject metadata = new JSONObject()
        .put("regionId", "mumbai-metro")
        .put("version", "ci-fixture")
        .put("coverageBounds", new JSONObject().put("south", 18.6).put("north", 19.7)
            .put("west", 72.4).put("east", 73.5));
    try (FileOutputStream output = new FileOutputStream(new File(mapDir, "map-metadata.json"))) {
      output.write(metadata.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
      output.getFD().sync();
    }

    JSONArray shape = new JSONArray()
        .put(new JSONObject().put("lat", 19.0760).put("lon", 72.8777).put("time", 1792140000L))
        .put(new JSONObject().put("lat", 19.0850).put("lon", 72.8697).put("time", 1792140060L))
        .put(new JSONObject().put("lat", 19.0930).put("lon", 72.8610).put("time", 1792140120L));
    JSONObject request = new JSONObject().put("shape", shape).put("shape_match", "map_snap")
        .put("costing", "auto").put("units", "kilometers").put("shape_format", "geojson");
    ValhallaConfigManager manager = new ValhallaConfigManager(context,
        new ValhallaFile(context, "valhalla-offline.json", mapDir),
        new Moshi.Builder().add(new KotlinJsonAdapterFactory()).build());
    String raw;
    try (Valhalla engine = new Valhalla(context,
        ValhallaConfigFactory.INSTANCE.usingTileExtract(tiles.getAbsolutePath(), null), manager)) {
      raw = engine.traceRouteRaw(request.toString());
    }
    JSONObject response = new JSONObject(raw);
    JSONObject trip = response.optJSONObject("trip");
    assertNotNull("On-device Valhalla must return a trip response: " + raw, trip);
    JSONObject summary = trip.optJSONObject("summary");
    assertNotNull("On-device Valhalla must return a route summary: " + raw, summary);
    assertTrue("Offline route must have a positive road distance: " + raw, summary.optDouble("length", 0) > 0);
  }

  private interface Check { boolean ready(); }

  private static void await(String label, long timeoutMs, Check check) throws Exception {
    long deadline = SystemClock.uptimeMillis() + timeoutMs;
    while (SystemClock.uptimeMillis() < deadline) {
      if (check.ready()) return;
      SystemClock.sleep(100L);
    }
    assertTrue(label + " did not reach the expected persisted state before timeout.", check.ready());
  }
}
