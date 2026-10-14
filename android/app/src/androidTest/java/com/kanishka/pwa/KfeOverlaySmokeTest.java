package com.kanishka.pwa;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.provider.Settings;
import android.widget.EditText;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.lang.reflect.Field;

@RunWith(AndroidJUnit4.class)
public class KfeOverlaySmokeTest {
  private Context context;

  @Before public void setUp() {
    MainActivity.isResumed = false;
    context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    context.stopService(new Intent(context, KfeOverlayService.class));
    SystemClock.sleep(300L);
    KfeOverlayService.instance = null;
    context.getSharedPreferences("kfe_overlay", Context.MODE_PRIVATE).edit().clear().apply();
    context.startService(new Intent(context, KfeOverlayService.class));
  }

  @After public void tearDown() {
    context.stopService(new Intent(context, KfeOverlayService.class));
    MainActivity.isResumed = true;
  }

  @Test public void staleGpsStopCannotStopNewerTripCollector() {
    assertTrue(KfeNativeGpsService.shouldStopForTrip("trip-a", "trip-a"));
    assertTrue(!KfeNativeGpsService.shouldStopForTrip("trip-b", "trip-a"));
    assertTrue(!KfeNativeGpsService.shouldStopForTrip("trip-b", ""));
  }

  @Test public void fareSubmissionKeepsCompletedTripIdentityAcrossNextPickup() {
    assertEquals("completed-trip", KfeOverlayService.resolveFareActionTripId("completed-trip", "next-active-trip"));
    assertEquals("current-trip", KfeOverlayService.resolveFareActionTripId("", "current-trip"));
    assertEquals("", KfeOverlayService.resolveFareActionTripId("", null));
  }

  @Test public void overlayUsesOneStateAwareLiveKmLabel() {
    assertEquals("DEAD KM", KfeOverlayService.resolveMovementLabel("GO_TO_PICKUP"));
    assertEquals("DEAD KM", KfeOverlayService.resolveMovementLabel("START_RIDE"));
    assertEquals("BUSINESS KM", KfeOverlayService.resolveMovementLabel("END_RIDE"));
    assertEquals("LIVE KM", KfeOverlayService.resolveMovementLabel("ENTER_FARE"));
    assertEquals("GO TO PICKUP", KfeOverlayService.resolveActionLabel("GO_TO_PICKUP"));
    assertEquals("START RIDE", KfeOverlayService.resolveActionLabel("START_RIDE"));
    assertEquals("END RIDE", KfeOverlayService.resolveActionLabel("END_RIDE"));
    assertEquals("", KfeOverlayService.resolveActionLabel("ENTER_FARE"));
  }

  @Test public void swipeWhileAwaitingAcknowledgementCannotCreateDuplicateDurableEvent() throws Exception {
    clearPending();
    JSONObject state = new JSONObject()
      .put("shift", new JSONObject().put("id", "awaiting-shift"))
      .put("trip", JSONObject.NULL)
      .put("overlayAction", "GO_TO_PICKUP")
      .put("overlayTripId", "awaiting-trip");
    KfeOverlayService.update(context, state.toString());
    waitForOverlay();
    KfeOverlayService service = waitForService();
    String eventId = KfeNativeWorkActionsPlugin.recordPendingAction(context, "GO_TO_PICKUP", "awaiting-trip", "");
    setField(service, "actionStage", "GO_TO_PICKUP");
    setField(service, "pendingTripId", "awaiting-trip");
    setField(service, "awaitingEventId", eventId);
    setField(service, "awaitingStage", "GO_TO_PICKUP");
    setField(service, "awaitingTripId", "awaiting-trip");
    float progress = swipeOverlay(service, 0.92f);
    assertTrue("An in-flight action must not visually move the swipe handle", progress < 0.01f);
    assertSwipeRetracted(service);
    assertEquals("Repeated swipes while awaiting acknowledgement must not append another durable event", 1, pendingEventCount(eventId));
  }

  @Test public void swipeHandleTracksFingerAndRetractsAfterIncompleteGesture() throws Exception {
    clearPending();
    JSONObject state = new JSONObject()
      .put("shift", new JSONObject().put("id", "progress-shift"))
      .put("trip", JSONObject.NULL)
      .put("overlayAction", "GO_TO_PICKUP")
      .put("overlayTripId", "progress-trip");
    KfeOverlayService.update(context, state.toString());
    waitForOverlay();
    KfeOverlayService service = waitForService();
    setField(service, "actionStage", "GO_TO_PICKUP");
    setField(service, "pendingTripId", "progress-trip");
    int pendingBefore = KfeNativeEventStore.get(context).pending(100).length();
    float intermediate = swipeOverlay(service, 0.45f);
    assertTrue("Swipe handle must follow the finger before the commit threshold", intermediate > 0.05f);
    assertTrue("Partial gesture must not jump to the completed position", intermediate < 0.70f);
    assertSwipeRetracted(service);
    assertEquals("An incomplete gesture must not emit an action", pendingBefore, KfeNativeEventStore.get(context).pending(100).length());
  }

  @Test public void failedNativeActionCanRecoverByAcknowledgingSameDurableEvent() throws Exception {
    clearPending();
    JSONObject state = new JSONObject()
      .put("shift", new JSONObject().put("id", "recover-shift"))
      .put("trip", JSONObject.NULL)
      .put("overlayAction", "GO_TO_PICKUP")
      .put("overlayTripId", "recover-trip");
    KfeOverlayService.update(context, state.toString());
    waitForOverlay();
    KfeOverlayService service = waitForService();
    int pendingBefore = KfeNativeEventStore.get(context).pending(100).length();
    String eventId = KfeNativeWorkActionsPlugin.recordPendingAction(context, "GO_TO_PICKUP", "recover-trip", "");
    setField(service, "actionStage", "GO_TO_PICKUP");
    setField(service, "pendingTripId", "recover-trip");
    setField(service, "awaitingEventId", eventId);
    setField(service, "awaitingStage", "GO_TO_PICKUP");
    setField(service, "awaitingTripId", "recover-trip");

    KfeNativeEventStore.get(context).recordFailure(eventId, "simulated interrupted Work save");
    assertEquals("Failed save must remain durable for retry under its original ID", 1, pendingEventCount(eventId));
    assertEquals("Failure must not append a replacement event", pendingBefore + 1, KfeNativeEventStore.get(context).pending(100).length());

    assertTrue("Recovered event must acknowledge exactly once", KfeNativeEventStore.get(context).acknowledge(eventId));
    InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
      KfeOverlayService.acknowledgeFromPwa(context, eventId, "GO_TO_PICKUP", "recover-trip"));
    assertEquals("Successful recovery must release the in-flight lock", "", fieldValue(service, "awaitingEventId"));
    assertEquals("Pickup acknowledgement must advance to the existing next workflow action", "START_RIDE", fieldValue(service, "actionStage"));
    assertSwipeRetracted(service);
    assertEquals("Acknowledged event must no longer be pending", 0, pendingEventCount(eventId));
    assertEquals("Recovery must return the pending queue to its previous size", pendingBefore, KfeNativeEventStore.get(context).pending(100).length());
  }

  @Test public void goldenRideSwipeLoopPersistsPickupStartEndAndFareIdentity() throws Exception {
    clearPending();
    KfeOverlayService service = waitForService();
    Field actionStage = KfeOverlayService.class.getDeclaredField("actionStage");
    Field pendingTripId = KfeOverlayService.class.getDeclaredField("pendingTripId");
    Field pendingFareTripId = KfeOverlayService.class.getDeclaredField("pendingFareTripId");
    actionStage.setAccessible(true);
    pendingTripId.setAccessible(true);
    pendingFareTripId.setAccessible(true);

    JSONObject state = new JSONObject()
      .put("shift", new JSONObject().put("id", "golden-shift"))
      .put("trip", new JSONObject().put("id", "trip-a"))
      .put("target", "₹500")
      .put("targetProgress", 0)
      .put("rides", "0")
      .put("liveKm", "0.0 km")
      .put("revenue", "₹0")
      .put("overlayTripId", "trip-a");

    state.put("overlayAction", "GO_TO_PICKUP");
    KfeOverlayService.update(context, state.toString());
    waitForOverlay();
    service = waitForService();
    actionStage.set(service, "GO_TO_PICKUP");
    pendingTripId.set(service, "trip-a");
    assertSwipeTracksAndRetracts(service);
    assertEquals("GO_TO_PICKUP|trip-a|", pendingValue());
    acknowledgePending("GO_TO_PICKUP", "trip-a");
    state.put("overlayAction", "START_RIDE");
    KfeOverlayService.update(context, state.toString());
    waitForOverlay();
    service = waitForService();
    actionStage.set(service, "START_RIDE");
    pendingTripId.set(service, "trip-a");
    assertSwipeTracksAndRetracts(service);
    assertEquals("START_RIDE|trip-a|", pendingValue());
    acknowledgePending("START_RIDE", "trip-a");
    state.put("overlayAction", "END_RIDE");
    KfeOverlayService.update(context, state.toString());
    waitForOverlay();
    service = waitForService();
    actionStage.set(service, "END_RIDE");
    pendingTripId.set(service, "trip-a");
    assertSwipeTracksAndRetracts(service);
    assertEquals("END_RIDE|trip-a|", pendingValue());
    acknowledgePending("END_RIDE", "trip-a");

    pendingFareTripId.set(service, "trip-a");
    pendingTripId.set(service, "trip-b");
    assertEquals("trip-a", KfeOverlayService.resolveFareActionTripId("trip-a", "trip-b"));
    KfeNativeWorkActionsPlugin.recordPendingAction(context, "ENTER_FARE", "trip-a", "450");
    assertEquals("ENTER_FARE|trip-a|450", pendingValue());
    acknowledgePending("ENTER_FARE", "trip-a");
  }

  @Test public void pendingActionSurvivesOverlayServiceRecreationUntilExplicitClear() throws Exception {
    clearPending();
    KfeNativeWorkActionsPlugin.recordPendingAction(context, "END_RIDE", "trip-replay", "");
    assertEquals("END_RIDE|trip-replay|", pendingValue());
    context.stopService(new Intent(context, KfeOverlayService.class));
    SystemClock.sleep(300);
    context.startService(new Intent(context, KfeOverlayService.class));
    waitForService();
    assertEquals("END_RIDE|trip-replay|", pendingValue());
    clearPending();
    assertEquals("", pendingValue());
  }

  @Test public void rebootRecoveryRejectsMissingOrClearedShiftSnapshot() throws Exception {
    assertTrue(!KfeOverlayService.isResumableState(""));
    assertTrue(!KfeOverlayService.isResumableState("{\"shift\":{}}"));
    assertTrue(KfeOverlayService.isResumableState(
      new JSONObject().put("shift", new JSONObject().put("id", "active-shift")).toString()));

    context.getSharedPreferences("kfe_overlay", Context.MODE_PRIVATE).edit()
      .putString("lastOverlayState", new JSONObject()
        .put("shift", new JSONObject().put("id", "ended-shift")).toString()).commit();
    assertTrue(KfeOverlayService.hasPersistedOverlayState(context));
    KfeOverlayService.clearPersistedOverlayState(context);
    assertTrue(!KfeOverlayService.hasPersistedOverlayState(context));
  }

  private KfeOverlayService waitForService() {
    long deadline = SystemClock.uptimeMillis() + 5000L;
    while (SystemClock.uptimeMillis() < deadline) {
      if (KfeOverlayService.instance != null) return KfeOverlayService.instance;
      SystemClock.sleep(100L);
    }
    throw new AssertionError("KFE overlay service did not start");
  }

  private void waitForOverlay() throws Exception {
    Field field = KfeOverlayService.class.getDeclaredField("overlay");
    field.setAccessible(true);
    long deadline = SystemClock.uptimeMillis() + 5000L;
    while (SystemClock.uptimeMillis() < deadline) {
      KfeOverlayService service = KfeOverlayService.instance;
      if (service != null) {
        Object overlay = field.get(service);
        if (overlay != null && ((android.view.View) overlay).getWidth() > 100) return;
      }
      SystemClock.sleep(100L);
    }
    throw new AssertionError("KFE overlay view did not become interactive");
  }

  // Capture the handle's intermediate position before release/retraction.
  private float swipeOverlay(KfeOverlayService service, float endFraction) throws Exception {
    service = waitForService();
    Field field = KfeOverlayService.class.getDeclaredField("overlay");
    field.setAccessible(true);
    android.view.View view = (android.view.View) field.get(service);
    int width = view.getWidth();
    final float density = view.getResources().getDisplayMetrics().density;
    final float y = Math.max(105f * density, Math.min(view.getHeight() - 5f, 115f * density));
    final int overlayWidth = width;
    Field progressField = view.getClass().getDeclaredField("progress");
    progressField.setAccessible(true);
    final float[] intermediateProgress = {0f};
    InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
      long now = SystemClock.uptimeMillis();
      try {
        view.dispatchTouchEvent(android.view.MotionEvent.obtain(now, now, android.view.MotionEvent.ACTION_DOWN, 20f, y, 0));
        view.dispatchTouchEvent(android.view.MotionEvent.obtain(now, now + 80, android.view.MotionEvent.ACTION_MOVE, overlayWidth * 0.35f, y, 0));
        intermediateProgress[0] = progressField.getFloat(view);
        view.dispatchTouchEvent(android.view.MotionEvent.obtain(now, now + 160, android.view.MotionEvent.ACTION_MOVE, overlayWidth * endFraction, y, 0));
        view.dispatchTouchEvent(android.view.MotionEvent.obtain(now, now + 220, android.view.MotionEvent.ACTION_UP, overlayWidth * endFraction, y, 0));
      } catch (Exception e) {
        throw new AssertionError("Could not measure intermediate native swipe progress", e);
      }
    });
    SystemClock.sleep(300);
    return intermediateProgress[0];
  }

  private void assertSwipeTracksAndRetracts(KfeOverlayService service) throws Exception {
    float intermediate = swipeOverlay(service, 0.92f);
    assertTrue("Swipe handle must visibly move during ACTION_MOVE", intermediate > 0.05f);
    assertSwipeRetracted(service);
  }

  private void assertSwipeRetracted(KfeOverlayService service) throws Exception {
    Field overlayField = KfeOverlayService.class.getDeclaredField("overlay");
    overlayField.setAccessible(true);
    Object overlay = overlayField.get(service);
    Field progressField = overlay.getClass().getDeclaredField("progress");
    progressField.setAccessible(true);
    assertTrue("Completed overlay swipe must retract its handle", progressField.getFloat(overlay) < 0.05f);
  }

  private int pendingEventCount(String eventId) throws Exception {
    org.json.JSONArray events = KfeNativeEventStore.get(context).pending(100);
    int count = 0;
    for (int i = 0; i < events.length(); i++) {
      if (eventId.equals(events.getJSONObject(i).getString("eventId"))) count++;
    }
    return count;
  }

  private String pendingValue() {
    return context.getSharedPreferences("kfe_native_work_actions", Context.MODE_PRIVATE)
      .getString("pending", "");
  }

  private void acknowledgePending(String stage, String tripId) {
    String eventId = context.getSharedPreferences("kfe_native_work_actions", Context.MODE_PRIVATE)
      .getString("pendingEventId", "");
    assertTrue("Durable native event id must exist", !eventId.isEmpty());
    assertTrue("Durable native event must acknowledge", KfeNativeEventStore.get(context).acknowledge(eventId));
    InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
      KfeOverlayService.acknowledgeFromPwa(context, eventId, stage, tripId));
    SystemClock.sleep(100L);
    clearPending();
  }
  private void clearPending() {
    context.getSharedPreferences("kfe_native_work_actions", Context.MODE_PRIVATE).edit().remove("pending").commit();
  }

  @Test public void endRideAcknowledgementOpensNativeFareFormWithoutActivityLaunch() throws Exception {
    clearPending();
    JSONObject state = new JSONObject()
      .put("shift", new JSONObject().put("id", "form-shift"))
      .put("trip", new JSONObject().put("id", "form-trip"))
      .put("overlayAction", "END_RIDE")
      .put("overlayTripId", "form-trip");
    KfeOverlayService.update(context, state.toString());
    waitForOverlay();
    KfeOverlayService service = waitForService();
    setField(service, "actionStage", "END_RIDE");
    setField(service, "pendingTripId", "form-trip");
    setField(service, "awaitingEventId", "end-event");
    setField(service, "awaitingStage", "END_RIDE");
    setField(service, "awaitingTripId", "form-trip");
    InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
      try {
        java.lang.reflect.Method ack = KfeOverlayService.class.getDeclaredMethod(
          "onEventAcknowledged", String.class, String.class, String.class);
        ack.setAccessible(true);
        ack.invoke(service, "end-event", "END_RIDE", "form-trip");
      } catch (Exception e) { throw new AssertionError(e); }
    });
    assertEquals("FARE", fieldValue(service, "formMode"));
    assertNotNull(fieldValue(service, "formPanel"));
    assertTrue("Overlay form flow must not retain an activity-launch fallback", hasNoActivityLaunchFallback());
  }

  @Test public void fareFormSendsOptionalTollParkingAndTreatmentFlags() throws Exception {
    clearPending();
    JSONObject state = new JSONObject()
      .put("shift", new JSONObject().put("id", "fare-shift"))
      .put("trip", JSONObject.NULL)
      .put("overlayAction", "ENTER_FARE")
      .put("overlayTripId", "fare-trip")
      .put("pendingFareId", "fare-trip");
    KfeOverlayService.update(context, state.toString());
    waitForOverlay();
    KfeOverlayService service = waitForService();
    setField(service, "pendingFareTripId", "fare-trip");
    setField(service, "pendingTripId", "fare-trip");
    InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
      try {
        java.lang.reflect.Method open = KfeOverlayService.class.getDeclaredMethod("openFareForm");
        open.setAccessible(true);
        open.invoke(service);
        ((EditText) fieldValue(service, "formInput")).setText("450");
        ((EditText) fieldValue(service, "tollInput")).setText("0");
        ((EditText) fieldValue(service, "parkingInput")).setText("25");
        ((android.widget.CheckBox) fieldValue(service, "tollTreatmentInput")).setChecked(true);
        java.lang.reflect.Method submit = KfeOverlayService.class.getDeclaredMethod("submitNumericForm");
        submit.setAccessible(true);
        submit.invoke(service);
      } catch (Exception e) { throw new AssertionError(e); }
    });
    assertTrue(pendingValue().startsWith("ENTER_FARE|fare-trip|"));
    JSONObject payload = new JSONObject(pendingValue().substring("ENTER_FARE|fare-trip|".length()));
    assertEquals("450", payload.getString("fare"));
    assertEquals("0", payload.getString("toll"));
    assertEquals("25", payload.getString("parking"));
    assertEquals("EXCLUDED", payload.getString("tollTreatment"));
    assertEquals("INCLUDED", payload.getString("parkingTreatment"));
  }

  @Test public void cancellationFormAllowsOptionalFeeAndPersistsPassengerReason() throws Exception {
    clearPending();
    JSONObject state = new JSONObject()
      .put("shift", new JSONObject().put("id", "cancel-shift"))
      .put("trip", new JSONObject().put("id", "cancel-trip"))
      .put("overlayAction", "START_RIDE")
      .put("overlayTripId", "cancel-trip");
    KfeOverlayService.update(context, state.toString());
    waitForOverlay();
    KfeOverlayService service = waitForService();
    setField(service, "pendingTripId", "cancel-trip");
    InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
      try {
        java.lang.reflect.Method open = KfeOverlayService.class.getDeclaredMethod("openCancelForm");
        open.setAccessible(true);
        open.invoke(service);
        setField(service, "cancelReason", "PASSENGER");
        java.lang.reflect.Method submit = KfeOverlayService.class.getDeclaredMethod("submitNumericForm");
        submit.setAccessible(true);
        submit.invoke(service);
      } catch (Exception e) { throw new AssertionError(e); }
    });
    assertTrue(pendingValue().startsWith("CANCEL_RIDE|cancel-trip|"));
    JSONObject payload = new JSONObject(pendingValue().substring("CANCEL_RIDE|cancel-trip|".length()));
    assertEquals("", payload.getString("revenue"));
    assertEquals("PASSENGER", payload.getString("reason"));
  }

  @Test public void fareDraftSurvivesNativeOverlayServiceRestart() throws Exception {
    clearPending();
    JSONObject state = new JSONObject()
      .put("shift", new JSONObject().put("id", "recovery-shift"))
      .put("trip", JSONObject.NULL)
      .put("overlayAction", "ENTER_FARE")
      .put("overlayTripId", "recovery-trip")
      .put("pendingFareId", "recovery-trip");
    KfeOverlayService.update(context, state.toString());
    waitForOverlay();
    KfeOverlayService service = waitForService();
    final KfeOverlayService initialService = service;
    InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
      try {
        java.lang.reflect.Method open = KfeOverlayService.class.getDeclaredMethod("openFareForm");
        open.setAccessible(true);
        open.invoke(initialService);
        EditText fare = (EditText) fieldValue(initialService, "formInput");
        fare.setText("425");
      } catch (Exception e) { throw new AssertionError(e); }
    });
    context.stopService(new Intent(context, KfeOverlayService.class));
    long stoppedDeadline = SystemClock.uptimeMillis() + 5000L;
    while (KfeOverlayService.instance != null && SystemClock.uptimeMillis() < stoppedDeadline) {
      SystemClock.sleep(50L);
    }
    assertEquals("Old native overlay service must be destroyed before restart", null, KfeOverlayService.instance);
    context.startService(new Intent(context, KfeOverlayService.class));
    service = waitForService();
    assertTrue("Restart must create a new service instance", service != initialService);
    waitForOverlay();
    assertEquals("FARE", fieldValue(service, "formMode"));
    assertEquals("425", ((EditText) fieldValue(service, "formInput")).getText().toString());
  }

  private void setField(Object target, String name, Object value) throws Exception {
    Field field = target.getClass().getDeclaredField(name);
    field.setAccessible(true);
    field.set(target, value);
  }

  private Object fieldValue(Object target, String name) throws Exception {
    Field field = target.getClass().getDeclaredField(name);
    field.setAccessible(true);
    return field.get(target);
  }

  private boolean hasNoActivityLaunchFallback() {
    for (java.lang.reflect.Method method : KfeOverlayService.class.getDeclaredMethods()) {
      if (method.getName().contains("launchWorkActivity")) return false;
    }
    return true;
  }

  @Test public void exactApkCanStartNativeOverlaySmoke() throws Exception {
    if (android.os.Build.VERSION.SDK_INT >= 23) assertTrue("SYSTEM_ALERT_WINDOW must be granted by CI", Settings.canDrawOverlays(context));
    JSONObject state = new JSONObject()
      .put("shift", new JSONObject().put("id", "smoke-shift"))
      .put("trip", JSONObject.NULL)
      .put("target", "₹500")
      .put("targetProgress", 50)
      .put("rides", "0")
      .put("liveKm", "0.0 km")
      .put("revenue", "₹0")
      .put("overlayAction", "GO_TO_PICKUP")
      .put("overlayTripId", "");
    Intent update = new Intent(context, KfeOverlayService.class)
      .setAction(KfeOverlayService.ACTION_UPDATE)
      .putExtra(KfeOverlayService.EXTRA_STATE, state.toString());
    context.startService(update);
    Field field = KfeOverlayService.class.getDeclaredField("overlay");
    field.setAccessible(true);
    long deadline = SystemClock.uptimeMillis() + 5000L;
    Object overlay = null;
    while (SystemClock.uptimeMillis() < deadline) {
      KfeOverlayService service = KfeOverlayService.instance;
      if (service != null) overlay = field.get(service);
      if (overlay != null) break;
      SystemClock.sleep(100L);
    }
    assertNotNull("Native overlay service instance must exist", KfeOverlayService.instance);
    assertNotNull("Native overlay view must be created while MainActivity is not visible", overlay);
  }
}
