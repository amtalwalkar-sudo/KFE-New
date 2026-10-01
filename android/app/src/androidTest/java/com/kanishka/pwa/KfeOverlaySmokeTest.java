package com.kanishka.pwa;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.provider.Settings;

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
    actionStage.set(service, "GO_TO_PICKUP");
    pendingTripId.set(service, "trip-a");
    swipeOverlay(service);
    assertEquals("GO_TO_PICKUP|trip-a|", pendingValue());

    clearPending();
    state.put("overlayAction", "START_RIDE");
    KfeOverlayService.update(context, state.toString());
    waitForOverlay();
    actionStage.set(service, "START_RIDE");
    pendingTripId.set(service, "trip-a");
    swipeOverlay(service);
    assertEquals("START_RIDE|trip-a|", pendingValue());

    clearPending();
    state.put("overlayAction", "END_RIDE");
    KfeOverlayService.update(context, state.toString());
    waitForOverlay();
    actionStage.set(service, "END_RIDE");
    pendingTripId.set(service, "trip-a");
    swipeOverlay(service);
    assertEquals("END_RIDE|trip-a|", pendingValue());

    pendingFareTripId.set(service, "trip-a");
    pendingTripId.set(service, "trip-b");
    assertEquals("trip-a", KfeOverlayService.resolveFareActionTripId("trip-a", "trip-b"));
    KfeRideNotificationsPlugin.recordPendingAction(context, "ENTER_FARE", "trip-a", "450");
    assertEquals("ENTER_FARE|trip-a|450", pendingValue());
    clearPending();
  }

  @Test public void pendingActionSurvivesOverlayServiceRecreationUntilExplicitClear() throws Exception {
    clearPending();
    KfeRideNotificationsPlugin.recordPendingAction(context, "END_RIDE", "trip-replay", "");
    assertEquals("END_RIDE|trip-replay|", pendingValue());
    context.stopService(new Intent(context, KfeOverlayService.class));
    SystemClock.sleep(300);
    context.startService(new Intent(context, KfeOverlayService.class));
    waitForService();
    assertEquals("END_RIDE|trip-replay|", pendingValue());
    clearPending();
    assertEquals("", pendingValue());
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
      Object overlay = field.get(KfeOverlayService.instance);
      if (overlay != null && ((android.view.View) overlay).getWidth() > 100) return;
      SystemClock.sleep(100L);
    }
    throw new AssertionError("KFE overlay view did not become interactive");
  }

  private void swipeOverlay(KfeOverlayService service) throws Exception {
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
    return context.getSharedPreferences("kfe_ride_notification_events", Context.MODE_PRIVATE)
      .getString("pending", "");
  }

  private void clearPending() {
    context.getSharedPreferences("kfe_ride_notification_events", Context.MODE_PRIVATE).edit().remove("pending").commit();
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
