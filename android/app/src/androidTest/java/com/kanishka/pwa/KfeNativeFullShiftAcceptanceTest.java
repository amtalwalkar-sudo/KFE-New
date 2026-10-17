package com.kanishka.pwa;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.SharedPreferences;
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
    setField(service, "pendingTripId", cancelledTrip);
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
    prefs.edit()
        .putString("nativeFullShiftCatchupShiftId", shiftId)
        .putString("nativeFullShiftCatchupFareTripA", fareTripA)
        .putString("nativeFullShiftCatchupFareTripB", fareTripB)
        .putString("nativeFullShiftCatchupCancelledTrip", cancelledTrip)
        .commit();
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
              + "return text.includes('KFE WORK')&&text.includes('START SHIFT')?'READY':'WAIT';"
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
          + "root.dataset.nativeCatchup=JSON.stringify({shiftFound:!!shiftReq.result,tripIds:found.map(x=>String(x.id)),statuses:found.map(x=>String(x.status||'')),fares:found.map(x=>x.revenue==null?null:Number(x.revenue)),cancellation:found.filter(x=>String(x.id)===" + JSONObject.quote(cancelledTrip) + ").map(x=>({reason:x.cancelReason,fee:x.cancelledRevenue}))});"
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
      JSONArray statuses = recovered.getJSONArray("statuses");
      assertEquals("COMPLETED", statusFor(recovered, tripA));
      assertEquals("COMPLETED", statusFor(recovered, tripB));
      assertEquals("CANCELLED", statusFor(recovered, cancelledTrip));
      JSONArray fares = recovered.getJSONArray("fares");
      assertEquals(3, fares.length());
      JSONArray cancellation = recovered.getJSONArray("cancellation");
      assertEquals(1, cancellation.length());
      assertEquals("PASSENGER", cancellation.getJSONObject(0).getString("reason"));
      assertEquals(20d, cancellation.getJSONObject(0).getDouble("fee"), 0.001d);
    } finally {
      scenario.close();
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
