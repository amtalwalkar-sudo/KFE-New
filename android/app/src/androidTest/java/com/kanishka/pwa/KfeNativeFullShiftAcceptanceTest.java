package com.kanishka.pwa;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.lang.reflect.Field;
import java.lang.reflect.Method;

/**
 * Exercises the production native persistence methods without starting a WebView
 * or invoking WorkModuleView event replay. This proves the SQLite records needed
 * for a multi-trip shift can be committed by the native overlay alone.
 */
@RunWith(AndroidJUnit4.class)
public class KfeNativeFullShiftAcceptanceTest {
  private static final String STATE_KEY = "lastOverlayState";

  @Test public void nativeOnlyShiftPersistsMultipleFaresAndCancellationAcrossStoreReopen() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    String suffix = Long.toString(System.currentTimeMillis());
    String shiftId = "native-full-shift-" + suffix;
    String fareTripA = "native-full-fare-a-" + suffix;
    String fareTripB = "native-full-fare-b-" + suffix;
    String cancelledTrip = "native-full-cancel-" + suffix;

    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    JSONObject shift = new JSONObject()
        .put("id", shiftId)
        .put("status", "ACTIVE")
        .put("revenue", 0)
        .put("updatedAt", "2026-01-01T00:00:00.000Z");
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
    KfeNativeEventStore.get(context).append("ENTER_FARE", fareTripA, fareA.toString());
    Thread.sleep(5L);
    invoke(service, "persistCanonicalTripForm",
        new Class<?>[]{String.class, String.class, JSONObject.class}, "FARE", fareTripA, fareA);

    prepareSnapshot(prefs, shiftId, fareTripB);
    runTripStages(service, prefs, shiftId, fareTripB);
    JSONObject fareB = new JSONObject()
        .put("fare", "150").put("toll", "0").put("parking", "5")
        .put("tollTreatment", "INCLUDED").put("parkingTreatment", "INCLUDED");
    KfeNativeEventStore.get(context).append("ENTER_FARE", fareTripB, fareB.toString());
    Thread.sleep(5L);
    invoke(service, "persistCanonicalTripForm",
        new Class<?>[]{String.class, String.class, JSONObject.class}, "FARE", fareTripB, fareB);

    prepareSnapshot(prefs, shiftId, cancelledTrip);
    Thread.sleep(5L);
    assertTrue("The cancelled trip pickup state must persist.",
        (Boolean) invoke(service, "persistCanonicalTripStage",
            new Class<?>[]{String.class, boolean.class}, "GOING_TO_PICKUP", false));
    JSONObject cancellation = new JSONObject().put("revenue", "20").put("reason", "PASSENGER");
    KfeNativeEventStore.get(context).append("CANCEL_RIDE", cancelledTrip, cancellation.toString());
    Thread.sleep(5L);
    invoke(service, "persistCanonicalTripForm",
        new Class<?>[]{String.class, String.class, JSONObject.class}, "CANCEL", cancelledTrip, cancellation);

    // Simulate an interrupted acknowledgement: the form's native commit exists,
    // while its durable transport event remains pending for later PWA catch-up.
    JSONArray pending = KfeNativeEventStore.get(context).pending(100);
    assertPendingEvent(pending, fareTripA, "ENTER_FARE");
    assertPendingEvent(pending, fareTripB, "ENTER_FARE");
    assertPendingEvent(pending, cancelledTrip, "CANCEL_RIDE");

    // Retrying a deterministic native form operation must not duplicate or lose
    // a fare. The native canonical operation ID is stable per form/trip.
    Thread.sleep(5L);
    invoke(service, "persistCanonicalTripForm",
        new Class<?>[]{String.class, String.class, JSONObject.class}, "FARE", fareTripA, fareA);

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
    JSONObject savedShift = store.getRecord("SHIFT", shiftId);
    assertTrue("First fare record must be committed natively.", savedA.optBoolean("found"));
    assertTrue("Second fare record must be committed natively.", savedB.optBoolean("found"));
    assertTrue("Cancellation record must be committed natively.", savedCancelled.optBoolean("found"));
    assertTrue("Shift financial projection must be committed natively.", savedShift.optBoolean("found"));
    assertEquals(250d, savedA.getJSONObject("record").getDouble("revenue"), 0.001d);
    assertEquals(150d, savedB.getJSONObject("record").getDouble("revenue"), 0.001d);
    assertEquals("COMPLETED", savedA.getJSONObject("record").getString("status"));
    assertEquals("COMPLETED", savedB.getJSONObject("record").getString("status"));
    assertEquals("CANCELLED", savedCancelled.getJSONObject("record").getString("status"));
    assertEquals("PASSENGER", savedCancelled.getJSONObject("record").getString("cancelReason"));
    assertEquals(20d, savedCancelled.getJSONObject("record").getDouble("cancelledRevenue"), 0.001d);
    assertEquals("Revenue must include both fares and the recorded cancellation fee.",
        420d, savedShift.getJSONObject("record").getDouble("revenue"), 0.001d);

    JSONArray allTrips = store.listRecords("TRIP", 1000).getJSONArray("records");
    assertEquals("Retry must not create a duplicate canonical trip.", 3, countShiftTrips(allTrips, shiftId));
    assertPendingEvent(KfeNativeEventStore.get(context).pending(100), fareTripA, "ENTER_FARE");
    assertPendingEvent(KfeNativeEventStore.get(context).pending(100), fareTripB, "ENTER_FARE");
    assertPendingEvent(KfeNativeEventStore.get(context).pending(100), cancelledTrip, "CANCEL_RIDE");
  }

  private static void runTripStages(AttachedOverlayService service, SharedPreferences prefs,
      String shiftId, String tripId) throws Exception {
    Thread.sleep(5L);
    assertTrue("Pickup stage must commit without PWA replay.",
        (Boolean) invoke(service, "persistCanonicalTripStage",
            new Class<?>[]{String.class, boolean.class}, "GOING_TO_PICKUP", false));
    Thread.sleep(5L);
    setField(service, "tripStartAt", System.currentTimeMillis());
    assertTrue("Passenger ride start must commit without PWA replay.",
        (Boolean) invoke(service, "persistCanonicalTripStage",
            new Class<?>[]{String.class, boolean.class}, "RIDE_STARTED", true));
    Thread.sleep(5L);
    assertTrue("Trip completion must commit without PWA replay.",
        (Boolean) invoke(service, "persistCanonicalTripStage",
            new Class<?>[]{String.class, boolean.class}, "COMPLETED", false));
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
}
