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
    swipeOverlay(service);
    assertEquals("GO_TO_PICKUP|trip-a|", pendingValue());
    acknowledgePending("GO_TO_PICKUP", "trip-a");
    state.put("overlayAction", "START_RIDE");
    KfeOverlayService.update(context, state.toString());
    waitForOverlay();
    service = waitForService();
    actionStage.set(service, "START_RIDE");
    pendingTripId.set(service, "trip-a");
    swipeOverlay(service);
    assertEquals("START_RIDE|trip-a|", pendingValue());
    acknowledgePending("START_RIDE", "trip-a");
    state.put("overlayAction", "END_RIDE");
    KfeOverlayService.update(context, state.toString());
    waitForOverlay();
    service = waitForService();
    actionStage.set(service, "END_RIDE");
    pendingTripId.set(service, "trip-a");
    swipeOverlay(service);
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

  private void swipeOverlay(KfeOverlayService service) throws Exception {
    service = waitForService();
    Field field = KfeOverlayService.class.getDeclaredField("overlay");
    field.setAccessible(true);
    android.view.View view = (android.view.View) field.get(service);
    int width = view.getWidth();
    final float density = view.getResources().getDisplayMetrics().density;
    final float y = Math.max(105f * density, Math.min(view.getHeight() - 5f, 115f * density));
    final int overlayWidth = width;
    InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
      long now = SystemClock.uptimeMillis();
      view.dispatchTouchEvent(android.view.MotionEvent.obtain(now, now, android.view.MotionEvent.ACTION_DOWN, 20f, y, 0));
      view.dispatchTouchEvent(android.view.MotionEvent.obtain(now, now + 80, android.view.MotionEvent.ACTION_MOVE, overlayWidth * 0.55f, y, 0));
      view.dispatchTouchEvent(android.view.MotionEvent.obtain(now, now + 160, android.view.MotionEvent.ACTION_MOVE, overlayWidth * 0.92f, y, 0));
      view.dispatchTouchEvent(android.view.MotionEvent.obtain(now, now + 220, android.view.MotionEvent.ACTION_UP, overlayWidth * 0.92f, y, 0));
    });
    SystemClock.sleep(250);
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
    SystemClock.sleep(350L);
    context.startService(new Intent(context, KfeOverlayService.class));
    service = waitForService();
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
