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
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
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

  @Test public void prepareGpsCollectorForProcessDeath() throws Exception {
    String suffix = Long.toString(System.currentTimeMillis());
    String tripId = "gps-process-death-" + suffix;
    String fareTripIdA = "recovery-process-death-trip-a-" + suffix;
    String fareTripIdB = "recovery-process-death-trip-b-" + suffix;
    String shiftId = "recovery-process-death-shift-" + suffix;
    String updatedAtA = "2026-10-16T03:00:00.000Z";
    String updatedAtB = "2026-10-16T03:01:00.000Z";
    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    store.putRecord("recovery-process-death-trip-op-a-" + suffix, "TRIP",
        new JSONObject().put("id", fareTripIdA).put("shiftId", shiftId).put("status", "COMPLETED")
            .put("fare", 250).put("updatedAt", updatedAtA));
    store.putRecord("recovery-process-death-trip-op-b-" + suffix, "TRIP",
        new JSONObject().put("id", fareTripIdB).put("shiftId", shiftId).put("status", "COMPLETED")
            .put("fare", 150).put("updatedAt", updatedAtB));
    store.putRecord("recovery-process-death-shift-op-" + suffix, "SHIFT",
        new JSONObject().put("id", shiftId).put("status", "ACTIVE").put("revenue", 400)
            .put("updatedAt", updatedAtB));
    store.putRecord("recovery-process-death-active-trip-op-" + suffix, "TRIP",
        new JSONObject().put("id", tripId).put("shiftId", shiftId).put("status", "ACTIVE")
            .put("tripStage", "RIDE_STARTED").put("tripStartAt", updatedAtB).put("updatedAt", updatedAtB));
    startPersistentGps(tripId);
    rememberTraceCount("processDeath", tripId);
    // Keep this target process alive long enough for the emulator shell to kill
    // it while the foreground GPS service is actively collecting. The harness
    // launches this instrumentation method asynchronously and injects the kill.
    // If the harness fails, the bounded sleep prevents a permanently hung test.
    SystemClock.sleep(30000L);
  }

  @Test public void verifyGpsCollectorAfterProcessDeath() throws Exception {
    String tripId = context.getSharedPreferences("kfe_native_gps", Context.MODE_PRIVATE)
        .getString("activeTripId", "");
    assertTrue("Process recovery must retain the pre-death trip identity.", tripId.startsWith("gps-process-death-"));
    // Trigger the persisted-resume path in this same instrumentation session, then
    // signal the shell only after a live collector has registered its callback.
    context.deleteFile("process-death-recovery-ready");
    KfeNativeGpsService.resumePersisted(context);
    await("live GPS collector after process death", 25000L,
        () -> KfeNativeGpsService.isPersistedTracking(context, tripId, "PASSENGER_RIDE_TRACE", "TRIP"));
    // Reset the baseline only after recovery is live, so later growth proves new fixes were captured.
    rememberTraceCount("processDeath", tripId);
    File ready = new File(context.getFilesDir(), "process-death-recovery-ready");
    try (FileOutputStream output = new FileOutputStream(ready)) {
      output.write("ready".getBytes(java.nio.charset.StandardCharsets.UTF_8));
      output.getFD().sync();
    }
    int recoveredTraceBaseline = context.getSharedPreferences("kfe_test_recovery", Context.MODE_PRIVATE)
        .getInt("processDeathTraceCountBefore", -1);
    await("new GPS fixes after process-death recovery", 20000L, () -> {
      try {
        return recoveredTraceBaseline >= 0
            && new JSONArray(KfeNativeGpsService.readTrace(context, tripId)).length() > recoveredTraceBaseline;
      } catch (Exception ignored) {
        return false;
      }
    });
    assertTraceGrew("processDeath", tripId, "after process death");

    String suffix = tripId.substring("gps-process-death-".length());
    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    JSONObject tripA = store.getRecord("TRIP", "recovery-process-death-trip-a-" + suffix);
    JSONObject tripB = store.getRecord("TRIP", "recovery-process-death-trip-b-" + suffix);
    JSONObject shift = store.getRecord("SHIFT", "recovery-process-death-shift-" + suffix);
    JSONObject activeTrip = store.getRecord("TRIP", tripId);
    assertTrue("First saved fare must survive target-process death.", tripA.optBoolean("found", false));
    assertTrue("Second saved fare must survive target-process death.", tripB.optBoolean("found", false));
    assertEquals(250, tripA.getJSONObject("record").getInt("fare"));
    assertEquals(150, tripB.getJSONObject("record").getInt("fare"));
    int restoredFareTotal = tripA.getJSONObject("record").getInt("fare")
        + tripB.getJSONObject("record").getInt("fare");
    assertEquals("Restored saved fares must reconcile to the known ₹400 projection.", 400, restoredFareTotal);
    assertTrue("Active trip lifecycle record must survive target-process death.", activeTrip.optBoolean("found", false));
    assertEquals("Recovered trip must retain its active lifecycle state.", "ACTIVE",
        activeTrip.getJSONObject("record").getString("status"));
    assertEquals("Recovered trip must retain the passenger-ride phase.", "RIDE_STARTED",
        activeTrip.getJSONObject("record").getString("tripStage"));
    assertEquals("Recovered trip must retain the authoritative start timestamp.", "2026-10-16T03:01:00.000Z",
        activeTrip.getJSONObject("record").getString("tripStartAt"));
    assertTrue("Shift projection must survive target-process death.", shift.optBoolean("found", false));
    assertEquals("Persisted cumulative revenue must still agree after restart.", restoredFareTotal,
        shift.getJSONObject("record").getInt("revenue"));
    assertTrue("First durable fare operation outcome must survive target-process death.",
        store.getOperation("recovery-process-death-trip-op-a-" + suffix).optBoolean("found", false));
    assertTrue("Second durable fare operation outcome must survive target-process death.",
        store.getOperation("recovery-process-death-trip-op-b-" + suffix).optBoolean("found", false));
  }

  @Test public void prepareGpsCollectorForScreenOff() throws Exception {
    String tripId = "gps-screen-off-" + System.currentTimeMillis();
    startPersistentGps(tripId);
    persistLifecycleFixture("screenOff", tripId);
    rememberTraceCount("screenOff", tripId);
  }

  @Test public void verifyGpsCollectorAfterScreenOff() throws Exception {
    String tripId = "gps-screen-off-" + System.currentTimeMillis();
    startPersistentGps(tripId);
    persistLifecycleFixture("screenOff", tripId);
    rememberTraceCount("screenOff", tripId);
    writeRecoveryReadyMarker("screen-off-recovery-ready");
    await("new GPS fixes while screen off", 20000L,
        () -> traceGrewSinceBaseline("screenOff", tripId));
    await("GPS collector after screen-off", 8000L,
        () -> KfeNativeGpsService.isPersistedTracking(context, tripId, "PASSENGER_RIDE_TRACE", "TRIP"));
    assertTraceGrew("screenOff", tripId, "while the screen was off");
    assertLifecycleFixture("screenOff", tripId);
  }

  @Test public void prepareGpsCollectorForReboot() throws Exception {
    String tripId = "gps-reboot-" + System.currentTimeMillis();
    startPersistentGps(tripId);
    persistLifecycleFixture("reboot", tripId);
    rememberTraceCount("reboot", tripId);
    context.getSharedPreferences("kfe_lifecycle_recovery", Context.MODE_PRIVATE).edit()
        .putLong("rebootTestPreparedAt", System.currentTimeMillis()).commit();
  }

  @Test public void verifyGpsCollectorAfterReboot() throws Exception {
    String tripId = context.getSharedPreferences("kfe_native_gps", Context.MODE_PRIVATE)
        .getString("activeTripId", "");
    assertTrue("Boot recovery must retain the pre-reboot trip identity.", tripId.startsWith("gps-reboot-"));
    android.content.SharedPreferences recovery = context.getSharedPreferences("kfe_lifecycle_recovery", Context.MODE_PRIVATE);
    assertTrue("Android must deliver BOOT_COMPLETED after the reboot; last action=" +
        recovery.getString("lastRecoveryAction", "NONE"),
        Intent.ACTION_BOOT_COMPLETED.equals(recovery.getString("lastRecoveryAction", "")) &&
        recovery.getLong("lastRecoveryAt", 0L) > recovery.getLong("rebootTestPreparedAt", Long.MAX_VALUE));
    assertTrue("Fine or coarse location permission must remain granted after reboot.",
        androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_FINE_LOCATION)
            == android.content.pm.PackageManager.PERMISSION_GRANTED
        || androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_COARSE_LOCATION)
            == android.content.pm.PackageManager.PERMISSION_GRANTED);
    assertEquals("Background location permission must remain granted after reboot.",
        android.content.pm.PackageManager.PERMISSION_GRANTED,
        androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_BACKGROUND_LOCATION));
    // Avoid using isPersistedTracking() as the reboot readiness signal: it
    // includes process-local service-instance state that may be recreated when
    // Android starts the instrumentation process. The durable resume decision
    // is the precondition; injected fixes and trace growth below prove that the
    // post-boot collector is actually receiving data.
    android.content.SharedPreferences gps = context.getSharedPreferences("kfe_native_gps", Context.MODE_PRIVATE);
    await("boot receiver's persisted GPS resume request", 25000L, () ->
        tripId.equals(gps.getString("activeTripId", ""))
            && "PASSENGER_RIDE_TRACE".equals(gps.getString("activeEventType", ""))
            && "TRIP".equals(gps.getString("activeEntityType", ""))
            && gps.getLong("lastResumeAt", 0L) > recovery.getLong("rebootTestPreparedAt", Long.MAX_VALUE)
            && "START_REQUESTED".equals(gps.getString("lastResumeDecision", ""))
            && gps.getBoolean("activeCollectorReady", false));
    // Keep the baseline captured before reboot. The shell injects fresh GPS fixes
    // after BOOT_COMPLETED but before launching instrumentation: starting the test
    // runner can recreate the app process and would otherwise perturb the service
    // whose autonomous boot recovery this test is meant to observe.
    writeRecoveryReadyMarker("reboot-recovery-ready");
    long gpsDeadline = SystemClock.uptimeMillis() + 60000L;
    while (SystemClock.uptimeMillis() < gpsDeadline && !traceGrewSinceBaseline("reboot", tripId)) {
      SystemClock.sleep(100L);
    }
    if (!traceGrewSinceBaseline("reboot", tripId)) {
      android.content.SharedPreferences gpsPrefs =
          context.getSharedPreferences("kfe_test_recovery", Context.MODE_PRIVATE);
      int before = gpsPrefs.getInt("rebootTraceCountBefore", -1);
      int after = new JSONArray(KfeNativeGpsService.readTrace(context, tripId)).length();
      fail("No GPS fixes persisted after reboot; traceBefore=" + before + "; traceAfter=" + after
          + "; serviceDiagnostics=" + KfeNativeGpsService.diagnostics(context).toString());
    }
    assertTraceGrew("reboot", tripId, "after reboot");
    assertLifecycleFixture("reboot", tripId);
  }

  @Test public void cleanupRecoveredGpsCollector() throws Exception {
    String tripId = KfeNativeGpsService.persistedActiveTripId(context);
    if (tripId.startsWith("gps-process-death-") || tripId.startsWith("gps-screen-off-") || tripId.startsWith("gps-reboot-")) {
      KfeNativeGpsService.stop(context, tripId);
      await("Recovered GPS cleanup", 8000L, () -> KfeNativeGpsService.persistedActiveTripId(context).isEmpty());
    }
  }

  private void persistLifecycleFixture(String boundaryKey, String tripId) throws Exception {
    String suffix = tripId;
    String shiftId = "recovery-" + boundaryKey + "-shift-" + suffix;
    String fareTripA = "recovery-" + boundaryKey + "-fare-a-" + suffix;
    String fareTripB = "recovery-" + boundaryKey + "-fare-b-" + suffix;
    String t1 = "2026-10-16T03:00:00.000Z";
    String t2 = "2026-10-16T03:01:00.000Z";
    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    store.putRecord("recovery-" + boundaryKey + "-fare-a-op-" + suffix, "TRIP",
        new JSONObject().put("id", fareTripA).put("shiftId", shiftId).put("status", "COMPLETED")
            .put("fare", 250).put("updatedAt", t1));
    store.putRecord("recovery-" + boundaryKey + "-fare-b-op-" + suffix, "TRIP",
        new JSONObject().put("id", fareTripB).put("shiftId", shiftId).put("status", "COMPLETED")
            .put("fare", 150).put("updatedAt", t2));
    store.putRecord("recovery-" + boundaryKey + "-active-op-" + suffix, "TRIP",
        new JSONObject().put("id", tripId).put("shiftId", shiftId).put("status", "ACTIVE")
            .put("tripStage", "RIDE_STARTED").put("tripStartAt", t2)
            .put("phaseStartedAt", t2).put("updatedAt", t2));
    store.putRecord("recovery-" + boundaryKey + "-shift-op-" + suffix, "SHIFT",
        new JSONObject().put("id", shiftId).put("status", "ACTIVE").put("revenue", 400)
            .put("shiftStartAt", t1).put("updatedAt", t2));
    context.getSharedPreferences("kfe_test_recovery", Context.MODE_PRIVATE).edit()
        .putString(boundaryKey + "ShiftId", shiftId)
        .putString(boundaryKey + "FareTripA", fareTripA)
        .putString(boundaryKey + "FareTripB", fareTripB)
        .commit();
  }

  private void assertLifecycleFixture(String boundaryKey, String tripId) throws Exception {
    android.content.SharedPreferences prefs =
        context.getSharedPreferences("kfe_test_recovery", Context.MODE_PRIVATE);
    String shiftId = prefs.getString(boundaryKey + "ShiftId", "");
    String fareTripA = prefs.getString(boundaryKey + "FareTripA", "");
    String fareTripB = prefs.getString(boundaryKey + "FareTripB", "");
    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    JSONObject active = store.getRecord("TRIP", tripId);
    JSONObject fareA = store.getRecord("TRIP", fareTripA);
    JSONObject fareB = store.getRecord("TRIP", fareTripB);
    JSONObject shift = store.getRecord("SHIFT", shiftId);
    assertTrue("Active trip record must survive " + boundaryKey, active.optBoolean("found", false));
    assertTrue("First saved fare must survive " + boundaryKey, fareA.optBoolean("found", false));
    assertTrue("Second saved fare must survive " + boundaryKey, fareB.optBoolean("found", false));
    assertTrue("Shift projection must survive " + boundaryKey, shift.optBoolean("found", false));
    JSONObject activeRecord = active.getJSONObject("record");
    assertEquals("ACTIVE", activeRecord.getString("status"));
    assertEquals("RIDE_STARTED", activeRecord.getString("tripStage"));
    assertEquals("2026-10-16T03:01:00.000Z", activeRecord.getString("tripStartAt"));
    assertEquals("2026-10-16T03:01:00.000Z", activeRecord.getString("phaseStartedAt"));
    int total = fareA.getJSONObject("record").getInt("fare") + fareB.getJSONObject("record").getInt("fare");
    assertEquals("Saved fares must reconcile to ₹400 after " + boundaryKey, 400, total);
    assertEquals("Cumulative revenue must agree after " + boundaryKey, total,
        shift.getJSONObject("record").getInt("revenue"));
    assertTrue("Shift start timestamp must remain persisted after " + boundaryKey,
        shift.getJSONObject("record").has("shiftStartAt"));
  }

  private void rememberTraceCount(String boundaryKey, String tripId) throws Exception {
    int count = new JSONArray(KfeNativeGpsService.readTrace(context, tripId)).length();
    context.getSharedPreferences("kfe_test_recovery", Context.MODE_PRIVATE).edit()
        .putString(boundaryKey + "TripId", tripId)
        .putInt(boundaryKey + "TraceCountBefore", count).commit();
  }

  private void writeRecoveryReadyMarker(String fileName) throws Exception {
    File ready = new File(context.getFilesDir(), fileName);
    try (FileOutputStream output = new FileOutputStream(ready)) {
      output.write("ready".getBytes(java.nio.charset.StandardCharsets.UTF_8));
      output.getFD().sync();
    }
  }

  private boolean traceGrewSinceBaseline(String boundaryKey, String tripId) {
    try {
      android.content.SharedPreferences prefs = context.getSharedPreferences("kfe_test_recovery", Context.MODE_PRIVATE);
      int before = prefs.getInt(boundaryKey + "TraceCountBefore", -1);
      return before >= 0 && tripId.equals(prefs.getString(boundaryKey + "TripId", ""))
          && new JSONArray(KfeNativeGpsService.readTrace(context, tripId)).length() > before;
    } catch (Exception ignored) {
      return false;
    }
  }

  private void assertTraceGrew(String boundaryKey, String tripId, String boundary) throws Exception {
    android.content.SharedPreferences prefs = context.getSharedPreferences("kfe_test_recovery", Context.MODE_PRIVATE);
    assertEquals("The trace baseline must belong to the same trip across recovery.",
        tripId, prefs.getString(boundaryKey + "TripId", ""));
    int before = prefs.getInt(boundaryKey + "TraceCountBefore", -1);
    int after = new JSONArray(KfeNativeGpsService.readTrace(context, tripId)).length();
    assertTrue("Native GPS must persist new fixes " + boundary + "; before=" + before + "; after=" + after,
        before >= 0 && after > before);
  }

  private void startPersistentGps(String tripId) throws Exception {
    KfeNativeGpsService.start(context, tripId, "PASSENGER_RIDE_TRACE", "TRIP");
    await("Persistent GPS collector start", 12000L,
        () -> KfeNativeGpsService.isPersistedTracking(context, tripId, "PASSENGER_RIDE_TRACE", "TRIP"));
  }

  @Test public void prepareOfflineValhallaFixtureDirectory() throws Exception {
    File externalFiles = context.getExternalFilesDir(null);
    assertNotNull("App-specific external files storage must be available for the CI fixture.", externalFiles);
    if (!externalFiles.isDirectory()) {
      assertTrue("Unable to create app-specific external files directory.", externalFiles.mkdirs());
    }
    assertTrue("App-specific external files directory was not created.", externalFiles.isDirectory());
  }

  @Test public void downloadOfflineMapThroughUserFacingScreen() throws Exception {
    android.content.Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
    assertNotNull("KFE launch intent must be available for the real UI download test.", launch);
    launch.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
    android.app.Activity activity = InstrumentationRegistry.getInstrumentation().startActivitySync(launch);
    assertTrue("The offline map screen must run inside MainActivity.", activity instanceof MainActivity);
    MainActivity main = (MainActivity) activity;
    android.webkit.WebView webView = main.getBridge().getWebView();
    assertNotNull("KFE WebView must be available for the real user-facing download.", webView);

    String pageReady = "waiting";
    long pageDeadline = SystemClock.uptimeMillis() + 120000L;
    while (SystemClock.uptimeMillis() < pageDeadline && !"ready".equals(pageReady)) {
      pageReady = evaluateJavascriptSync(webView, "document.querySelector('#app h1') ? 'ready' : 'waiting'");
      if (!"ready".equals(pageReady)) SystemClock.sleep(500L);
    }
    assertEquals("KFE must finish rendering its initial screen before navigating to Offline Maps.", "ready", pageReady);
    evaluateJavascriptSync(webView, "location.hash = '#/offline-maps'; 'navigated'");
    String clickResult = "waiting";
    long uiDeadline = SystemClock.uptimeMillis() + 180000L;
    while (SystemClock.uptimeMillis() < uiDeadline && !"clicked".equals(clickResult)) {
      clickResult = evaluateJavascriptSync(webView,
          "(()=>{const card=[...document.querySelectorAll('.region-card')].find(x=>x.querySelector('h2')?.textContent.includes('Mumbai'));"
          + "const button=card?.querySelector('button.primary');if(!button)return 'waiting';"
          + "if(button.disabled)return 'disabled';button.click();return 'clicked'})()");
      if (!"clicked".equals(clickResult)) SystemClock.sleep(1000L);
    }
    assertEquals("The real Offline Maps screen must expose an enabled Mumbai Download map button.", "clicked", clickResult);

    File regionDir = new File(new File(new File(context.getFilesDir(), "offline-maps"), "regions"), "mumbai-metro");
    File tiles = new File(regionDir, "valhalla-tiles.tar");
    File metadataFile = new File(regionDir, "map-metadata.json");
    await("actual UI-triggered regional download and verified installation", 1200000L,
        () -> tiles.isFile() && tiles.length() > 0 && metadataFile.isFile());
    JSONObject metadata = new JSONObject(new String(java.nio.file.Files.readAllBytes(metadataFile.toPath()),
        java.nio.charset.StandardCharsets.UTF_8));
    assertEquals("Installed size must match the package bytes.", tiles.length(), metadata.getLong("sizeBytes"));
    assertEquals("Installed package must be recorded under the selected region.", "mumbai-metro", metadata.getString("regionId"));
    assertEquals("Installed checksum must match the verified tile package.", sha256(tiles), metadata.getString("sha256"));
  }

  @Test public void installedOfflineValhallaRoutesWithNetworkDisabled() throws Exception {
    ConnectivityManager connectivity = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
    Network activeNetwork = connectivity == null ? null : connectivity.getActiveNetwork();
    NetworkCapabilities capabilities = activeNetwork == null ? null : connectivity.getNetworkCapabilities(activeNetwork);
    assertTrue("The offline-routing test must run without an active internet-capable network.",
        capabilities == null || !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET));

    File regionDir = new File(new File(new File(context.getFilesDir(), "offline-maps"), "regions"), "mumbai-metro");
    File tiles = new File(regionDir, "valhalla-tiles.tar");
    File metadataFile = new File(regionDir, "map-metadata.json");
    assertTrue("The real UI download must persist tiles in app-private regional storage.", tiles.isFile() && tiles.length() > 0);
    assertTrue("The real UI download must persist installation metadata.", metadataFile.isFile());
    JSONObject metadata = new JSONObject(new String(java.nio.file.Files.readAllBytes(metadataFile.toPath()),
        java.nio.charset.StandardCharsets.UTF_8));
    assertEquals("The installed package checksum must remain valid after network loss.", sha256(tiles), metadata.getString("sha256"));

    File routeRequestFile = new File(context.getFilesDir(), "valhalla-trace-request.json");
    assertTrue("CI must stage a route request validated against the published Mumbai metro extract.",
        routeRequestFile.isFile() && routeRequestFile.length() > 0);
    JSONObject request = new JSONObject(new String(java.nio.file.Files.readAllBytes(routeRequestFile.toPath()),
        java.nio.charset.StandardCharsets.UTF_8));
    ValhallaConfigManager manager = new ValhallaConfigManager(context,
        new ValhallaFile(context, "valhalla-offline.json", regionDir),
        new Moshi.Builder().add(new KotlinJsonAdapterFactory()).build());
    String raw;
    try (Valhalla engine = new Valhalla(context,
        ValhallaConfigFactory.INSTANCE.usingTileExtract(tiles.getAbsolutePath(), null), manager)) {
      raw = engine.traceRouteRaw(request.toString());
    }
    JSONObject response = new JSONObject(raw);
    JSONObject trip = response.optJSONObject("trip");
    assertNotNull("On-device Valhalla must return a trip response with networking disabled: " + raw, trip);
    JSONObject summary = trip.optJSONObject("summary");
    assertNotNull("On-device Valhalla must return a route summary with networking disabled: " + raw, summary);
    assertTrue("Offline route must have a positive road distance: " + raw, summary.optDouble("length", 0) > 0);
  }

  private String evaluateJavascriptSync(android.webkit.WebView webView, String script) throws Exception {
    java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);
    java.util.concurrent.atomic.AtomicReference<String> result = new java.util.concurrent.atomic.AtomicReference<>();
    InstrumentationRegistry.getInstrumentation().runOnMainSync(
        () -> webView.evaluateJavascript(script, value -> { result.set(value == null ? "" : (value.length() >= 2 && value.startsWith("\"") && value.endsWith("\"") ? value.substring(1, value.length() - 1) : value)); latch.countDown(); }));
    assertTrue("WebView JavaScript evaluation timed out.", latch.await(15, java.util.concurrent.TimeUnit.SECONDS));
    return result.get();
  }

  private String sha256(File file) throws Exception {
    java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
    try (InputStream input = new FileInputStream(file)) {
      byte[] buffer = new byte[65536];
      int count;
      while ((count = input.read(buffer)) != -1) if (count > 0) digest.update(buffer, 0, count);
    }
    StringBuilder value = new StringBuilder();
    for (byte b : digest.digest()) value.append(String.format(Locale.ROOT, "%02x", b));
    return value.toString();
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
