package com.kanishka.pwa;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.SharedPreferences;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.os.SystemClock;
import android.webkit.WebView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.InvocationTargetException;

/**
 * Exercises the production native persistence methods without starting a WebView
 * or invoking WorkModuleView event replay. This proves the SQLite records needed
 * for a multi-trip shift can be committed by the native overlay alone.
 */
@RunWith(AndroidJUnit4.class)
public class KfeNativeFullShiftAcceptanceTest {
  private static final String STATE_KEY = "lastOverlayState";

  @Test public void activeShiftStaleRevenueProjectionMirrorIsReconciledButOtherStaleWritesAreRejected() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    String suffix = Long.toString(System.currentTimeMillis());
    String shiftId = "active-projection-collision-shift-" + suffix;
    String tripId = "active-projection-collision-trip-" + suffix;
    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    String shiftStart = "2026-10-19T00:00:00.000Z";
    String tripVersion = "2026-10-19T00:00:10.000Z";
    assertTrue(store.putRecord("active-projection-collision-shift-create-" + suffix, "SHIFT",
        new JSONObject().put("id", shiftId).put("status", "ACTIVE")
            .put("startOdometer", 1000).put("revenue", 0).put("updatedAt", shiftStart)).accepted);
    assertTrue(store.putRecord("active-projection-collision-trip-create-" + suffix, "TRIP",
        new JSONObject().put("id", tripId).put("shiftId", shiftId).put("status", "COMPLETED")
            .put("revenue", 250d).put("fareDetailsSkipped", false).put("updatedAt", tripVersion)).accepted);

    JSONObject projected = store.getRecord("SHIFT", shiftId).getJSONObject("record");
    assertEquals(250d, projected.getDouble("revenue"), 0.001d);
    assertEquals("TRIP_FARES", projected.getString("revenueSource"));
    String projectedVersion = projected.getString("updatedAt");

    // Simulate a delayed PWA full shift mirror whose timestamp predates the native revenue projection.
    JSONObject pwaMirror = new JSONObject(projected.toString())
        .put("revenue", 0d).put("liveFareRevenue", 0d).put("revenueSource", "TRIP_FARES")
        .put("updatedAt", tripVersion);
    KfeCanonicalWorkStore.Outcome reconciled = store.putRecord(
        "active-projection-collision-pwa-mirror-" + suffix, "SHIFT", pwaMirror);
    assertTrue("A stale projection-only ACTIVE shift mirror should be reconciled.", reconciled.accepted);
    JSONObject after = store.getRecord("SHIFT", shiftId).getJSONObject("record");
    assertEquals(250d, after.getDouble("revenue"), 0.001d);
    assertEquals(250d, after.getDouble("liveFareRevenue"), 0.001d);
    assertEquals("TRIP_FARES", after.getString("revenueSource"));
    assertTrue(java.time.Instant.parse(after.getString("updatedAt"))
        .isAfter(java.time.Instant.parse(projectedVersion)));

    // A different business field at an older version is not a projection-only collision.
    JSONObject unrelatedConflict = new JSONObject(after.toString())
        .put("startOdometer", 999).put("updatedAt", tripVersion);
    boolean rejected = false;
    try {
      store.putRecord("active-projection-collision-unrelated-" + suffix, "SHIFT", unrelatedConflict);
    } catch (IllegalArgumentException expected) {
      rejected = expected.getMessage().contains("Stale canonical write rejected");
    }
    assertTrue("Unrelated stale ACTIVE shift writes must remain rejected.", rejected);
    assertEquals(1000d, store.getRecord("SHIFT", shiftId).getJSONObject("record").getDouble("startOdometer"), 0.001d);
  }

  @Test public void oneShotBoundarySnapshotMergePreservesFareAndDoesNotAdvanceBusinessVersion() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    String suffix = Long.toString(System.currentTimeMillis());
    String shiftId = "boundary-merge-shift-" + suffix;
    String tripBeforeGps = "boundary-merge-gps-first-" + suffix;
    String tripAfterFare = "boundary-merge-fare-first-" + suffix;
    String earlier = "2026-10-19T00:00:00.000Z";
    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    assertTrue(store.putRecord("boundary-merge-shift-create-" + suffix, "SHIFT",
        new JSONObject().put("id", shiftId).put("status", "ACTIVE").put("revenue", 0).put("updatedAt", earlier)).accepted);
    assertTrue(store.putRecord("boundary-merge-gps-first-create-" + suffix, "TRIP",
        new JSONObject().put("id", tripBeforeGps).put("shiftId", shiftId).put("status", "COMPLETED")
            .put("updatedAt", earlier)).accepted);

    JSONObject startSnapshot = new JSONObject().put("latitude", 19.0760d).put("longitude", 72.8777d)
        .put("accuracy", 8.0d).put("capturedAt", "2026-10-22T08:00:00.000Z");
    KfeCanonicalWorkStore.Outcome gpsFirst = store.persistTripBoundarySnapshot(
        "boundary-merge-gps-first-op-" + suffix, tripBeforeGps, "tripStartLocation", startSnapshot);
    assertTrue(gpsFirst.accepted);
    assertEquals("Metadata-only GPS must preserve the trip business version.", earlier,
        store.getRecord("TRIP", tripBeforeGps).getJSONObject("record").getString("updatedAt"));
    KfeCanonicalWorkStore.Outcome lifecycleReplayAfterGps = store.putRecord(
        "boundary-merge-gps-first-create-" + suffix, "TRIP",
        new JSONObject(store.getRecord("TRIP", tripBeforeGps).getJSONObject("record").toString()));
    assertTrue("A lifecycle retry must remain accepted after optional GPS metadata is added.", lifecycleReplayAfterGps.accepted);
    assertTrue("A lifecycle retry must remain idempotent after optional GPS metadata is added.", lifecycleReplayAfterGps.duplicate);

    JSONObject fareAfterGps = new JSONObject(store.getRecord("TRIP", tripBeforeGps).getJSONObject("record").toString())
        .put("revenue", 250d).put("fareDetailsSkipped", false)
        .put("updatedAt", java.time.Instant.now().plusSeconds(30).toString());
    assertTrue(store.commitTripForm("boundary-merge-gps-first-fare-" + suffix, "FARE", fareAfterGps).accepted);
    JSONObject tripWithFareAndStart = store.getRecord("TRIP", tripBeforeGps).getJSONObject("record");
    assertEquals(250d, tripWithFareAndStart.getDouble("revenue"), 0.001d);
    assertEquals("CAPTURED", tripWithFareAndStart.getString("tripStartLocationStatus"));
    assertEquals(19.0760d, tripWithFareAndStart.getJSONObject("tripStartLocation").getDouble("latitude"), 0.000001d);

    JSONObject staleMirror = new JSONObject(tripWithFareAndStart.toString());
    staleMirror.remove("tripStartLocation");
    staleMirror.remove("tripStartLocationStatus");
    staleMirror.put("updatedAt", java.time.Instant.now().plusSeconds(40).toString());
    assertTrue(store.putRecord("boundary-merge-stale-mirror-" + suffix, "TRIP", staleMirror).accepted);
    JSONObject afterStaleMirror = store.getRecord("TRIP", tripBeforeGps).getJSONObject("record");
    assertEquals("A newer business mirror must retain the native boundary snapshot.", 19.0760d,
        afterStaleMirror.getJSONObject("tripStartLocation").getDouble("latitude"), 0.000001d);
    assertEquals(250d, afterStaleMirror.getDouble("revenue"), 0.001d);

    assertTrue(store.putRecord("boundary-merge-fare-first-create-" + suffix, "TRIP",
        new JSONObject().put("id", tripAfterFare).put("shiftId", shiftId).put("status", "COMPLETED")
            .put("updatedAt", earlier)).accepted);
    JSONObject fareBeforeGps = new JSONObject(store.getRecord("TRIP", tripAfterFare).getJSONObject("record").toString())
        .put("revenue", 150d).put("fareDetailsSkipped", false)
        .put("updatedAt", java.time.Instant.now().plusSeconds(60).toString());
    assertTrue(store.commitTripForm("boundary-merge-fare-first-fare-" + suffix, "FARE", fareBeforeGps).accepted);
    String fareVersion = store.getRecord("TRIP", tripAfterFare).getJSONObject("record").getString("updatedAt");

    JSONObject endSnapshot = new JSONObject().put("latitude", 19.0800d).put("longitude", 72.8800d)
        .put("accuracy", 6.0d).put("capturedAt", "2026-10-22T08:01:00.000Z");
    String endOperationId = "boundary-merge-fare-first-op-" + suffix;
    KfeCanonicalWorkStore.Outcome gpsAfterFare = store.persistTripBoundarySnapshot(
        endOperationId, tripAfterFare, "tripEndLocation", endSnapshot);
    assertTrue(gpsAfterFare.accepted);
    JSONObject finalTrip = store.getRecord("TRIP", tripAfterFare).getJSONObject("record");
    assertEquals("A late GPS callback must preserve the fare form version.", fareVersion, finalTrip.getString("updatedAt"));
    assertEquals(150d, finalTrip.getDouble("revenue"), 0.001d);
    assertEquals("CAPTURED", finalTrip.getString("tripEndLocationStatus"));
    KfeCanonicalWorkStore.Outcome formRetryAfterGps = store.commitTripForm(
        "boundary-merge-fare-first-fare-" + suffix, "FARE", new JSONObject(finalTrip.toString()));
    assertTrue("Fare replay after a late GPS snapshot must remain accepted.", formRetryAfterGps.accepted);
    assertTrue("Fare replay after a late GPS snapshot must remain idempotent.", formRetryAfterGps.duplicate);
    JSONObject afterFormReplay = store.getRecord("TRIP", tripAfterFare).getJSONObject("record");
    assertEquals(150d, afterFormReplay.getDouble("revenue"), 0.001d);
    assertEquals("CAPTURED", afterFormReplay.getString("tripEndLocationStatus"));
    KfeCanonicalWorkStore.Outcome retry = store.persistTripBoundarySnapshot(endOperationId, tripAfterFare, "tripEndLocation", endSnapshot);
    assertTrue("The same boundary operation must be accepted.", retry.accepted);
    assertTrue("A repeated boundary operation must be identified as a retry.", retry.duplicate);
    boolean changedSnapshotRejected = false;
    try {
      store.persistTripBoundarySnapshot(endOperationId, tripAfterFare, "tripEndLocation",
          new JSONObject(endSnapshot.toString()).put("latitude", 19.0810d));
    } catch (IllegalArgumentException expected) {
      changedSnapshotRejected = true;
    }
    assertTrue("A durable boundary operation ID must not be reusable with a changed snapshot.", changedSnapshotRejected);
    assertEquals(400d, store.getRecord("SHIFT", shiftId).getJSONObject("record").getDouble("revenue"), 0.001d);
  }

  @Test public void nativeTripFormCommitsRevenueAtomicallyAndRetriesIdempotently() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    String suffix = Long.toString(System.currentTimeMillis());
    String shiftId = "atomic-form-shift-" + suffix;
    String tripId = "atomic-form-trip-" + suffix;
    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    String earlier = "2026-10-19T00:00:00.000Z";
    assertTrue(store.putRecord("atomic-form-shift-create-" + suffix, "SHIFT",
        new JSONObject().put("id", shiftId).put("status", "ACTIVE")
            .put("revenue", 0).put("updatedAt", earlier)).accepted);
    assertTrue(store.putRecord("atomic-form-trip-create-" + suffix, "TRIP",
        new JSONObject().put("id", tripId).put("shiftId", shiftId).put("status", "COMPLETED")
            .put("updatedAt", earlier)).accepted);

    JSONObject fareTrip = new JSONObject().put("id", tripId).put("shiftId", shiftId)
        .put("status", "COMPLETED").put("revenue", 450d).put("fareDetailsSkipped", false)
        .put("updatedAt", java.time.Instant.now().plusMillis(1000).toString());
    String operationId = "atomic-form-submit-" + suffix;
    KfeCanonicalWorkStore.Outcome first = store.commitTripForm(operationId, "FARE", fareTrip);
    assertTrue("First command must be accepted.", first.accepted);
    assertTrue("First command must not be classified as a retry.", !first.duplicate);
    assertEquals(450d, store.getRecord("SHIFT", shiftId).getJSONObject("record").getDouble("revenue"), 0.001d);

    KfeCanonicalWorkStore.Outcome retry = store.commitTripForm(operationId, "FARE", new JSONObject(fareTrip.toString()));
    assertTrue("Retry must return an accepted outcome.", retry.accepted);
    assertTrue("Retry must be idempotent.", retry.duplicate);
    assertEquals(450d, store.getRecord("SHIFT", shiftId).getJSONObject("record").getDouble("revenue"), 0.001d);
    JSONObject savedOperation = store.getOperation(operationId);
    assertTrue("Durable operation outcome must exist.", savedOperation.optBoolean("found", false));
    assertEquals("SUBMIT_TRIP_FORM", savedOperation.getString("command"));
    assertEquals(450d, savedOperation.getJSONObject("outcome").getDouble("revenue"), 0.001d);

    String skippedTripId = "atomic-form-skipped-trip-" + suffix;
    assertTrue(store.putRecord("atomic-form-skipped-create-" + suffix, "TRIP",
        new JSONObject().put("id", skippedTripId).put("shiftId", shiftId).put("status", "COMPLETED")
            .put("updatedAt", earlier)).accepted);
    JSONObject skippedFareTrip = new JSONObject().put("id", skippedTripId).put("shiftId", shiftId)
        .put("status", "COMPLETED").put("revenue", JSONObject.NULL).put("fareDetailsSkipped", true)
        .put("updatedAt", java.time.Instant.now().plusMillis(2000).toString());
    KfeCanonicalWorkStore.Outcome skipped = store.commitTripForm(
        "atomic-form-skipped-submit-" + suffix, "FARE", skippedFareTrip);
    assertTrue("Skipped fare details are still a completed trip.", skipped.accepted);
    assertEquals("Skipped fare details must contribute zero to authoritative shift revenue.", 450d,
        store.getRecord("SHIFT", shiftId).getJSONObject("record").getDouble("revenue"), 0.001d);

    // Legacy cancelled trips without a fee field must not fall back to an old trip fare.
    String legacyBlankCancelId = "atomic-form-legacy-blank-cancel-" + suffix;
    assertTrue(store.putRecord("atomic-form-legacy-blank-cancel-create-" + suffix, "TRIP",
        new JSONObject().put("id", legacyBlankCancelId).put("shiftId", shiftId).put("status", "CANCELLED")
            .put("revenue", 999d).put("cancelReason", "PASSENGER").put("updatedAt", earlier)).accepted);

    String blankCancelId = "atomic-form-blank-cancel-" + suffix;
    assertTrue(store.putRecord("atomic-form-blank-cancel-create-" + suffix, "TRIP",
        new JSONObject().put("id", blankCancelId).put("shiftId", shiftId).put("status", "ACTIVE")
            .put("updatedAt", earlier)).accepted);
    JSONObject blankCancellation = new JSONObject().put("id", blankCancelId).put("shiftId", shiftId)
        .put("status", "CANCELLED").put("cancelReason", "PASSENGER")
        .put("cancelledRevenue", JSONObject.NULL)
        .put("updatedAt", java.time.Instant.now().plusMillis(3000).toString());
    KfeCanonicalWorkStore.Outcome blankCancel = store.commitTripForm(
        "atomic-form-blank-cancel-submit-" + suffix, "CANCEL", blankCancellation);
    assertTrue("Blank/not-applicable cancellation fee must be accepted.", blankCancel.accepted);
    assertEquals("Blank cancellation fees must contribute ₹0, and legacy cancelled records must not fall back to prior fares.", 450d,
        store.getRecord("SHIFT", shiftId).getJSONObject("record").getDouble("revenue"), 0.001d);
    JSONObject legacyCancelledRecord = store.getRecord("TRIP", legacyBlankCancelId).getJSONObject("record");
    assertEquals(999d, legacyCancelledRecord.getDouble("revenue"), 0.001d);
    assertTrue("Legacy missing fee remains absent; revenue projection must interpret it as ₹0.", !legacyCancelledRecord.has("cancelledRevenue"));
    assertEquals(0d, store.getRecord("TRIP", blankCancelId).getJSONObject("record").getDouble("cancelledRevenue"), 0.001d);

    String paidCancelId = "atomic-form-paid-cancel-" + suffix;
    assertTrue(store.putRecord("atomic-form-paid-cancel-create-" + suffix, "TRIP",
        new JSONObject().put("id", paidCancelId).put("shiftId", shiftId).put("status", "ACTIVE")
            .put("updatedAt", earlier)).accepted);
    JSONObject paidCancellation = new JSONObject().put("id", paidCancelId).put("shiftId", shiftId)
        .put("status", "CANCELLED").put("cancelReason", "PASSENGER").put("cancelledRevenue", 20d)
        .put("updatedAt", java.time.Instant.now().plusMillis(4000).toString());
    KfeCanonicalWorkStore.Outcome paidCancel = store.commitTripForm(
        "atomic-form-paid-cancel-submit-" + suffix, "CANCEL", paidCancellation);
    assertTrue("A valid cancellation fee must be accepted.", paidCancel.accepted);
    assertEquals("Shift revenue must include the cancellation fee exactly once.", 470d,
        store.getRecord("SHIFT", shiftId).getJSONObject("record").getDouble("revenue"), 0.001d);
  }

  @Test public void nativeShiftStartInterpreterMatchesSharedGoldenVectors() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    String source;
    try (java.io.InputStream stream = context.getAssets().open("shift-start-golden-vectors.json");
         java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream()) {
      byte[] buffer = new byte[4096];
      int count;
      while ((count = stream.read(buffer)) != -1) bytes.write(buffer, 0, count);
      source = bytes.toString("UTF-8");
    }
    JSONObject vectorFile = new JSONObject(source);
    assertEquals("The native test must consume the versioned shared vector source.", 1,
        vectorFile.getInt("schemaVersion"));
    KfeShiftStartRuleInterpreter interpreter = new KfeShiftStartRuleInterpreter(context);
    JSONArray cases = vectorFile.getJSONArray("cases");
    for (int i = 0; i < cases.length(); i++) {
      JSONObject vector = cases.getJSONObject(i);
      JSONObject actual = interpreter.evaluate(vector.getString("rule"), vector.getJSONObject("input"));
      JSONObject expected = vector.getJSONObject("expected");
      java.util.Iterator<String> keys = expected.keys();
      while (keys.hasNext()) {
        String key = keys.next();
        Object expectedValue = expected.get(key);
        Object actualValue = actual.get(key);
        if (expectedValue instanceof Number && actualValue instanceof Number) {
          assertEquals(vector.getString("id") + " field " + key,
              ((Number) expectedValue).doubleValue(), ((Number) actualValue).doubleValue(), 0.000001);
        } else if (expectedValue == JSONObject.NULL) {
          assertEquals(vector.getString("id") + " field " + key, JSONObject.NULL, actualValue);
        } else {
          assertEquals(vector.getString("id") + " field " + key, expectedValue, actualValue);
        }
      }
    }
  }


  @Test public void nativeOverlayPersistsTripFormsWithWebViewUnavailableWithoutEndingShift() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    // Fail closed if any code in this test process tries to create a WebView.
    // This test deliberately does not launch MainActivity or invoke PWA replay.
    WebView.disableWebView();
    String suffix = Long.toString(System.currentTimeMillis());
    String shiftId = "webview-off-shift-" + suffix;
    String fareTripId = "webview-off-fare-" + suffix;
    String cancelTripId = "webview-off-cancel-" + suffix;
    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    JSONObject shift = new JSONObject().put("id", shiftId).put("status", "ACTIVE")
        .put("revenue", 0).put("updatedAt", java.time.Instant.now().toString());
    assertTrue("Active shift fixture must commit natively.",
        store.putRecord("webview-off-shift-create-" + suffix, "SHIFT", shift).accepted);

    AttachedOverlayService service = new AttachedOverlayService();
    service.attach(context);
    setField(service, "defaultOperator", "Uber");
    SharedPreferences prefs = context.getSharedPreferences("kfe_overlay", Context.MODE_PRIVATE);

    prepareSnapshot(prefs, shiftId, fareTripId);
    runTripStages(service, prefs, shiftId, fareTripId);
    setField(service, "formMode", "FARE");
    setField(service, "pendingFareTripId", fareTripId);
    setField(service, "formValue", "250");
    setField(service, "tollValue", "0");
    setField(service, "parkingValue", "0");
    invoke(service, "submitNumericForm", new Class<?>[]{});

    prepareSnapshot(prefs, shiftId, cancelTripId);
    setField(service, "pendingTripId", cancelTripId);
    String pickupEvent = KfeNativeWorkActionsPlugin.recordPendingAction(service, "GO_TO_PICKUP", cancelTripId, "");
    assertTrue("Cancellation trip state must commit while WebView is disabled.",
        (Boolean) invoke(service, "persistCanonicalTripStage",
            new Class<?>[]{String.class, boolean.class, String.class},
            "GOING_TO_PICKUP", false, pickupEvent));
    setField(service, "formMode", "CANCEL");
    setField(service, "formValue", "20");
    setField(service, "cancelReason", "PASSENGER");
    invoke(service, "submitNumericForm", new Class<?>[]{});

    JSONArray pending = KfeNativeEventStore.get(context).pending(500);
    String fareEventId = pendingEventIdFor(pending, fareTripId, "ENTER_FARE");
    String cancelEventId = pendingEventIdFor(pending, cancelTripId, "CANCEL_RIDE");
    assertTrue("Fare must have a durable outbox event.", !fareEventId.isEmpty());
    assertTrue("Cancellation must have a durable outbox event.", !cancelEventId.isEmpty());

    // Simulate a lost acknowledgement by retrying the exact same fare and cancellation event IDs.
    JSONObject farePayload = new JSONObject().put("fare", "250").put("toll", "0").put("parking", "0")
        .put("tollTreatment", "INCLUDED").put("parkingTreatment", "INCLUDED");
    JSONObject cancelPayload = new JSONObject().put("revenue", "20").put("reason", "PASSENGER");
    invoke(service, "persistCanonicalTripForm",
        new Class<?>[]{String.class, String.class, JSONObject.class, String.class},
        "FARE", fareTripId, farePayload, fareEventId);
    invoke(service, "persistCanonicalTripForm",
        new Class<?>[]{String.class, String.class, JSONObject.class, String.class},
        "CANCEL", cancelTripId, cancelPayload, cancelEventId);

    // The native overlay owns trip stages and trip forms, not shift closure.
    // With the WebView unavailable, the active shift must remain active; PWA owns END_SHIFT.

    store.close();
    Field singleton = KfeCanonicalWorkStore.class.getDeclaredField("instance");
    singleton.setAccessible(true);
    singleton.set(null, null);
    store = KfeCanonicalWorkStore.get(context);
    JSONObject savedShift = store.getRecord("SHIFT", shiftId).getJSONObject("record");
    JSONObject savedFare = store.getRecord("TRIP", fareTripId).getJSONObject("record");
    JSONObject savedCancel = store.getRecord("TRIP", cancelTripId).getJSONObject("record");
    assertEquals("Native trip operations must not end the PWA-owned shift.", "ACTIVE", savedShift.getString("status"));
    assertEquals("COMPLETED", savedFare.getString("status"));
    assertEquals("CANCELLED", savedCancel.getString("status"));
    assertEquals(250d, savedFare.getDouble("revenue"), 0.001d);
    assertEquals(20d, savedCancel.getDouble("cancelledRevenue"), 0.001d);
    assertEquals("Fare plus cancellation fee must be projected exactly once after store reopen.",
        270d, savedShift.getDouble("revenue"), 0.001d);
    assertEquals("One canonical fare and one cancellation only.", 2,
        countShiftTrips(store.listRecords("TRIP", 1000).getJSONArray("records"), shiftId));
    assertTrue("Fare operation outcome must survive store reopen.",
        store.getOperation("native-form-FARE-" + fareEventId).optBoolean("found", false));
    assertTrue("Cancellation operation outcome must survive store reopen.",
        store.getOperation("native-form-CANCEL-" + cancelEventId).optBoolean("found", false));
    assertPendingEvent(KfeNativeEventStore.get(context).pending(500), fareTripId, "ENTER_FARE");
    assertPendingEvent(KfeNativeEventStore.get(context).pending(500), cancelTripId, "CANCEL_RIDE");
  }

  @Test public void nativeOnlyShiftPersistsMultipleFaresAndCancellationAcrossStoreReopen() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    String suffix = Long.toString(System.currentTimeMillis());
    String shiftId = "native-full-shift-" + suffix;
    String fareTripA = "native-full-fare-a-" + suffix;
    String fareTripB = "native-full-fare-b-" + suffix;
    String cancelledTrip = "native-full-cancel-" + suffix;
    String blankCancelledTrip = "native-full-cancel-blank-" + suffix;

    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    JSONObject shift = new JSONObject()
        .put("id", shiftId)
        .put("status", "ACTIVE")
        .put("operator", "Uber")
        .put("startOdometer", 1000)
        .put("shiftStartAt", "2026-10-17T00:00:00.000Z")
        .put("revenue", 0)
        .put("updatedAt", "2026-10-17T00:00:00.000Z");
    assertTrue("The native shift fixture must commit.",
        store.putRecord("native-full-shift-create-" + suffix, "SHIFT", shift).accepted);

    AttachedOverlayService service = new AttachedOverlayService();
    service.attach(context);
    setField(service, "defaultOperator", "Uber");

    SharedPreferences prefs = context.getSharedPreferences("kfe_overlay", Context.MODE_PRIVATE);
    prepareSnapshot(prefs, shiftId, fareTripA);
    runTripStages(service, prefs, shiftId, fareTripA);
    JSONObject fareA = new JSONObject()
        .put("fare", "250").put("toll", "10").put("parking", "0")
        .put("tollTreatment", "INCLUDED").put("parkingTreatment", "INCLUDED");
    // Exercise the same native submission method called by the overlay's Save button,
    // including durable event creation, canonical commit, and post-commit workflow advance.
    setField(service, "formMode", "FARE");
    setField(service, "pendingFareTripId", fareTripA);
    setField(service, "formValue", "250");
    setField(service, "tollValue", "10");
    setField(service, "parkingValue", "0");
    invoke(service, "submitNumericForm", new Class<?>[]{});

    prepareSnapshot(prefs, shiftId, fareTripB);
    runTripStages(service, prefs, shiftId, fareTripB);
    JSONObject fareB = new JSONObject()
        .put("fare", "150").put("toll", "0").put("parking", "5")
        .put("tollTreatment", "INCLUDED").put("parkingTreatment", "INCLUDED");
    setField(service, "formMode", "FARE");
    setField(service, "pendingFareTripId", fareTripB);
    setField(service, "formValue", "150");
    setField(service, "tollValue", "0");
    setField(service, "parkingValue", "5");
    invoke(service, "submitNumericForm", new Class<?>[]{});

    prepareSnapshot(prefs, shiftId, cancelledTrip);
    setField(service, "pendingTripId", cancelledTrip);
    Thread.sleep(5L);
    String cancellationPickupEvent =
        KfeNativeWorkActionsPlugin.recordPendingAction(service, "GO_TO_PICKUP", cancelledTrip, "");
    assertTrue("The cancelled trip pickup state must persist.",
        (Boolean) invoke(service, "persistCanonicalTripStage",
            new Class<?>[]{String.class, boolean.class, String.class},
            "GOING_TO_PICKUP", false, cancellationPickupEvent));
    JSONObject cancellation = new JSONObject().put("revenue", "20").put("reason", "PASSENGER");
    setField(service, "formMode", "CANCEL");
    setField(service, "formValue", "20");
    setField(service, "cancelReason", "PASSENGER");
    invoke(service, "submitNumericForm", new Class<?>[]{});

    // A blank/not-applicable cancellation fee is a real numeric-zero business fact.
    prepareSnapshot(prefs, shiftId, blankCancelledTrip);
    setField(service, "pendingTripId", blankCancelledTrip);
    String blankPickupEvent = KfeNativeWorkActionsPlugin.recordPendingAction(service, "GO_TO_PICKUP", blankCancelledTrip, "");
    assertTrue("Blank-fee cancellation pickup state must persist.",
        (Boolean) invoke(service, "persistCanonicalTripStage",
            new Class<?>[]{String.class, boolean.class, String.class}, "GOING_TO_PICKUP", false, blankPickupEvent));
    setField(service, "formMode", "CANCEL");
    setField(service, "formValue", "");
    setField(service, "cancelReason", "PASSENGER");
    invoke(service, "submitNumericForm", new Class<?>[]{});

    // Simulate an interrupted acknowledgement: the form's native commit exists,
    // while its durable transport event remains pending for later PWA catch-up.
    JSONArray pending = KfeNativeEventStore.get(context).pending(100);
    assertPendingEvent(pending, fareTripA, "ENTER_FARE");
    assertPendingEvent(pending, fareTripB, "ENTER_FARE");
    assertPendingEvent(pending, cancelledTrip, "CANCEL_RIDE");
    assertPendingEvent(pending, blankCancelledTrip, "CANCEL_RIDE");

    // Retrying the same durable form event must replay the exact same canonical
    // operation and payload, even after the acknowledgement boundary.
    String fareAEventId = pendingEventIdFor(pending, fareTripA, "ENTER_FARE");
    assertTrue("First fare must retain its durable event ID.", !fareAEventId.isEmpty());
    invoke(service, "persistCanonicalTripForm",
        new Class<?>[]{String.class, String.class, JSONObject.class, String.class},
        "FARE", fareTripA, fareA, fareAEventId);

    // Reopen the SQLite helper to verify committed state survives store/process
    // recreation without running PWA handlers or acknowledging queued events.
    store.close();
    Field singleton = KfeCanonicalWorkStore.class.getDeclaredField("instance");
    singleton.setAccessible(true);
    singleton.set(null, null);
    store = KfeCanonicalWorkStore.get(context);

    JSONObject savedA = store.getRecord("TRIP", fareTripA);
    JSONObject savedB = store.getRecord("TRIP", fareTripB);
    JSONObject savedCancelled = store.getRecord("TRIP", cancelledTrip);
    JSONObject savedBlankCancelled = store.getRecord("TRIP", blankCancelledTrip);
    JSONObject savedShift = store.getRecord("SHIFT", shiftId);
    assertTrue("First fare record must be committed natively.", savedA.optBoolean("found"));
    assertTrue("Second fare record must be committed natively.", savedB.optBoolean("found"));
    assertTrue("Cancellation record must be committed natively.", savedCancelled.optBoolean("found"));
    assertTrue("Blank-fee cancellation record must be committed natively.", savedBlankCancelled.optBoolean("found"));
    assertTrue("Shift financial projection must be committed natively.", savedShift.optBoolean("found"));
    assertEquals(250d, savedA.getJSONObject("record").getDouble("revenue"), 0.001d);
    assertEquals(150d, savedB.getJSONObject("record").getDouble("revenue"), 0.001d);
    assertEquals("First trip toll must persist independently from fare.", 10d,
        savedA.getJSONObject("record").getDouble("toll"), 0.001d);
    assertEquals("First trip parking must persist independently from fare.", 0d,
        savedA.getJSONObject("record").getDouble("parking"), 0.001d);
    assertEquals("Second trip toll must persist as zero.", 0d,
        savedB.getJSONObject("record").getDouble("toll"), 0.001d);
    assertEquals("Second trip parking must persist independently from fare.", 5d,
        savedB.getJSONObject("record").getDouble("parking"), 0.001d);
    assertEquals("INCLUDED", savedA.getJSONObject("record").getString("tollTreatment"));
    assertEquals("INCLUDED", savedB.getJSONObject("record").getString("parkingTreatment"));
    assertEquals("COMPLETED", savedA.getJSONObject("record").getString("status"));
    assertEquals("COMPLETED", savedB.getJSONObject("record").getString("status"));
    assertEquals("CANCELLED", savedCancelled.getJSONObject("record").getString("status"));
    assertEquals("PASSENGER", savedCancelled.getJSONObject("record").getString("cancelReason"));
    assertEquals(20d, savedCancelled.getJSONObject("record").getDouble("cancelledRevenue"), 0.001d);
    assertEquals("CANCELLED", savedBlankCancelled.getJSONObject("record").getString("status"));
    assertEquals("Blank cancellation fee must persist as numeric zero.", 0d,
        savedBlankCancelled.getJSONObject("record").getDouble("cancelledRevenue"), 0.001d);
    assertEquals("Revenue must include both fares and the recorded cancellation fee; blank fee adds zero.",
        420d, savedShift.getJSONObject("record").getDouble("revenue"), 0.001d);

    JSONArray allTrips = store.listRecords("TRIP", 1000).getJSONArray("records");
    assertEquals("Retry must not create a duplicate canonical trip.", 4, countShiftTrips(allTrips, shiftId));
    assertPendingEvent(KfeNativeEventStore.get(context).pending(100), fareTripA, "ENTER_FARE");
    assertPendingEvent(KfeNativeEventStore.get(context).pending(100), fareTripB, "ENTER_FARE");
    assertPendingEvent(KfeNativeEventStore.get(context).pending(100), cancelledTrip, "CANCEL_RIDE");
    assertPendingEvent(KfeNativeEventStore.get(context).pending(100), blankCancelledTrip, "CANCEL_RIDE");
    prefs.edit()
        .putString("nativeFullShiftCatchupShiftId", shiftId)
        .putString("nativeFullShiftCatchupFareTripA", fareTripA)
        .putString("nativeFullShiftCatchupFareTripB", fareTripB)
        .putString("nativeFullShiftCatchupCancelledTrip", cancelledTrip)
        .remove(STATE_KEY)
        .commit();
  }

  @Test public void formOutboxSurvivesCanonicalRefusalAndSameEventRetriesWithoutDuplicateFare() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    String suffix = Long.toString(System.currentTimeMillis());
    String shiftId = "form-outbox-shift-" + suffix;
    String tripId = "form-outbox-trip-" + suffix;
    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    JSONObject shift = new JSONObject()
        .put("id", shiftId).put("status", "ACTIVE").put("revenue", 0)
        .put("updatedAt", "2020-01-01T00:00:00.000Z");
    JSONObject trip = new JSONObject()
        .put("id", tripId).put("shiftId", shiftId).put("status", "COMPLETED")
        .put("tripStage", "COMPLETED").put("updatedAt", "2020-01-01T00:00:00.000Z");
    assertTrue("Initial active shift must commit.",
        store.putRecord("form-outbox-shift-create-" + suffix, "SHIFT", shift).accepted);
    assertTrue("Initial trip must commit.",
        store.putRecord("form-outbox-trip-create-" + suffix, "TRIP", trip).accepted);

    AttachedOverlayService service = new AttachedOverlayService();
    service.attach(context);
    SharedPreferences prefs = context.getSharedPreferences("kfe_overlay", Context.MODE_PRIVATE);
    prepareSnapshot(prefs, shiftId, tripId);
    JSONObject payload = new JSONObject()
        .put("fare", "275").put("toll", "0").put("parking", "0")
        .put("tollTreatment", "INCLUDED").put("parkingTreatment", "INCLUDED");
    String eventId = KfeNativeWorkActionsPlugin.recordPendingAction(
        context, "ENTER_FARE", tripId, payload.toString());
    assertTrue("The form transport event must be durably queued before canonical write.",
        KfeNativeEventStore.get(context).contains(eventId));

    // Model a concurrent shift-end winning after the outbox append but before
    // the form's canonical write. The native form must fail closed and remain retryable.
    JSONObject endedShift = new JSONObject(shift.toString())
        .put("status", "ENDED").put("updatedAt", "2099-01-01T00:00:00.000Z");
    assertTrue("Concurrent shift end must commit.",
        store.putRecord("form-outbox-shift-end-" + suffix, "SHIFT", endedShift).accepted);
    try {
      invoke(service, "persistCanonicalTripForm",
          new Class<?>[]{String.class, String.class, JSONObject.class, String.class},
          "FARE", tripId, payload, eventId);
      throw new AssertionError("Form must not commit after canonical shift end.");
    } catch (InvocationTargetException expected) {
      assertTrue("Canonical shift-end refusal must be explicit.",
          expected.getCause() instanceof IllegalStateException
              && expected.getCause().getMessage().contains("shift is no longer active"));
    }
    JSONObject refusedTrip = KfeCanonicalWorkStore.get(context).getRecord("TRIP", tripId);
    assertEquals("Failed form must not mutate the canonical trip.", "COMPLETED",
        refusedTrip.getJSONObject("record").getString("status"));
    assertTrue("Failed canonical write must not lose the durable outbox event.",
        KfeNativeEventStore.get(context).contains(eventId));
    assertPendingEvent(KfeNativeEventStore.get(context).pending(500), tripId, "ENTER_FARE");

    // After authoritative shift state is restored by recovery, retry with the
    // exact same event ID. A second replay must be idempotent across lost ack.
    JSONObject restoredShift = new JSONObject(endedShift.toString())
        .put("status", "ACTIVE").put("updatedAt", "2100-01-01T00:00:00.000Z");
    assertTrue("Recovered active shift must commit.",
        KfeCanonicalWorkStore.get(context).putRecord(
            "form-outbox-shift-restore-" + suffix, "SHIFT", restoredShift).accepted);
    invoke(service, "persistCanonicalTripForm",
        new Class<?>[]{String.class, String.class, JSONObject.class, String.class},
        "FARE", tripId, payload, eventId);
    invoke(service, "persistCanonicalTripForm",
        new Class<?>[]{String.class, String.class, JSONObject.class, String.class},
        "FARE", tripId, payload, eventId);

    JSONObject savedTrip = KfeCanonicalWorkStore.get(context).getRecord("TRIP", tripId);
    JSONObject savedShift = KfeCanonicalWorkStore.get(context).getRecord("SHIFT", shiftId);
    assertEquals("Retried fare must be canonical once.", "COMPLETED",
        savedTrip.getJSONObject("record").getString("status"));
    assertEquals(275d, savedTrip.getJSONObject("record").getDouble("revenue"), 0.001d);
    assertEquals("Retry must derive revenue from the canonical fare without duplication.", 275d,
        savedShift.getJSONObject("record").getDouble("revenue"), 0.001d);
    assertPendingEvent(KfeNativeEventStore.get(context).pending(500), tripId, "ENTER_FARE");
  }

  @Test public void formOutboxSurvivesInjectedCanonicalSqliteWriteFailureAndRetriesIdempotently() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    String suffix = Long.toString(System.currentTimeMillis());
    String shiftId = "form-sql-failure-shift-" + suffix;
    String tripId = "form-sql-failure-trip-" + suffix;
    String triggerName = "inject_form_write_failure_" + suffix;
    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    JSONObject shift = new JSONObject()
        .put("id", shiftId).put("status", "ACTIVE").put("revenue", 0)
        .put("updatedAt", "2026-01-01T00:00:00.000Z");
    JSONObject trip = new JSONObject()
        .put("id", tripId).put("shiftId", shiftId).put("status", "COMPLETED")
        .put("tripStage", "COMPLETED").put("updatedAt", "2026-01-01T00:00:00.000Z");
    assertTrue("Initial shift must commit.",
        store.putRecord("form-sql-failure-shift-create-" + suffix, "SHIFT", shift).accepted);
    assertTrue("Initial trip must commit.",
        store.putRecord("form-sql-failure-trip-create-" + suffix, "TRIP", trip).accepted);

    JSONObject payload = new JSONObject()
        .put("fare", "275").put("toll", "0").put("parking", "0")
        .put("tollTreatment", "INCLUDED").put("parkingTreatment", "INCLUDED");
    String eventId = KfeNativeWorkActionsPlugin.recordPendingAction(
        context, "ENTER_FARE", tripId, payload.toString());
    assertTrue("Durable outbox event must exist before canonical write begins.",
        KfeNativeEventStore.get(context).contains(eventId));

    // Force SQLite itself to reject the canonical trip insert after the durable
    // form event has been queued. This exercises a storage failure, not merely
    // a business-rule refusal such as an already-ended shift.
    Method dbGetter = SQLiteOpenHelper.class.getDeclaredMethod("getWritableDatabase");
    dbGetter.setAccessible(true);
    SQLiteDatabase db = (SQLiteDatabase) dbGetter.invoke(store);
    db.execSQL("CREATE TRIGGER " + triggerName
        + " BEFORE INSERT ON canonical_records WHEN NEW.entity_id='" + tripId + "'"
        + " BEGIN SELECT RAISE(ABORT, 'INJECTED_CANONICAL_FORM_WRITE_FAILURE'); END");

    AttachedOverlayService service = new AttachedOverlayService();
    service.attach(context);
    prepareSnapshot(context.getSharedPreferences("kfe_overlay", Context.MODE_PRIVATE), shiftId, tripId);
    try {
      try {
        invoke(service, "persistCanonicalTripForm",
            new Class<?>[]{String.class, String.class, JSONObject.class, String.class},
            "FARE", tripId, payload, eventId);
        throw new AssertionError("Injected SQLite failure must prevent the form from being marked committed.");
      } catch (InvocationTargetException expected) {
        assertTrue("The form must surface the injected SQLite failure, not report a successful save.",
            expected.getCause() instanceof android.database.sqlite.SQLiteException
                && String.valueOf(expected.getCause().getMessage()).contains("INJECTED_CANONICAL_FORM_WRITE_FAILURE"));
      }
      JSONObject unchanged = KfeCanonicalWorkStore.get(context).getRecord("TRIP", tripId);
      assertEquals("Canonical trip must remain unchanged after the failed transaction.", "COMPLETED",
          unchanged.getJSONObject("record").getString("status"));
      assertTrue("Failed canonical write must retain its durable event for retry.",
          KfeNativeEventStore.get(context).contains(eventId));
      assertPendingEvent(KfeNativeEventStore.get(context).pending(500), tripId, "ENTER_FARE");
    } finally {
      db.execSQL("DROP TRIGGER IF EXISTS " + triggerName);
    }

    // Retry the exact same durable command after storage recovers. Repeating it
    // must not create a second fare or duplicate the shift revenue projection.
    invoke(service, "persistCanonicalTripForm",
        new Class<?>[]{String.class, String.class, JSONObject.class, String.class},
        "FARE", tripId, payload, eventId);
    invoke(service, "persistCanonicalTripForm",
        new Class<?>[]{String.class, String.class, JSONObject.class, String.class},
        "FARE", tripId, payload, eventId);
    JSONObject savedTrip = KfeCanonicalWorkStore.get(context).getRecord("TRIP", tripId);
    JSONObject savedShift = KfeCanonicalWorkStore.get(context).getRecord("SHIFT", shiftId);
    assertEquals("Successful retry must commit the trip once.", "COMPLETED",
        savedTrip.getJSONObject("record").getString("status"));
    assertEquals(275d, savedTrip.getJSONObject("record").getDouble("revenue"), 0.001d);
    assertEquals("Revenue projection must not double-count the retry.", 275d,
        savedShift.getJSONObject("record").getDouble("revenue"), 0.001d);
    assertPendingEvent(KfeNativeEventStore.get(context).pending(500), tripId, "ENTER_FARE");

    cleanupNativeRecords(context, shiftId, tripId, "", "");
    SQLiteOpenHelper eventStore = KfeNativeEventStore.get(context);
    SQLiteDatabase eventDb = (SQLiteDatabase) dbGetter.invoke(eventStore);
    eventDb.delete("native_events", "trip_id=?", new String[]{tripId});
    eventStore.close();
    Field eventSingleton = KfeNativeEventStore.class.getDeclaredField("instance");
    eventSingleton.setAccessible(true);
    eventSingleton.set(null, null);
  }

  @Test public void staleOverlaySnapshotCannotOverwriteExistingCanonicalTripFieldsDuringFareSave() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    String suffix = Long.toString(System.currentTimeMillis());
    String shiftId = "stale-overlay-shift-" + suffix;
    String tripId = "stale-overlay-trip-" + suffix;
    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    JSONObject shift = new JSONObject()
        .put("id", shiftId).put("status", "ACTIVE").put("revenue", 0)
        .put("updatedAt", "2026-01-01T00:00:00.000Z");
    JSONObject canonicalTrip = new JSONObject()
        .put("id", tripId).put("shiftId", shiftId).put("status", "ACTIVE")
        .put("tripStage", "COMPLETED").put("distanceKm", 12.5d)
        .put("pickupAddress", "Canonical pickup").put("updatedAt", "2026-01-01T00:00:00.000Z");
    assertTrue("Active shift fixture must commit.",
        store.putRecord("stale-overlay-shift-create-" + suffix, "SHIFT", shift).accepted);
    assertTrue("Canonical trip fixture must commit.",
        store.putRecord("stale-overlay-trip-create-" + suffix, "TRIP", canonicalTrip).accepted);

    // Deliberately seed an older PWA snapshot with conflicting values. It may
    // fill fields absent from native canonical storage, but cannot roll back
    // values already owned by the native canonical record.
    JSONObject staleShift = new JSONObject().put("id", shiftId).put("status", "ENDED");
    JSONObject staleTrip = new JSONObject()
        .put("id", tripId).put("shiftId", "wrong-shift-" + suffix)
        .put("status", "CANCELLED").put("distanceKm", 999d)
        .put("pickupAddress", "Stale pickup").put("oldPwaOnlyField", "preserve-if-absent");
    context.getSharedPreferences("kfe_overlay", Context.MODE_PRIVATE).edit()
        .putString(STATE_KEY, new JSONObject().put("shift", staleShift).put("trip", staleTrip).toString())
        .commit();

    String eventId = KfeNativeWorkActionsPlugin.recordPendingAction(
        context, "ENTER_FARE", tripId, "{\"fare\":\"275\",\"toll\":\"0\",\"parking\":\"0\"}");
    AttachedOverlayService service = new AttachedOverlayService();
    service.attach(context);
    invoke(service, "persistCanonicalTripForm",
        new Class<?>[]{String.class, String.class, JSONObject.class, String.class},
        "FARE", tripId, new JSONObject().put("fare", "275").put("toll", "0").put("parking", "0"), eventId);

    JSONObject saved = KfeCanonicalWorkStore.get(context).getRecord("TRIP", tripId).getJSONObject("record");
    assertEquals("Canonical shift association must win over stale snapshot.", shiftId, saved.getString("shiftId"));
    assertEquals("Fare save must preserve canonical distance.", 12.5d, saved.getDouble("distanceKm"), 0.001d);
    assertEquals("Fare save must preserve canonical pickup.", "Canonical pickup", saved.getString("pickupAddress"));
    assertEquals("A snapshot-only field can be carried forward without overriding canonical fields.",
        "preserve-if-absent", saved.getString("oldPwaOnlyField"));
    assertEquals("Fare save still applies the submitted fare.", 275d, saved.getDouble("revenue"), 0.001d);
    assertEquals("Native fare remains the canonical trip status.", "COMPLETED", saved.getString("status"));
  }

  @Test public void lifecycleOutboxRetryReusesPendingAndAcknowledgedEventAcrossCrashBoundary() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    KfeNativeEventStore events = KfeNativeEventStore.get(context);
    String tripId = "native-lifecycle-retry-" + System.currentTimeMillis();

    // Simulate process death after outbox insertion but before canonical write:
    // the next attempt must resolve to the same durable event, not append twice.
    String first = events.append("GO_TO_PICKUP", tripId, "");
    String retryBeforeReplay = events.append("GO_TO_PICKUP", tripId, "");
    assertEquals("Retry must reuse the pending logical lifecycle event.", first, retryBeforeReplay);
    assertPendingEvent(events.pending(500), tripId, "GO_TO_PICKUP");

    // Also cover death after PWA has replayed/acknowledged the event but before
    // the overlay persisted its next stage. Retrying must not create a new effect.
    assertTrue("The first lifecycle event should acknowledge exactly once.", events.acknowledge(first));
    String retryAfterReplay = events.append("GO_TO_PICKUP", tripId, "");
    assertEquals("Acknowledged lifecycle events must remain idempotent on retry.", first, retryAfterReplay);
    assertTrue("Retry must not recreate an acknowledged event as pending.",
        !hasPendingEvent(events.pending(500), tripId, "GO_TO_PICKUP"));
  }

  @Test public void prepareLifecycleProcessDeathAtBoundary() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    android.os.Bundle args = InstrumentationRegistry.getArguments();
    String stage = args.getString("lifecycleStage", "");
    String boundary = args.getString("lifecycleBoundary", "");
    assertTrue("Unsupported lifecycle stage.", stage.equals("GO_TO_PICKUP") || stage.equals("START_RIDE") || stage.equals("END_RIDE"));
    assertTrue("Unsupported lifecycle boundary.", boundary.equals("AFTER_CHECKPOINT") || boundary.equals("AFTER_OUTBOX") || boundary.equals("AFTER_CANONICAL"));

    String suffix = Long.toString(System.currentTimeMillis());
    String shiftId = "lifecycle-process-death-shift-" + suffix;
    String tripId = "lifecycle-process-death-trip-" + suffix;
    long startAt = stage.equals("GO_TO_PICKUP") ? 0L : System.currentTimeMillis() - 5000L;
    SharedPreferences prefs = context.getSharedPreferences("kfe_overlay", Context.MODE_PRIVATE);
    prefs.edit()
        .putString("lifecycleProcessDeathStage", stage)
        .putString("lifecycleProcessDeathBoundary", boundary)
        .putString("lifecycleProcessDeathShiftId", shiftId)
        .putString("lifecycleProcessDeathTripId", tripId)
        .putLong("lifecycleProcessDeathStartAt", startAt)
        .putString("lifecycleProcessDeathPreEventId", "")
        .putString("lifecycleProcessDeathReady", "")
        .commit();

    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    JSONObject shift = new JSONObject().put("id", shiftId).put("status", "ACTIVE")
        .put("revenue", 0).put("updatedAt", java.time.Instant.now().toString());
    assertTrue("Process-death fixture shift must commit.",
        store.putRecord("lifecycle-process-death-shift-create-" + tripId, "SHIFT", shift).accepted);
    prepareSnapshot(prefs, shiftId, tripId);

    AttachedOverlayService service = new AttachedOverlayService();
    service.attach(context);
    setField(service, "actionStage", stage);
    setField(service, "pendingTripId", tripId);
    setField(service, "tripStartAt", startAt);
    setField(service, "defaultOperator", "Uber");

    KfeOverlayService.lifecycleFaultInjectorForTests = reached -> {
      if (!boundary.equals(reached)) return;
      String eventId = pendingEventIdFor(KfeNativeEventStore.get(context).pending(500), tripId, stage);
      prefs.edit()
          .putString("lifecycleProcessDeathPreEventId", eventId)
          .putString("lifecycleProcessDeathReady", stage + "_" + boundary)
          .commit();
      android.util.Log.i("KFE_LIFECYCLE_DEATH", "READY_FOR_PROCESS_KILL stage=" + stage + " boundary=" + boundary);
      // The CI shell must SIGKILL this process while it is parked at the exact
      // production persistence boundary. Timeout prevents a broken harness hanging forever.
      for (int i = 0; i < 90; i++) SystemClock.sleep(1000L);
      throw new AssertionError("CI harness did not kill process at " + stage + "/" + boundary);
    };
    String canonicalStage = stage.equals("GO_TO_PICKUP") ? "GOING_TO_PICKUP"
        : stage.equals("START_RIDE") ? "RIDE_STARTED" : "COMPLETED";
    invoke(service, "persistLifecycleAction", new Class<?>[]{String.class, String.class, boolean.class},
        stage, canonicalStage, stage.equals("START_RIDE"));
    throw new AssertionError("Process-death preparation unexpectedly returned without reaching its kill boundary.");
  }

  @Test public void verifyLifecycleProcessDeathRecovery() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    SharedPreferences prefs = context.getSharedPreferences("kfe_overlay", Context.MODE_PRIVATE);
    String stage = prefs.getString("lifecycleProcessDeathStage", "");
    String boundary = prefs.getString("lifecycleProcessDeathBoundary", "");
    String shiftId = prefs.getString("lifecycleProcessDeathShiftId", "");
    String tripId = prefs.getString("lifecycleProcessDeathTripId", "");
    String preDeathEventId = prefs.getString("lifecycleProcessDeathPreEventId", "");
    long startAt = prefs.getLong("lifecycleProcessDeathStartAt", 0L);
    assertTrue("Harness must have killed the app at the requested boundary.",
        (stage + "_" + boundary).equals(prefs.getString("lifecycleProcessDeathReady", "")));
    assertTrue("Process-death fixture identity must survive app restart.", !shiftId.isEmpty() && !tripId.isEmpty());

    String canonicalStage = stage.equals("GO_TO_PICKUP") ? "GOING_TO_PICKUP"
        : stage.equals("START_RIDE") ? "RIDE_STARTED" : "COMPLETED";
    KfeNativeEventStore events = KfeNativeEventStore.get(context);
    String eventBeforeRetry = pendingEventIdFor(events.pending(500), tripId, stage);
    if (boundary.equals("AFTER_CHECKPOINT")) {
      assertEquals("A kill after checkpoint must precede outbox insertion.", "", eventBeforeRetry);
      assertEquals("", preDeathEventId);
    } else {
      assertTrue("Outbox event must survive real process death.", !eventBeforeRetry.isEmpty());
      assertEquals("Outbox event identity must survive real process death.", preDeathEventId, eventBeforeRetry);
    }

    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    JSONObject beforeRetry = store.getRecord("TRIP", tripId);
    if (boundary.equals("AFTER_CANONICAL")) {
      assertTrue("Canonical record committed before the kill must survive restart.", beforeRetry.optBoolean("found"));
      assertEquals(canonicalStage, beforeRetry.getJSONObject("record").getString("tripStage"));
    } else {
      assertTrue("Canonical write must not appear before its boundary.", !beforeRetry.optBoolean("found"));
    }

    AttachedOverlayService recovered = new AttachedOverlayService();
    recovered.attach(context);
    invoke(recovered, "restoreNativeWorkflowCheckpoint", new Class<?>[]{});
    assertEquals("Restart must restore the original trip identity.", tripId, getFieldString(recovered, "pendingTripId"));
    assertEquals("Restart must restore the original lifecycle action.", stage, getFieldString(recovered, "actionStage"));
    String retriedEventId = String.valueOf(invoke(recovered, "persistLifecycleAction",
        new Class<?>[]{String.class, String.class, boolean.class}, stage, canonicalStage, stage.equals("START_RIDE")));
    if (!preDeathEventId.isEmpty()) {
      assertEquals("Retry after process death must reuse the same durable event ID.", preDeathEventId, retriedEventId);
    }

    JSONArray pendingAfterRetry = events.pending(500);
    assertEquals("Recovery must leave one pending lifecycle event, with no duplicate or loss.",
        1, countPendingEventsFor(pendingAfterRetry, tripId, stage));
    assertEquals(retriedEventId, pendingEventIdFor(pendingAfterRetry, tripId, stage));
    JSONObject canonical = KfeCanonicalWorkStore.get(context).getRecord("TRIP", tripId);
    assertTrue("Canonical lifecycle record must exist after process-death retry.", canonical.optBoolean("found"));
    JSONObject record = canonical.getJSONObject("record");
    assertEquals(canonicalStage, record.getString("tripStage"));
    assertEquals(stage.equals("END_RIDE") ? "COMPLETED" : "ACTIVE", record.getString("status"));
    if (stage.equals("START_RIDE")) {
      assertEquals("Ride-start timestamp must survive process death.",
          new java.util.Date(startAt).toInstant().toString(), record.getString("tripStartAt"));
    }

    android.util.Log.i("KFE_LIFECYCLE_DEATH", "LIFECYCLE_PROCESS_DEATH_CASE_PASS stage=" + stage + " boundary=" + boundary);
    cleanupNativeRecords(context, shiftId, tripId, "", "");
    SQLiteOpenHelper eventStore = KfeNativeEventStore.get(context);
    Method dbGetter = SQLiteOpenHelper.class.getDeclaredMethod("getWritableDatabase");
    dbGetter.setAccessible(true);
    SQLiteDatabase eventDb = (SQLiteDatabase) dbGetter.invoke(eventStore);
    eventDb.delete("native_events", "trip_id=?", new String[]{tripId});
    eventStore.close();
    Field eventSingleton = KfeNativeEventStore.class.getDeclaredField("instance");
    eventSingleton.setAccessible(true);
    eventSingleton.set(null, null);
    prefs.edit().remove(STATE_KEY)
        .remove("lifecycleProcessDeathStage").remove("lifecycleProcessDeathBoundary")
        .remove("lifecycleProcessDeathShiftId").remove("lifecycleProcessDeathTripId")
        .remove("lifecycleProcessDeathStartAt").remove("lifecycleProcessDeathPreEventId")
        .remove("lifecycleProcessDeathReady").commit();
  }

  @Test public void lifecyclePersistenceRecoversAfterEveryCheckpointOutboxAndCanonicalBoundary() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    String suffix = Long.toString(System.currentTimeMillis());
    String[] stages = {"GO_TO_PICKUP", "START_RIDE", "END_RIDE"};
    String[] canonicalStages = {"GOING_TO_PICKUP", "RIDE_STARTED", "COMPLETED"};
    String[] boundaries = {"AFTER_CHECKPOINT", "AFTER_OUTBOX", "AFTER_CANONICAL"};

    for (int stageIndex = 0; stageIndex < stages.length; stageIndex++) {
      for (String boundary : boundaries) {
        String caseId = stages[stageIndex].toLowerCase() + "-" + boundary.toLowerCase();
        String shiftId = "lifecycle-fault-shift-" + suffix + "-" + caseId;
        String tripId = "lifecycle-fault-trip-" + suffix + "-" + caseId;
        String eventStage = stages[stageIndex];
        long startAt = System.currentTimeMillis() - 5000L;
        SharedPreferences prefs = context.getSharedPreferences("kfe_overlay", Context.MODE_PRIVATE);
        KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
        JSONObject shift = new JSONObject()
            .put("id", shiftId).put("status", "ACTIVE").put("revenue", 0)
            .put("updatedAt", java.time.Instant.now().toString());
        assertTrue("Fault fixture shift must commit.",
            store.putRecord("lifecycle-fault-shift-create-" + tripId, "SHIFT", shift).accepted);

        prepareSnapshot(prefs, shiftId, tripId);
        AttachedOverlayService firstAttempt = new AttachedOverlayService();
        firstAttempt.attach(context);
        setField(firstAttempt, "actionStage", eventStage);
        setField(firstAttempt, "pendingTripId", tripId);
        setField(firstAttempt, "tripStartAt", stageIndex == 0 ? 0L : startAt);
        setField(firstAttempt, "defaultOperator", "Uber");

        final boolean[] injected = {false};
        KfeOverlayService.lifecycleFaultInjectorForTests = reached -> {
          if (!injected[0] && boundary.equals(reached)) {
            injected[0] = true;
            throw new IllegalStateException("INJECTED_" + boundary);
          }
        };
        String eventIdBeforeRetry = "";
        try {
          try {
            invoke(firstAttempt, "persistLifecycleAction",
                new Class<?>[]{String.class, String.class, boolean.class},
                eventStage, canonicalStages[stageIndex], stageIndex == 1);
            throw new AssertionError("Expected injected interruption at " + boundary);
          } catch (InvocationTargetException expected) {
            assertTrue("Failure must be the requested injected interruption.",
                expected.getCause() instanceof IllegalStateException
                    && expected.getCause().getMessage().equals("INJECTED_" + boundary));
          }
        } finally {
          KfeOverlayService.lifecycleFaultInjectorForTests = null;
        }
        assertTrue("Requested persistence boundary must have been reached.", injected[0]);

        JSONArray eventsAfterFault = KfeNativeEventStore.get(context).pending(500);
        eventIdBeforeRetry = pendingEventIdFor(eventsAfterFault, tripId, eventStage);
        if ("AFTER_CHECKPOINT".equals(boundary)) {
          assertEquals("Checkpoint failure must occur before outbox insertion.", "", eventIdBeforeRetry);
        } else {
          assertTrue("Outbox event must survive interruption at " + boundary, !eventIdBeforeRetry.isEmpty());
        }

        // Recreate the service and use the same checkpoint restoration method
        // called from onCreate(), then retry the exact same logical action.
        AttachedOverlayService recovered = new AttachedOverlayService();
        recovered.attach(context);
        invoke(recovered, "restoreNativeWorkflowCheckpoint", new Class<?>[]{});
        assertEquals("Recovery must retain the original trip ID.", tripId,
            getFieldString(recovered, "pendingTripId"));
        assertEquals("Recovery must retain the lifecycle stage for retry.", eventStage,
            getFieldString(recovered, "actionStage"));
        String retriedEventId = String.valueOf(invoke(recovered, "persistLifecycleAction",
            new Class<?>[]{String.class, String.class, boolean.class},
            eventStage, canonicalStages[stageIndex], stageIndex == 1));
        if (!eventIdBeforeRetry.isEmpty()) {
          assertEquals("Retry must reuse the pre-crash outbox event.", eventIdBeforeRetry, retriedEventId);
        }

        JSONArray eventsAfterRetry = KfeNativeEventStore.get(context).pending(500);
        assertEquals("Recovery must leave exactly one pending lifecycle event.",
            1, countPendingEventsFor(eventsAfterRetry, tripId, eventStage));
        assertEquals("Recovered event ID must be the sole pending event.",
            retriedEventId, pendingEventIdFor(eventsAfterRetry, tripId, eventStage));

        JSONObject canonical = KfeCanonicalWorkStore.get(context).getRecord("TRIP", tripId);
        assertTrue("Canonical lifecycle record must exist after retry.", canonical.optBoolean("found"));
        JSONObject record = canonical.getJSONObject("record");
        assertEquals("Canonical lifecycle stage must converge after retry.",
            canonicalStages[stageIndex], record.getString("tripStage"));
        assertEquals("Canonical status must match the lifecycle stage.",
            stageIndex == 2 ? "COMPLETED" : "ACTIVE", record.getString("status"));
        if (stageIndex == 1) {
          assertEquals("Ride-start timestamp must survive the interrupted write.",
              new java.util.Date(startAt).toInstant().toString(), record.getString("tripStartAt"));
        }

        android.util.Log.i("KFE_LIFECYCLE_FAULT", "LIFECYCLE_FAULT_CASE_PASS stage=" + eventStage + " boundary=" + boundary);

        // Remove only this fixture's canonical and outbox rows before the next
        // scenario so each injected boundary starts from an isolated state.
        cleanupNativeRecords(context, shiftId, tripId, "", "");
        SQLiteOpenHelper eventStore = KfeNativeEventStore.get(context);
        Method dbGetter = SQLiteOpenHelper.class.getDeclaredMethod("getWritableDatabase");
        dbGetter.setAccessible(true);
        SQLiteDatabase eventDb = (SQLiteDatabase) dbGetter.invoke(eventStore);
        eventDb.delete("native_events", "trip_id=?", new String[]{tripId});
        eventStore.close();
        Field eventSingleton = KfeNativeEventStore.class.getDeclaredField("instance");
        eventSingleton.setAccessible(true);
        eventSingleton.set(null, null);
        prefs.edit().remove(STATE_KEY).commit();
      }
    }
    KfeOverlayService.lifecycleFaultInjectorForTests = null;
  }

  private static String getFieldString(Object target, String name) throws Exception {
    Field field = KfeOverlayService.class.getDeclaredField(name);
    field.setAccessible(true);
    return String.valueOf(field.get(target));
  }

  private static String pendingEventIdFor(JSONArray pending, String tripId, String stage) {
    for (int i = 0; i < pending.length(); i++) {
      JSONObject event = pending.optJSONObject(i);
      if (event != null && tripId.equals(event.optString("tripId", ""))
          && stage.equals(event.optString("stage", ""))) return event.optString("eventId", "");
    }
    return "";
  }

  private static int countPendingEventsFor(JSONArray pending, String tripId, String stage) {
    int count = 0;
    for (int i = 0; i < pending.length(); i++) {
      JSONObject event = pending.optJSONObject(i);
      if (event != null && tripId.equals(event.optString("tripId", ""))
          && stage.equals(event.optString("stage", ""))) count++;
    }
    return count;
  }

  @Test public void reopeningPwaCatchesUpNativeCanonicalRecordsWithoutReplayingPendingEvents() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    SharedPreferences prefs = context.getSharedPreferences("kfe_overlay", Context.MODE_PRIVATE);
    String shiftId = prefs.getString("nativeFullShiftCatchupShiftId", "");
    String tripA = prefs.getString("nativeFullShiftCatchupFareTripA", "");
    String tripB = prefs.getString("nativeFullShiftCatchupFareTripB", "");
    String cancelledTrip = prefs.getString("nativeFullShiftCatchupCancelledTrip", "");
    assertTrue("The native-only persistence test must run first.", !shiftId.isEmpty() && !tripA.isEmpty() && !tripB.isEmpty() && !cancelledTrip.isEmpty());

    // Acknowledge the synthetic transport events to isolate the separate canonical
    // snapshot catch-up path. The previous test already verified the events stayed
    // pending after the native commit and store reopen.
    KfeNativeEventStore events = KfeNativeEventStore.get(context);
    JSONArray pending = events.pending(100);
    acknowledgeEventForTrip(events, pending, tripA, "ENTER_FARE");
    acknowledgeEventForTrip(events, pending, tripB, "ENTER_FARE");
    acknowledgeEventForTrip(events, pending, cancelledTrip, "CANCEL_RIDE");

    ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class);
    try {
      String readiness = "";
      long readyDeadline = SystemClock.uptimeMillis() + 90000L;
      while (SystemClock.uptimeMillis() < readyDeadline) {
        readiness = decodeJsString(evaluate(scenario,
            "(function(){"
              + "const text=document.body.innerText||'';"
              + "const skip=[...document.querySelectorAll('button')].find(b=>b.innerText.includes(\"Skip — I'll fill this later\")&&!b.disabled);"
              + "if(skip){skip.click();return 'SKIPPED';}"
              + "return text.includes('KFE WORK')&&(text.includes('START SHIFT')||text.includes('ONLINE')||text.includes('END SHIFT'))?'READY':'WAIT';"
              + "})()"));
        if ("READY".equals(readiness)) break;
        SystemClock.sleep(500L);
      }
      assertEquals("PWA Work must mount before checking canonical catch-up.", "READY", readiness);

      String query = "(function(){"
          + "const root=document.documentElement;"
          + "const req=indexedDB.open('kanishka_kfe_canonical_db');"
          + "req.onerror=()=>root.dataset.nativeCatchup='ERROR_OPEN:'+String(req.error);"
          + "req.onsuccess=()=>{"
          + "const db=req.result;"
          + "if(!db.objectStoreNames.contains('trips')||!db.objectStoreNames.contains('shifts')){root.dataset.nativeCatchup='WAITING_SCHEMA';db.close();return;}"
          + "const tx=db.transaction(['trips','shifts'],'readonly');"
          + "const tripsReq=tx.objectStore('trips').getAll();"
          + "const shiftReq=tx.objectStore('shifts').get(" + JSONObject.quote(shiftId) + ");"
          + "tx.oncomplete=()=>{"
          + "const all=tripsReq.result||[];"
          + "const ids=[" + JSONObject.quote(tripA) + "," + JSONObject.quote(tripB) + "," + JSONObject.quote(cancelledTrip) + "];"
          + "const found=all.filter(x=>ids.includes(String(x.id||'')));"
          + "root.dataset.nativeCatchup=JSON.stringify({shiftFound:!!shiftReq.result,tripIds:found.map(x=>String(x.id)),statuses:found.map(x=>String(x.status||'')),revenues:found.map(x=>x.revenue==null?null:Number(x.revenue)),shiftRevenue:shiftReq.result&&shiftReq.result.revenue!=null?Number(shiftReq.result.revenue):null,cancellation:found.filter(x=>String(x.id)===" + JSONObject.quote(cancelledTrip) + ").map(x=>({reason:x.cancelReason,fee:x.cancelledRevenue}))});"
          + "db.close();};"
          + "tx.onerror=()=>{root.dataset.nativeCatchup='ERROR_TX:'+String(tx.error);db.close();};"
          + "};"
          + "return 'STARTED';"
          + "})()";

      JSONObject recovered = null;
      long catchupDeadline = SystemClock.uptimeMillis() + 90000L;
      while (SystemClock.uptimeMillis() < catchupDeadline) {
        evaluate(scenario, query);
        SystemClock.sleep(500L);
        String value = decodeJsString(evaluate(scenario,
            "document.documentElement.dataset.nativeCatchup||'PENDING'"));
        if (value.startsWith("ERROR_")) throw new AssertionError("PWA canonical catch-up failed: " + value);
        if (value.startsWith("{")) {
          JSONObject candidate = new JSONObject(value);
          JSONArray ids = candidate.optJSONArray("tripIds");
          if (candidate.optBoolean("shiftFound") && ids != null && ids.length() == 3) {
            recovered = candidate;
            break;
          }
        }
      }
      assertNotNull("Reopening PWA must import the native canonical shift and all three trip records.", recovered);
      assertTrue(recovered.optBoolean("shiftFound"));
      JSONArray ids = recovered.getJSONArray("tripIds");
      assertTrue(ids.toString().contains(tripA));
      assertTrue(ids.toString().contains(tripB));
      assertTrue(ids.toString().contains(cancelledTrip));
      assertEquals("COMPLETED", statusFor(recovered, tripA));
      assertEquals("COMPLETED", statusFor(recovered, tripB));
      assertEquals("CANCELLED", statusFor(recovered, cancelledTrip));
      assertEquals(250d, revenueFor(recovered, tripA), 0.001d);
      assertEquals(150d, revenueFor(recovered, tripB), 0.001d);
      assertEquals(420d, recovered.getDouble("shiftRevenue"), 0.001d);
      JSONArray cancellation = recovered.getJSONArray("cancellation");
      assertEquals(1, cancellation.length());
      assertEquals("PASSENGER", cancellation.getJSONObject(0).getString("reason"));
      assertEquals(20d, cancellation.getJSONObject(0).getDouble("fee"), 0.001d);

      // Now simulate an old PWA IndexedDB snapshot arriving after the native
      // canonical fare/status writes have committed. Reload the PWA so its real
      // startup catch-up path must reconcile the stale local values again.
      String seedStalePwa = "(function(){"
          + "const root=document.documentElement;root.dataset.staleSeed='PENDING';"
          + "const req=indexedDB.open('kanishka_kfe_canonical_db');"
          + "req.onerror=()=>root.dataset.staleSeed='ERROR_OPEN';"
          + "req.onsuccess=()=>{const db=req.result;"
          + "if(!db.objectStoreNames.contains('trips')||!db.objectStoreNames.contains('shifts')){root.dataset.staleSeed='ERROR_SCHEMA';db.close();return;}"
          + "const tx=db.transaction(['trips','shifts'],'readwrite');"
          + "const oldAt='2026-10-15T00:00:00.000Z';"
          + "const tripReq=tx.objectStore('trips').get(" + JSONObject.quote(tripA) + ");"
          + "const shiftReq=tx.objectStore('shifts').get(" + JSONObject.quote(shiftId) + ");"
          + "tripReq.onsuccess=()=>{const value=tripReq.result;if(!value){root.dataset.staleSeed='ERROR_TRIP_MISSING';return;}value.status='ACTIVE';value.revenue=1;value.updatedAt=oldAt;tx.objectStore('trips').put(value);};"
          + "shiftReq.onsuccess=()=>{const value=shiftReq.result;if(!value){root.dataset.staleSeed='ERROR_SHIFT_MISSING';return;}value.status='ACTIVE';value.revenue=1;value.updatedAt=oldAt;tx.objectStore('shifts').put(value);};"
          + "tx.oncomplete=()=>{root.dataset.staleSeed='DONE';db.close();};"
          + "tx.onerror=()=>{root.dataset.staleSeed='ERROR_TX';db.close();};};return 'STARTED';})()";
      evaluate(scenario, seedStalePwa);
      String staleSeedResult = "";
      long seedDeadline = SystemClock.uptimeMillis() + 15000L;
      while (SystemClock.uptimeMillis() < seedDeadline) {
        staleSeedResult = decodeJsString(evaluate(scenario,
            "document.documentElement.dataset.staleSeed||'PENDING'"));
        if (!"PENDING".equals(staleSeedResult)) break;
        SystemClock.sleep(200L);
      }
      assertEquals("Test must inject stale shift and trip values into PWA IndexedDB.", "DONE", staleSeedResult);
      evaluate(scenario, "location.reload();'RELOADING'");
      readiness = "";
      readyDeadline = SystemClock.uptimeMillis() + 90000L;
      while (SystemClock.uptimeMillis() < readyDeadline) {
        readiness = decodeJsString(evaluate(scenario,
            "(function(){"
              + "const text=document.body.innerText||'';"
              + "const skip=[...document.querySelectorAll('button')].find(b=>b.innerText.includes(\"Skip — I'll fill this later\")&&!b.disabled);"
              + "if(skip){skip.click();return 'SKIPPED';}"
              + "return text.includes('KFE WORK')&&(text.includes('START SHIFT')||text.includes('ONLINE')||text.includes('END SHIFT'))?'READY':'WAIT';"
              + "})()"));
        if ("READY".equals(readiness)) break;
        SystemClock.sleep(500L);
      }
      assertEquals("PWA must remount after the stale snapshot is seeded.", "READY", readiness);
      JSONObject recoveredAfterStale = null;
      long staleCatchupDeadline = SystemClock.uptimeMillis() + 90000L;
      while (SystemClock.uptimeMillis() < staleCatchupDeadline) {
        evaluate(scenario, query);
        SystemClock.sleep(500L);
        String value = decodeJsString(evaluate(scenario,
            "document.documentElement.dataset.nativeCatchup||'PENDING'"));
        if (value.startsWith("ERROR_")) throw new AssertionError("PWA stale-snapshot catch-up failed: " + value);
        if (value.startsWith("{")) {
          JSONObject candidate = new JSONObject(value);
          JSONArray idsAfter = candidate.optJSONArray("tripIds");
          if (candidate.optBoolean("shiftFound") && idsAfter != null && idsAfter.length() == 3
              && Math.abs(candidate.optDouble("shiftRevenue", -1d) - 420d) < 0.001d) {
            recoveredAfterStale = candidate;
            break;
          }
        }
      }
      assertNotNull("Stale PWA snapshot must be replaced by canonical catch-up.", recoveredAfterStale);
      assertEquals("COMPLETED", statusFor(recoveredAfterStale, tripA));
      assertEquals(250d, revenueFor(recoveredAfterStale, tripA), 0.001d);
      assertEquals(420d, recoveredAfterStale.getDouble("shiftRevenue"), 0.001d);
      KfeCanonicalWorkStore canonicalAfterStale = KfeCanonicalWorkStore.get(context);
      JSONObject nativeShiftAfterStale = canonicalAfterStale.getRecord("SHIFT", shiftId);
      JSONObject nativeTripAfterStale = canonicalAfterStale.getRecord("TRIP", tripA);
      assertEquals("Native canonical shift revenue must not be rolled back by stale PWA data.", 420d,
          nativeShiftAfterStale.getJSONObject("record").getDouble("revenue"), 0.001d);
      assertEquals("Native canonical trip status must not be rolled back by stale PWA data.", "COMPLETED",
          nativeTripAfterStale.getJSONObject("record").getString("status"));
      assertEquals(250d, nativeTripAfterStale.getJSONObject("record").getDouble("revenue"), 0.001d);
    } finally {
      try {
        String cleanup = "(function(){"
            + "const root=document.documentElement;"
            + "const req=indexedDB.open('kanishka_kfe_canonical_db');"
            + "req.onerror=()=>root.dataset.nativeCatchupCleanup='ERROR_OPEN';"
            + "req.onsuccess=()=>{const db=req.result;"
            + "if(!db.objectStoreNames.contains('trips')||!db.objectStoreNames.contains('shifts')){db.close();root.dataset.nativeCatchupCleanup='DONE';return;}"
            + "const tx=db.transaction(['trips','shifts'],'readwrite');"
            + "[" + JSONObject.quote(tripA) + "," + JSONObject.quote(tripB) + "," + JSONObject.quote(cancelledTrip) + "].forEach(id=>tx.objectStore('trips').delete(id));"
            + "tx.objectStore('shifts').delete(" + JSONObject.quote(shiftId) + ");"
            + "tx.oncomplete=()=>{root.dataset.nativeCatchupCleanup='DONE';db.close();};"
            + "tx.onerror=()=>{root.dataset.nativeCatchupCleanup='ERROR_TX';db.close();};};return 'STARTED';})()";
        evaluate(scenario, cleanup);
        SystemClock.sleep(300L);
      } catch (Exception ignored) { }
      scenario.close();
      cleanupNativeRecords(context, shiftId, tripA, tripB, cancelledTrip);
      prefs.edit().remove("nativeFullShiftCatchupShiftId")
          .remove("nativeFullShiftCatchupFareTripA")
          .remove("nativeFullShiftCatchupFareTripB")
          .remove("nativeFullShiftCatchupCancelledTrip").commit();
    }
  }

  private static void cleanupNativeRecords(Context context, String shiftId, String tripA,
      String tripB, String cancelledTrip) throws Exception {
    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    Method getter = SQLiteOpenHelper.class.getDeclaredMethod("getWritableDatabase");
    getter.setAccessible(true);
    SQLiteDatabase db = (SQLiteDatabase) getter.invoke(store);
    db.beginTransaction();
    try {
      for (String id : new String[]{shiftId, tripA, tripB, cancelledTrip}) {
        db.delete("canonical_audit", "entity_id=?", new String[]{id});
        db.delete("canonical_operations", "entity_id=?", new String[]{id});
        db.delete("canonical_records", "entity_id=?", new String[]{id});
      }
      db.setTransactionSuccessful();
    } finally {
      db.endTransaction();
      store.close();
      Field singleton = KfeCanonicalWorkStore.class.getDeclaredField("instance");
      singleton.setAccessible(true);
      singleton.set(null, null);
    }
  }

  private static void acknowledgeEventForTrip(KfeNativeEventStore store, JSONArray pending,
      String tripId, String stage) {
    for (int i = 0; i < pending.length(); i++) {
      JSONObject event = pending.optJSONObject(i);
      if (event != null && tripId.equals(event.optString("tripId", ""))
          && stage.equals(event.optString("stage", ""))) {
        assertTrue("Synthetic event should be acknowledged for the isolated PWA catch-up check.",
            store.acknowledge(event.optString("eventId", "")));
        return;
      }
    }
    throw new AssertionError("Expected event to acknowledge for " + tripId + " / " + stage);
  }

  private static double revenueFor(JSONObject recovered, String tripId) throws Exception {
    JSONArray ids = recovered.getJSONArray("tripIds");
    JSONArray revenues = recovered.getJSONArray("revenues");
    for (int i = 0; i < ids.length(); i++) {
      if (tripId.equals(ids.getString(i))) return revenues.isNull(i) ? 0d : revenues.getDouble(i);
    }
    throw new AssertionError("PWA catch-up missing revenue for trip " + tripId);
  }

  private static String statusFor(JSONObject recovered, String tripId) throws Exception {
    JSONArray ids = recovered.getJSONArray("tripIds");
    JSONArray statuses = recovered.getJSONArray("statuses");
    for (int i = 0; i < ids.length(); i++) if (tripId.equals(ids.getString(i))) return statuses.getString(i);
    throw new AssertionError("PWA catch-up missing trip " + tripId);
  }

  private static String decodeJsString(String value) throws Exception {
    if (value == null) return "";
    Object decoded = new JSONTokener(value).nextValue();
    return decoded == null ? "" : String.valueOf(decoded);
  }

  private static String evaluate(ActivityScenario<MainActivity> scenario, String javascript) throws Exception {
    java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);
    java.util.concurrent.atomic.AtomicReference<String> result = new java.util.concurrent.atomic.AtomicReference<>();
    scenario.onActivity(activity -> {
      WebView view = activity.getBridge().getWebView();
      view.evaluateJavascript(javascript, value -> { result.set(value); latch.countDown(); });
    });
    if (!latch.await(30, java.util.concurrent.TimeUnit.SECONDS)) throw new AssertionError("WebView JS evaluation timed out.");
    return result.get();
  }

  private static void runTripStages(AttachedOverlayService service, SharedPreferences prefs,
      String shiftId, String tripId) throws Exception {
    setField(service, "pendingTripId", tripId);
    Thread.sleep(5L);
    String pickupEvent = KfeNativeWorkActionsPlugin.recordPendingAction(service, "GO_TO_PICKUP", tripId, "");
    assertTrue("Pickup stage must commit without PWA replay.",
        (Boolean) invoke(service, "persistCanonicalTripStage",
            new Class<?>[]{String.class, boolean.class, String.class}, "GOING_TO_PICKUP", false, pickupEvent));
    Thread.sleep(5L);
    setField(service, "tripStartAt", System.currentTimeMillis());
    String rideStartEvent = KfeNativeWorkActionsPlugin.recordPendingAction(service, "START_RIDE", tripId, "");
    assertTrue("Passenger ride start must commit without PWA replay.",
        (Boolean) invoke(service, "persistCanonicalTripStage",
            new Class<?>[]{String.class, boolean.class, String.class}, "RIDE_STARTED", true, rideStartEvent));
    Thread.sleep(5L);
    String endRideEvent = KfeNativeWorkActionsPlugin.recordPendingAction(service, "END_RIDE", tripId, "");
    assertTrue("Trip completion must commit without PWA replay.",
        (Boolean) invoke(service, "persistCanonicalTripStage",
            new Class<?>[]{String.class, boolean.class, String.class}, "COMPLETED", false, endRideEvent));
  }

  private static void prepareSnapshot(SharedPreferences prefs, String shiftId, String tripId) throws Exception {
    JSONObject shift = new JSONObject().put("id", shiftId);
    JSONObject trip = new JSONObject().put("id", tripId).put("shiftId", shiftId);
    JSONObject root = new JSONObject().put("shift", shift).put("trip", trip);
    prefs.edit().putString(STATE_KEY, root.toString()).commit();
  }

  private static Object invoke(Object target, String name, Class<?>[] parameterTypes, Object... args) throws Exception {
    Method method = KfeOverlayService.class.getDeclaredMethod(name, parameterTypes);
    method.setAccessible(true);
    return method.invoke(target, args);
  }

  private static void setField(Object target, String name, Object value) throws Exception {
    Field field = KfeOverlayService.class.getDeclaredField(name);
    field.setAccessible(true);
    field.set(target, value);
  }

  private static int countShiftTrips(JSONArray records, String shiftId) {
    int count = 0;
    for (int i = 0; i < records.length(); i++) {
      JSONObject record = records.optJSONObject(i);
      if (record != null && shiftId.equals(record.optString("shiftId", ""))) count++;
    }
    return count;
  }

  private static boolean hasPendingEvent(JSONArray pending, String tripId, String stage) {
    for (int i = 0; i < pending.length(); i++) {
      JSONObject event = pending.optJSONObject(i);
      if (event != null && tripId.equals(event.optString("tripId", ""))
          && stage.equals(event.optString("stage", ""))) return true;
    }
    return false;
  }

  private static void assertPendingEvent(JSONArray pending, String tripId, String stage) {
    for (int i = 0; i < pending.length(); i++) {
      JSONObject event = pending.optJSONObject(i);
      if (event != null && tripId.equals(event.optString("tripId", ""))
          && stage.equals(event.optString("stage", ""))) return;
    }
    throw new AssertionError("Expected durable pending " + stage + " event for trip " + tripId);
  }

  private static final class AttachedOverlayService extends KfeOverlayService {
    void attach(Context context) { attachBaseContext(context); }
  }
  @Test public void interruptedFareSaveResumesCompletedTripAfterStoreReopenWithoutDuplicateRevenue() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    String suffix = Long.toString(System.currentTimeMillis());
    String shiftId = "interrupted-fare-shift-" + suffix;
    String tripId = "interrupted-fare-trip-" + suffix;
    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    String now = java.time.Instant.now().toString();
    JSONObject shift = new JSONObject().put("id", shiftId).put("status", "ACTIVE")
        .put("revenue", 0d).put("updatedAt", now);
    JSONObject completedTrip = new JSONObject().put("id", tripId).put("shiftId", shiftId)
        .put("status", "COMPLETED").put("tripStage", "COMPLETED")
        .put("fareDetailsSkipped", false).put("updatedAt", now);
    assertTrue("Active shift must be durable before the fare workflow.", 
        store.putRecord("interrupted-fare-shift-create-" + suffix, "SHIFT", shift).accepted);
    assertTrue("Trip completion must survive independently of the fare save.",
        store.putRecord("interrupted-fare-trip-complete-" + suffix, "TRIP", completedTrip).accepted);

    JSONObject payload = new JSONObject().put("fare", "275").put("toll", "0").put("parking", "0")
        .put("tollTreatment", "INCLUDED").put("parkingTreatment", "INCLUDED");
    String eventId = KfeNativeWorkActionsPlugin.recordPendingAction(
        context, "ENTER_FARE", tripId, payload.toString());
    assertTrue("Fare intent must be durably queued before canonical fare commit.",
        KfeNativeEventStore.get(context).contains(eventId));
    assertPendingEvent(KfeNativeEventStore.get(context).pending(500), tripId, "ENTER_FARE");

    JSONObject beforeInterruption = store.getRecord("TRIP", tripId).getJSONObject("record");
    assertEquals("Trip remains completed while fare entry is pending.", "COMPLETED",
        beforeInterruption.getString("status"));
    assertTrue("Uncommitted fare must not be written onto the completed trip.",
        !beforeInterruption.has("revenue") || beforeInterruption.isNull("revenue"));
    assertEquals("Uncommitted fare must not increase shift revenue.", 0d,
        store.getRecord("SHIFT", shiftId).getJSONObject("record").getDouble("revenue"), 0.001d);

    // Model process teardown after durable ENTER_FARE outbox append but before
    // canonical fare commit. Reopen both SQLite stores and recover by the same
    // event ID, exactly as the restarted overlay/PWA bridge must do.
    store.close();
    Field canonicalSingleton = KfeCanonicalWorkStore.class.getDeclaredField("instance");
    canonicalSingleton.setAccessible(true);
    canonicalSingleton.set(null, null);
    KfeNativeEventStore eventStore = KfeNativeEventStore.get(context);
    eventStore.close();
    Field eventSingleton = KfeNativeEventStore.class.getDeclaredField("instance");
    eventSingleton.setAccessible(true);
    eventSingleton.set(null, null);

    store = KfeCanonicalWorkStore.get(context);
    eventStore = KfeNativeEventStore.get(context);
    assertEquals("The original completed trip ID must survive the interruption.", tripId,
        store.getRecord("TRIP", tripId).getJSONObject("record").getString("id"));
    assertPendingEvent(eventStore.pending(500), tripId, "ENTER_FARE");
    assertEquals("Outbox event identity must survive the interruption.", eventId,
        pendingEventIdFor(eventStore.pending(500), tripId, "ENTER_FARE"));

    AttachedOverlayService recovered = new AttachedOverlayService();
    recovered.attach(context);
    prepareSnapshot(context.getSharedPreferences("kfe_overlay", Context.MODE_PRIVATE), shiftId, tripId);
    invoke(recovered, "persistCanonicalTripForm",
        new Class<?>[]{String.class, String.class, JSONObject.class, String.class},
        "FARE", tripId, payload, eventId);
    invoke(recovered, "persistCanonicalTripForm",
        new Class<?>[]{String.class, String.class, JSONObject.class, String.class},
        "FARE", tripId, payload, eventId);

    JSONObject savedTrip = store.getRecord("TRIP", tripId).getJSONObject("record");
    JSONObject savedShift = store.getRecord("SHIFT", shiftId).getJSONObject("record");
    assertEquals("Fare recovery must not change the completed lifecycle state.", "COMPLETED",
        savedTrip.getString("status"));
    assertEquals("Recovered fare must attach to the original trip.", tripId, savedTrip.getString("id"));
    assertEquals(275d, savedTrip.getDouble("revenue"), 0.001d);
    assertEquals("Recovered fare must be projected exactly once.", 275d, savedShift.getDouble("revenue"), 0.001d);
    assertEquals("Retry must not create another trip.", 1,
        countShiftTrips(store.listRecords("TRIP", 1000).getJSONArray("records"), shiftId));
    assertTrue("The same event must resolve to a durable canonical operation.",
        store.getOperation("native-form-FARE-" + eventId).optBoolean("found", false));
    assertPendingEvent(eventStore.pending(500), tripId, "ENTER_FARE");

    cleanupNativeRecords(context, shiftId, tripId, "", "");
    Method dbGetter = SQLiteOpenHelper.class.getDeclaredMethod("getWritableDatabase");
    dbGetter.setAccessible(true);
    SQLiteDatabase eventDb = (SQLiteDatabase) dbGetter.invoke(eventStore);
    eventDb.delete("native_events", "trip_id=?", new String[]{tripId});
    eventStore.close();
    eventSingleton.set(null, null);
  }


  @Test public void prepareFareSaveProcessDeathAtOutboxBoundary() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    SharedPreferences prefs = context.getSharedPreferences("kfe_overlay", Context.MODE_PRIVATE);
    String suffix = Long.toString(System.currentTimeMillis());
    String shiftId = "fare-process-death-shift-" + suffix;
    String tripId = "fare-process-death-trip-" + suffix;
    prefs.edit()
        .putString("fareProcessDeathShiftId", shiftId)
        .putString("fareProcessDeathTripId", tripId)
        .putString("fareProcessDeathEventId", "")
        .putString("fareProcessDeathReady", "")
        .commit();

    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    String now = java.time.Instant.now().toString();
    assertTrue("Active shift fixture must commit before interrupted fare submission.",
        store.putRecord("fare-process-death-shift-create-" + suffix, "SHIFT",
            new JSONObject().put("id", shiftId).put("status", "ACTIVE")
                .put("revenue", 0d).put("updatedAt", now)).accepted);
    assertTrue("Completed trip must be durable before fare submission.",
        store.putRecord("fare-process-death-trip-complete-" + suffix, "TRIP",
            new JSONObject().put("id", tripId).put("shiftId", shiftId)
                .put("status", "COMPLETED").put("tripStage", "COMPLETED")
                .put("fareDetailsSkipped", false).put("updatedAt", now)).accepted);

    prepareSnapshot(prefs, shiftId, tripId);
    AttachedOverlayService service = new AttachedOverlayService();
    service.attach(context);
    setField(service, "pendingTripId", tripId);
    setField(service, "pendingFareTripId", tripId);
    setField(service, "formMode", "FARE");
    setField(service, "formValue", "250");
    setField(service, "tollValue", "0");
    setField(service, "parkingValue", "0");

    KfeOverlayService.lifecycleFaultInjectorForTests = boundary -> {
      if (!"AFTER_FARE_OUTBOX".equals(boundary)) return;
      String eventId = pendingEventIdFor(KfeNativeEventStore.get(context).pending(500), tripId, "ENTER_FARE");
      prefs.edit()
          .putString("fareProcessDeathEventId", eventId)
          .putString("fareProcessDeathReady", "AFTER_FARE_OUTBOX")
          .commit();
      android.util.Log.i("KFE_FARE_DEATH", "READY_FOR_PROCESS_KILL tripId=" + tripId + " eventId=" + eventId);
      // The smoke-gate harness must SIGKILL the target app while the fare intent
      // is durable but before commitTripForm can change the canonical trip/revenue.
      for (int i = 0; i < 90; i++) SystemClock.sleep(1000L);
      throw new IllegalStateException("CI harness did not kill the app at AFTER_FARE_OUTBOX");
    };
    invoke(service, "submitNumericForm", new Class<?>[]{});
    throw new AssertionError("Fare process-death preparation returned without reaching its kill boundary.");
  }

  @Test public void verifyFareSaveProcessDeathRecovery() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    SharedPreferences prefs = context.getSharedPreferences("kfe_overlay", Context.MODE_PRIVATE);
    String shiftId = prefs.getString("fareProcessDeathShiftId", "");
    String tripId = prefs.getString("fareProcessDeathTripId", "");
    String eventId = prefs.getString("fareProcessDeathEventId", "");
    assertEquals("Harness must kill the app after durable fare outbox insertion.", "AFTER_FARE_OUTBOX",
        prefs.getString("fareProcessDeathReady", ""));
    assertTrue("Shift and trip identities must survive process death.", !shiftId.isEmpty() && !tripId.isEmpty());
    assertTrue("The original fare event identity must survive process death.", !eventId.isEmpty());

    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    KfeNativeEventStore events = KfeNativeEventStore.get(context);
    JSONArray pendingBeforeRetry = events.pending(500);
    assertEquals("Fare outbox event must remain pending after process death.", eventId,
        pendingEventIdFor(pendingBeforeRetry, tripId, "ENTER_FARE"));
    JSONObject tripBeforeRetry = store.getRecord("TRIP", tripId).getJSONObject("record");
    assertEquals("Trip completion must survive without being rolled back by a lost fare save.",
        "COMPLETED", tripBeforeRetry.getString("status"));
    assertTrue("Fare must remain pending until its canonical commit is confirmed.",
        !tripBeforeRetry.has("revenue") || tripBeforeRetry.isNull("revenue"));
    assertEquals("Pending fare must not affect revenue before recovery.", 0d,
        store.getRecord("SHIFT", shiftId).getJSONObject("record").getDouble("revenue"), 0.001d);

    JSONObject payload = new JSONObject().put("fare", "250").put("toll", "0").put("parking", "0")
        .put("tollTreatment", "INCLUDED").put("parkingTreatment", "INCLUDED");
    AttachedOverlayService recovered = new AttachedOverlayService();
    recovered.attach(context);
    prepareSnapshot(prefs, shiftId, tripId);
    invoke(recovered, "persistCanonicalTripForm",
        new Class<?>[]{String.class, String.class, JSONObject.class, String.class},
        "FARE", tripId, payload, eventId);
    invoke(recovered, "persistCanonicalTripForm",
        new Class<?>[]{String.class, String.class, JSONObject.class, String.class},
        "FARE", tripId, payload, eventId);

    JSONObject savedTrip = store.getRecord("TRIP", tripId).getJSONObject("record");
    JSONObject savedShift = store.getRecord("SHIFT", shiftId).getJSONObject("record");
    assertEquals("Recovered fare must keep the same completed trip.", tripId, savedTrip.getString("id"));
    assertEquals("Recovered fare must not revert completed lifecycle state.", "COMPLETED",
        savedTrip.getString("status"));
    assertEquals(250d, savedTrip.getDouble("revenue"), 0.001d);
    assertEquals("Fare must project exactly once after duplicate recovery attempts.", 250d,
        savedShift.getDouble("revenue"), 0.001d);
    assertEquals("Recovery must not create a second trip.", 1,
        countShiftTrips(store.listRecords("TRIP", 1000).getJSONArray("records"), shiftId));
    assertTrue("The durable canonical fare operation must survive retry.",
        store.getOperation("native-form-FARE-" + eventId).optBoolean("found", false));
    assertEquals("Recovery must reuse the original pending event.", eventId,
        pendingEventIdFor(events.pending(500), tripId, "ENTER_FARE"));

    android.util.Log.i("KFE_FARE_DEATH", "FARE_PROCESS_DEATH_CASE_PASS tripId=" + tripId + " eventId=" + eventId);
    cleanupNativeRecords(context, shiftId, tripId, "", "");
    SQLiteOpenHelper eventStore = KfeNativeEventStore.get(context);
    Method dbGetter = SQLiteOpenHelper.class.getDeclaredMethod("getWritableDatabase");
    dbGetter.setAccessible(true);
    SQLiteDatabase eventDb = (SQLiteDatabase) dbGetter.invoke(eventStore);
    eventDb.delete("native_events", "trip_id=?", new String[]{tripId});
    eventStore.close();
    Field eventSingleton = KfeNativeEventStore.class.getDeclaredField("instance");
    eventSingleton.setAccessible(true);
    eventSingleton.set(null, null);
    prefs.edit().remove(STATE_KEY)
        .remove("fareProcessDeathShiftId").remove("fareProcessDeathTripId")
        .remove("fareProcessDeathEventId").remove("fareProcessDeathReady").commit();
  }


  @Test public void persistedOverlayCannotResumeAfterPwaOwnedShiftEnd() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    context.stopService(new android.content.Intent(context, KfeOverlayService.class));
    SystemClock.sleep(250L);
    KfeOverlayService.instance = null;

    String suffix = Long.toString(System.currentTimeMillis());
    String shiftId = "stale-overlay-resume-shift-" + suffix;
    String now = java.time.Instant.now().toString();
    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    JSONObject activeShift = new JSONObject().put("id", shiftId).put("status", "ACTIVE")
        .put("revenue", 0d).put("updatedAt", now);
    assertTrue("Active shift must be canonical before seeding a resumable overlay snapshot.",
        store.putRecord("stale-overlay-resume-create-" + suffix, "SHIFT", activeShift).accepted);

    SharedPreferences prefs = context.getSharedPreferences("kfe_overlay", Context.MODE_PRIVATE);
    JSONObject staleState = new JSONObject()
        .put("shift", new JSONObject().put("id", shiftId))
        .put("trip", JSONObject.NULL)
        .put("overlayAction", "GO_TO_PICKUP")
        .put("overlayTripId", "stale-trip-" + suffix);
    prefs.edit().putString("lastOverlayState", staleState.toString())
        .putString("actionStage", "GO_TO_PICKUP")
        .putString("pendingTripId", "stale-trip-" + suffix)
        .commit();

    JSONObject completedShift = new JSONObject(activeShift.toString())
        .put("status", "COMPLETED")
        .put("shiftEndAt", java.time.Instant.now().plusSeconds(1).toString())
        .put("updatedAt", java.time.Instant.now().plusSeconds(2).toString());
    assertTrue("PWA-owned shift end must be canonical before resume is attempted.",
        store.putRecord("stale-overlay-resume-end-" + suffix, "SHIFT", completedShift, now, false).accepted);

    // MainActivity calls this after recreation. A stale presentation snapshot
    // must not start the native overlay when SQLite says the shift has ended.
    KfeOverlayService.resumePersisted(context);
    assertFalse("Ended canonical shift must invalidate its resumable presentation snapshot.",
        KfeOverlayService.hasPersistedOverlayState(context));
    assertEquals("No native overlay service should be restarted for an ended shift.",
        null, KfeOverlayService.instance);

    // Android can also restart a sticky service with a null Intent. Exercise the
    // same guarded restore helper directly to prove that path fails closed too.
    prefs.edit().putString("lastOverlayState", staleState.toString()).commit();
    AttachedOverlayService restarted = new AttachedOverlayService();
    restarted.attach(context);
    assertEquals(Boolean.FALSE, invoke(restarted, "restorePersistedOverlayIfCanonicalShiftActive", new Class<?>[]{}));
    assertFalse("Sticky-service restore must also clear the stale presentation snapshot.",
        KfeOverlayService.hasPersistedOverlayState(context));
    context.stopService(new android.content.Intent(context, KfeOverlayService.class));
    KfeOverlayService.instance = null;
  }

}
