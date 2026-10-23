package com.kanishka.pwa;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.Intent;
import android.location.LocationManager;
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
import java.lang.reflect.Method;

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

  @Test public void stalePwaSnapshotCannotResetNativeTripTimerAfterRecovery() throws Exception {
    long authoritativeStart = System.currentTimeMillis() - 65000L;
    context.getSharedPreferences("kfe_overlay", Context.MODE_PRIVATE).edit()
      .putString("actionStage", "END_RIDE")
      .putString("pendingTripId", "timer-trip")
      .putString("tripTimerTripId", "timer-trip")
      .putLong("tripStartAt", authoritativeStart)
      .putLong("phaseStartAt", authoritativeStart)
      .putString("phaseLabel", "TRIP TIME").apply();
    JSONObject staleState = new JSONObject()
      .put("shift", new JSONObject().put("id", "timer-shift"))
      .put("trip", new JSONObject().put("id", "timer-trip").put("status", "ACTIVE"))
      .put("overlayAction", "START_RIDE")
      .put("overlayTripId", "timer-trip")
      .put("tripStartAt", 0L)
      .put("phaseStartAt", 0L)
      .put("phaseLabel", "STALE TIMER");
    KfeOverlayService.update(context, staleState.toString());
    waitForOverlay();
    KfeOverlayService service = waitForService();
    assertEquals("END_RIDE", fieldValue(service, "actionStage"));
    assertEquals("timer-trip", fieldValue(service, "pendingTripId"));
    assertEquals(authoritativeStart, ((Long) fieldValue(service, "tripStartAt")).longValue());
    assertEquals(authoritativeStart, ((Long) fieldValue(service, "phaseStartAt")).longValue());
    assertEquals("TRIP TIME", fieldValue(service, "phaseLabel"));
    assertEquals(authoritativeStart,
      context.getSharedPreferences("kfe_overlay", Context.MODE_PRIVATE).getLong("tripStartAt", 0L));
  }

  @Test public void fareSubmissionKeepsCompletedTripIdentityAcrossNextPickup() {
    assertEquals("completed-trip", KfeOverlayService.resolveFareActionTripId("completed-trip", "next-active-trip"));
    assertEquals("current-trip", KfeOverlayService.resolveFareActionTripId("", "current-trip"));
    assertEquals("", KfeOverlayService.resolveFareActionTripId("", null));
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

  @Test public void swipeAcceptsNearEdgeOfThumbAndLowerHitLane() throws Exception {
    clearPending();
    seedCanonicalShift("edge-swipe-shift");
    JSONObject state = new JSONObject()
      .put("shift", new JSONObject().put("id", "edge-swipe-shift"))
      .put("trip", JSONObject.NULL)
      .put("overlayAction", "GO_TO_PICKUP")
      .put("overlayTripId", "edge-swipe-trip");
    KfeOverlayService.update(context, state.toString());
    waitForOverlay();
    KfeOverlayService service = waitForService();
    setField(service, "actionStage", "GO_TO_PICKUP");
    setField(service, "pendingTripId", "edge-swipe-trip");
    float progress = swipeOverlay(service, 0.92f, 65f, 136f);
    assertTrue("Swipe must track a drag starting near the thumb edge and lower hit lane", progress > 0.05f);
    assertEquals("A complete swipe from the expanded hit lane must emit one pickup action",
      "GO_TO_PICKUP|edge-swipe-trip|", pendingValue());
  }

  @Test public void partiallyDisplacedHandleCanBeGrabbedAndCompleted() throws Exception {
    clearPending();
    seedCanonicalShift("partial-handle-shift");
    JSONObject state = new JSONObject()
      .put("shift", new JSONObject().put("id", "partial-handle-shift"))
      .put("trip", JSONObject.NULL)
      .put("overlayAction", "GO_TO_PICKUP")
      .put("overlayTripId", "partial-handle-trip");
    KfeOverlayService.update(context, state.toString());
    waitForOverlay();
    KfeOverlayService service = waitForService();
    setField(service, "actionStage", "GO_TO_PICKUP");
    setField(service, "pendingTripId", "partial-handle-trip");
    Field overlayField = KfeOverlayService.class.getDeclaredField("overlay");
    overlayField.setAccessible(true);
    android.view.View view = (android.view.View) overlayField.get(service);
    float density = view.getResources().getDisplayMetrics().density;
    float widthDp = view.getWidth() / density;
    float startXdp = 8f + (widthDp - 16f - 58f) * 0.45f + 29f;
    setField(view, "progress", 0.45f);
    float intermediate = swipeOverlay(service, 0.92f, startXdp, 120f);
    assertTrue("Recovered swipe must continue tracking from the displaced thumb", intermediate > 0.05f);
    assertEquals("A displaced handle must still complete the pickup action",
      "GO_TO_PICKUP|partial-handle-trip|", pendingValue());
  }

  @Test public void lifecyclePersistenceBoundariesRetryWithoutDuplicateEventOrTrip() throws Exception {
    java.lang.reflect.Method persist = KfeOverlayService.class.getDeclaredMethod(
      "persistLifecycleAction", String.class, String.class, boolean.class);
    persist.setAccessible(true);
    for (String boundary : new String[]{"AFTER_CHECKPOINT", "AFTER_OUTBOX", "AFTER_CANONICAL"}) {
      String suffix = boundary.toLowerCase(java.util.Locale.US) + "-" + java.util.UUID.randomUUID();
      String shiftId = "fault-shift-" + suffix;
      String tripId = "fault-trip-" + suffix;
      context.getSharedPreferences("kfe_native_work_actions", 0).edit()
        .remove("pendingEventId").remove("pending").commit();
      seedCanonicalShift(shiftId);
      JSONObject state = new JSONObject()
        .put("shift", new JSONObject().put("id", shiftId).put("status", "ACTIVE"))
        .put("trip", JSONObject.NULL)
        .put("overlayAction", "GO_TO_PICKUP")
        .put("overlayTripId", tripId);
      KfeOverlayService.update(context, state.toString());
      // An existing overlay can already have non-zero dimensions from @Before,
      // so waitForOverlay() alone does not prove this UPDATE intent was applied.
      // Wait for the service to persist this exact fixture before mutating its
      // checkpoint or injecting faults; otherwise a late prior UPDATE can race
      // the retry and make the canonical-trip assertion nondeterministic.
      long stateDeadline = SystemClock.uptimeMillis() + 5000L;
      while (SystemClock.uptimeMillis() < stateDeadline
          && !state.toString().equals(context.getSharedPreferences("kfe_overlay", 0)
              .getString("lastOverlayState", ""))) {
        SystemClock.sleep(25L);
      }
      assertEquals("Overlay service must apply the current lifecycle fixture before fault injection",
        state.toString(), context.getSharedPreferences("kfe_overlay", 0).getString("lastOverlayState", ""));
      waitForOverlay();
      // Keep the exact shift/trip snapshot deterministic before fault injection.
      context.getSharedPreferences("kfe_overlay", 0).edit()
        .putString("lastOverlayState", state.toString()).commit();
      KfeOverlayService service = waitForService();
      setField(service, "actionStage", "GO_TO_PICKUP");
      setField(service, "pendingTripId", tripId);

      KfeOverlayService.lifecycleFaultInjectorForTests = reached -> {
        if (boundary.equals(reached)) throw new RuntimeException("Injected " + boundary);
      };
      try {
        persist.invoke(service, "GO_TO_PICKUP", "GOING_TO_PICKUP", false);
        throw new AssertionError("Expected lifecycle fault at " + boundary);
      } catch (java.lang.reflect.InvocationTargetException expected) {
        assertTrue("Unexpected injected fault: " + expected.getCause(),
          expected.getCause() instanceof RuntimeException
            && expected.getCause().getMessage().contains(boundary));
      } finally {
        KfeOverlayService.lifecycleFaultInjectorForTests = null;
      }

      String originalEventId = context.getSharedPreferences("kfe_native_work_actions", 0)
        .getString("pendingEventId", "");
      boolean eventAfterFault = KfeNativeEventStore.get(context).contains(originalEventId);
      boolean canonicalAfterFault = KfeCanonicalWorkStore.get(context)
        .getRecord("TRIP", tripId).optBoolean("found", false);
      if ("AFTER_CHECKPOINT".equals(boundary)) {
        assertTrue("Checkpoint fault must not append an event", !eventAfterFault);
        assertTrue("Checkpoint fault must not write a canonical trip", !canonicalAfterFault);
      } else {
        assertTrue("Outbox/canonical fault must retain its durable event even if already acknowledged", eventAfterFault);
        assertEquals("Canonical state must exist only after the canonical-write boundary",
          "AFTER_CANONICAL".equals(boundary), canonicalAfterFault);
      }

      try {
        persist.invoke(service, "GO_TO_PICKUP", "GOING_TO_PICKUP", false);
      } catch (java.lang.reflect.InvocationTargetException retryFailure) {
        throw new AssertionError("Lifecycle retry failed at boundary " + boundary
          + " for trip " + tripId + ": " + retryFailure.getCause(), retryFailure.getCause());
      }
      String eventIdAfterRetry = context.getSharedPreferences("kfe_native_work_actions", 0)
        .getString("pendingEventId", "");
      assertTrue("Retry must converge to a durable event", KfeNativeEventStore.get(context).contains(eventIdAfterRetry));
      if (!originalEventId.isEmpty()) {
        assertEquals("Retry must reuse the original event ID", originalEventId, eventIdAfterRetry);
      }
      JSONObject canonicalTrip = KfeCanonicalWorkStore.get(context).getRecord("TRIP", tripId);
      assertTrue("Retry must leave a durable canonical trip", canonicalTrip.optBoolean("found", false));
      assertEquals("ACTIVE", canonicalTrip.getJSONObject("record").getString("status"));
      assertEquals("GOING_TO_PICKUP", canonicalTrip.getJSONObject("record").getString("tripStage"));
    }
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
    seedCanonicalShift("golden-shift");
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

  private void seedCanonicalShift(String shiftId) throws Exception {
    JSONObject shift = new JSONObject().put("id", shiftId).put("status", "ACTIVE")
      .put("revenue", 0).put("liveFareRevenue", 0)
      .put("updatedAt", java.time.Instant.now().toString());
    KfeCanonicalWorkStore.get(context).putRecord(
      "test-active-shift-" + shiftId + "-" + java.util.UUID.randomUUID(), "SHIFT", shift);
  }

  private void seedCanonicalTrip(JSONObject trip) throws Exception {
    if (!trip.has("updatedAt")) trip.put("updatedAt", java.time.Instant.now().toString());
    KfeCanonicalWorkStore.get(context).putRecord(
      "test-trip-seed-" + trip.optString("id") + "-" + java.util.UUID.randomUUID(), "TRIP", trip);
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
    return swipeOverlay(service, endFraction, 20f, 115f);
  }

  private float swipeOverlay(KfeOverlayService service, float endFraction, float startXdp, float startYdp) throws Exception {
    service = waitForService();
    Field field = KfeOverlayService.class.getDeclaredField("overlay");
    field.setAccessible(true);
    android.view.View view = (android.view.View) field.get(service);
    int width = view.getWidth();
    final float density = view.getResources().getDisplayMetrics().density;
    final float y = Math.max(1f, Math.min(view.getHeight() - 2f, startYdp * density));
    final float startX = startXdp * density;
    final int overlayWidth = width;
    Field progressField = view.getClass().getDeclaredField("progress");
    progressField.setAccessible(true);
    final float[] intermediateProgress = {0f};
    InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
      long now = SystemClock.uptimeMillis();
      try {
        view.dispatchTouchEvent(android.view.MotionEvent.obtain(now, now, android.view.MotionEvent.ACTION_DOWN, startX, y, 0));
        view.dispatchTouchEvent(android.view.MotionEvent.obtain(now, now + 80, android.view.MotionEvent.ACTION_MOVE, startX + (overlayWidth * 0.35f - startX) * 0.45f, y, 0));
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

  private org.json.JSONArray pendingEventsForTrip(String tripId) throws Exception {
    org.json.JSONArray all = KfeNativeEventStore.get(context).pending(100);
    org.json.JSONArray matches = new org.json.JSONArray();
    for (int i = 0; i < all.length(); i++) {
      org.json.JSONObject event = all.getJSONObject(i);
      if (tripId.equals(event.optString("tripId", ""))) matches.put(event);
    }
    return matches;
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
    seedCanonicalShift("fare-shift");
    seedCanonicalTrip(new JSONObject().put("id", "fare-trip").put("shiftId", "fare-shift")
      .put("status", "COMPLETED").put("tripStage", "COMPLETED")
      .put("tripEndAt", java.time.Instant.now().toString()));
    JSONObject state = new JSONObject()
      .put("shift", new JSONObject().put("id", "fare-shift"))
      .put("trip", new JSONObject().put("id", "fare-trip").put("shiftId", "fare-shift")
        .put("status", "COMPLETED").put("tripEndAt", "2026-10-15T19:00:00.000Z"))
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
    JSONObject storedOutcome = KfeCanonicalWorkStore.get(context).getRecord("TRIP", "fare-trip");
    assertTrue("Fare must commit to native canonical storage", storedOutcome.optBoolean("found", false));
    JSONObject storedTrip = storedOutcome.getJSONObject("record");
    assertEquals("COMPLETED", storedTrip.getString("status"));
    assertEquals(450d, storedTrip.getDouble("revenue"), 0.001d);
    assertEquals(0d, storedTrip.getDouble("toll"), 0.001d);
    assertEquals(25d, storedTrip.getDouble("parking"), 0.001d);
    assertEquals("EXCLUDED", storedTrip.getString("tollTreatment"));
  }

  @Test public void cancellationFormAllowsOptionalFeeAndPersistsPassengerReason() throws Exception {
    clearPending();
    seedCanonicalShift("cancel-shift");
    seedCanonicalTrip(new JSONObject().put("id", "cancel-trip").put("shiftId", "cancel-shift")
      .put("status", "ACTIVE").put("tripStage", "GOING_TO_PICKUP"));
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
    JSONObject storedOutcome = KfeCanonicalWorkStore.get(context).getRecord("TRIP", "cancel-trip");
    assertTrue("Cancellation must commit to native canonical storage", storedOutcome.optBoolean("found", false));
    JSONObject storedTrip = storedOutcome.getJSONObject("record");
    assertEquals("CANCELLED", storedTrip.getString("status"));
    assertEquals("PASSENGER", storedTrip.getString("cancelReason"));
    assertEquals("An omitted cancellation fee is canonical zero, not a fabricated prior fare",
      0d, storedTrip.getDouble("cancelledRevenue"), 0.001d);
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


  @Test public void completedShiftAdvancesPastNativeRevenueProjectionWithoutLosingRevenue() throws Exception {
    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    String shiftId = "projection-complete-" + java.util.UUID.randomUUID();
    String tripId = "projection-trip-" + java.util.UUID.randomUUID();
    String oldVersion = java.time.Instant.now().minusSeconds(30).toString();
    JSONObject activeShift = new JSONObject().put("id", shiftId).put("status", "ACTIVE")
      .put("updatedAt", oldVersion).put("revenue", 0).put("liveFareRevenue", 0)
      .put("revenueSource", "TRIP_FARES");
    assertTrue("Active shift seed must commit",
      store.putRecord("projection-seed-" + shiftId, "SHIFT", activeShift).accepted);

    JSONObject trip = new JSONObject().put("id", tripId).put("shiftId", shiftId)
      .put("status", "COMPLETED").put("fareDetailsSkipped", false).put("revenue", 250)
      .put("updatedAt", java.time.Instant.now().toString());
    assertTrue("Completed trip must commit and refresh native revenue",
      store.putRecord("projection-trip-write-" + tripId, "TRIP", trip).accepted);
    JSONObject projected = store.getRecord("SHIFT", shiftId).getJSONObject("record");
    assertEquals(250d, projected.getDouble("revenue"), 0.001d);
    assertTrue("Trip projection must advance the native shift version",
      java.time.Instant.parse(projected.getString("updatedAt")).isAfter(java.time.Instant.parse(oldVersion)));

    // This models the PWA's durable completion snapshot created before its mirror
    // crosses the bridge. It is older than the native projection version.
    JSONObject completedShift = new JSONObject().put("id", shiftId).put("status", "COMPLETED")
      .put("updatedAt", oldVersion).put("endOdometer", 1200).put("revenue", 0)
      .put("liveFareRevenue", 0).put("revenueSource", "TRIP_FARES");
    KfeCanonicalWorkStore.Outcome completed = store.putRecord(
      "projection-end-shift-" + shiftId, "SHIFT", completedShift);
    assertTrue("ACTIVE -> COMPLETED must not fail on a version advanced by derived revenue", completed.accepted);
    JSONObject canonical = store.getRecord("SHIFT", shiftId).getJSONObject("record");
    assertEquals("COMPLETED", canonical.getString("status"));
    assertEquals(1200, canonical.getInt("endOdometer"));
    assertEquals("Trip fare must remain authoritative through shift completion", 250d,
      canonical.getDouble("revenue"), 0.001d);
    assertEquals(250d, canonical.getDouble("liveFareRevenue"), 0.001d);
    assertTrue("Completed shift version must advance past the projection",
      java.time.Instant.parse(canonical.getString("updatedAt"))
        .isAfter(java.time.Instant.parse(projected.getString("updatedAt"))));

    JSONObject exactRetryPayload = new JSONObject().put("id", shiftId).put("status", "COMPLETED")
      .put("updatedAt", oldVersion).put("endOdometer", 1200).put("revenue", 0)
      .put("liveFareRevenue", 0).put("revenueSource", "TRIP_FARES");
    KfeCanonicalWorkStore.Outcome retry = store.putRecord(
      "projection-end-shift-" + shiftId, "SHIFT", exactRetryPayload);
    assertTrue("Retry of the same completion operation must be idempotent", retry.duplicate);
    assertEquals("COMPLETED", store.getRecord("SHIFT", shiftId).getJSONObject("record").getString("status"));
  }

  @Test public void tripLocalityLabelSurvivesNativeReloadAndStalePwaSynchronization() throws Exception {
    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    String tripId = "locality-reload-" + java.util.UUID.randomUUID();
    String shiftId = "locality-shift-" + java.util.UUID.randomUUID();
    String now = java.time.Instant.now().toString();
    JSONObject trip = new JSONObject().put("id", tripId).put("shiftId", shiftId)
      .put("status", "ACTIVE").put("tripStage", "START_RIDE")
      .put("createdAt", now).put("updatedAt", now);
    assertTrue("Canonical trip seed must commit",
      store.putRecord("locality-seed-" + tripId, "TRIP", trip).accepted);

    JSONObject snapshot = new JSONObject().put("latitude", 19.1197).put("longitude", 72.8468)
      .put("accuracy", 12.0).put("capturedAt", now);
    assertTrue("GPS snapshot must commit before its locality label",
      store.persistTripBoundarySnapshot("locality-gps-" + tripId, tripId, "tripStartLocation", snapshot).accepted);

    String labelOperation = "locality-label-" + tripId;
    KfeCanonicalWorkStore.Outcome labelWrite = store.updateTripBoundaryPlaceName(
      labelOperation, tripId, "tripStartLocation", "Andheri East, Mumbai");
    assertTrue("Locality metadata write must be accepted", labelWrite.accepted);
    assertTrue("Retrying the same operation must be idempotent",
      store.updateTripBoundaryPlaceName(labelOperation, tripId, "tripStartLocation", "Andheri East, Mumbai").duplicate);
    JSONObject immediatelyAfterLabel = store.getRecord("TRIP", tripId).optJSONObject("record");
    assertEquals("Metadata enrichment must not advance the business version", now, immediatelyAfterLabel.getString("updatedAt"));

    // Simulate a newer PWA mirror that has the business record but lacks the
    // native-only boundary snapshot/locality metadata.
    JSONObject staleMirror = new JSONObject().put("id", tripId).put("shiftId", shiftId)
      .put("status", "ACTIVE").put("tripStage", "START_RIDE")
      .put("createdAt", now).put("updatedAt", java.time.Instant.now().plusSeconds(3).toString());
    assertTrue("PWA mirror must synchronize without dropping native metadata",
      store.putRecord("locality-mirror-" + tripId, "TRIP", staleMirror).accepted);

    JSONObject beforeReload = store.getRecord("TRIP", tripId).optJSONObject("record");
    assertNotNull("Canonical trip must be readable before reload", beforeReload);
    assertEquals("Andheri East, Mumbai",
      beforeReload.getJSONObject("tripStartLocation").getString("placeName"));
    assertEquals(19.1197, beforeReload.getJSONObject("tripStartLocation").getDouble("latitude"), 0.00001);
    assertEquals(now, beforeReload.getJSONObject("tripStartLocation").getString("capturedAt"));

    // Close and reopen the actual SQLite helper so this checks the durable
    // storage boundary rather than only an in-memory object or serialized fixture.
    store.close();
    java.lang.reflect.Field instance = KfeCanonicalWorkStore.class.getDeclaredField("instance");
    instance.setAccessible(true);
    instance.set(null, null);
    KfeCanonicalWorkStore reopened = KfeCanonicalWorkStore.get(context);
    JSONObject afterReload = reopened.getRecord("TRIP", tripId).optJSONObject("record");
    assertNotNull("Canonical trip must reload from SQLite", afterReload);
    assertEquals("Andheri East, Mumbai",
      afterReload.getJSONObject("tripStartLocation").getString("placeName"));
    assertEquals(19.1197, afterReload.getJSONObject("tripStartLocation").getDouble("latitude"), 0.00001);
    assertEquals(now, afterReload.getJSONObject("tripStartLocation").getString("capturedAt"));
  }

  @Test public void shiftAndFuelEventLocationsSurviveNativeReloadAndLabelEnrichment() throws Exception {
    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    String eventAt = java.time.Instant.now().minusSeconds(60).toString();
    String now = java.time.Instant.now().toString();
    String[][] cases = new String[][] {{"SHIFT", "SHIFT_START"}, {"FUEL", "FUEL_ENTRY"}};
    java.util.List<String> ids = new java.util.ArrayList<>();
    for (String[] item : cases) {
      String id = "event-location-" + java.util.UUID.randomUUID();
      ids.add(id);
      JSONObject snapshot = new JSONObject().put("id", id).put("entityType", item[0])
        .put("entityId", item[0].toLowerCase(java.util.Locale.US) + "-" + java.util.UUID.randomUUID())
        .put("eventType", item[1]).put("eventAt", eventAt).put("latitude", 19.0486).put("longitude", 73.0694)
        .put("accuracy", 8.0).put("capturedAt", now).put("createdAt", now).put("updatedAt", now);
      KfeCanonicalWorkStore.Outcome created = store.putRecord("event-location-create-" + id, "GPS_SNAPSHOT", snapshot);
      assertTrue("Event location coordinates must be committed to native canonical storage", created.accepted);
      assertTrue("Retry of the same snapshot operation must be idempotent",
        store.putRecord("event-location-create-" + id, "GPS_SNAPSHOT", snapshot).duplicate);

      String enrichedAt = java.time.Instant.now().plusMillis(50).toString();
      JSONObject enriched = new JSONObject(snapshot.toString()).put("placeName", "Kharghar, Navi Mumbai")
        .put("updatedAt", enrichedAt);
      assertTrue("Locality label should enrich the existing durable event snapshot",
        store.putRecord("event-location-label-" + id, "GPS_SNAPSHOT", enriched).accepted);
    }
    store.close();
    java.lang.reflect.Field instance = KfeCanonicalWorkStore.class.getDeclaredField("instance");
    instance.setAccessible(true);
    instance.set(null, null);
    KfeCanonicalWorkStore reopened = KfeCanonicalWorkStore.get(context);
    for (int i = 0; i < cases.length; i++) {
      JSONObject afterReload = reopened.getRecord("GPS_SNAPSHOT", ids.get(i)).optJSONObject("record");
      assertNotNull("Event location must reload from SQLite", afterReload);
      assertEquals("Kharghar, Navi Mumbai", afterReload.getString("placeName"));
      assertEquals(19.0486, afterReload.getDouble("latitude"), 0.00001);
      assertEquals(73.0694, afterReload.getDouble("longitude"), 0.00001);
      assertEquals(now, afterReload.getString("capturedAt"));
      assertEquals("Business event time must remain distinct from the GPS fix time", eventAt, afterReload.getString("eventAt"));
      assertEquals(cases[i][1], afterReload.getString("eventType"));
      assertEquals(cases[i][0], afterReload.getString("entityType"));
    }
  }

  @Test public void nativeTripBoundarySnapshotPersistsOfflineAndIsIdempotent() throws Exception {
    String shiftId = "offline-gps-shift-" + System.currentTimeMillis();
    String tripId = "offline-gps-trip-" + System.currentTimeMillis();
    seedCanonicalShift(shiftId);
    seedCanonicalTrip(new JSONObject()
      .put("id", tripId).put("shiftId", shiftId).put("status", "ACTIVE")
      .put("tripStage", "GOING_TO_PICKUP")
      .put("tripStartLocation", JSONObject.NULL).put("tripEndLocation", JSONObject.NULL)
      .put("tripStartLocationStatus", "MISSING").put("tripEndLocationStatus", "MISSING"));
    KfeOverlayService service = waitForService();
    Method capture = KfeOverlayService.class.getDeclaredMethod("captureOneShotTripBoundary", String.class, String.class);
    capture.setAccessible(true);

    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    LocationManager locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
    assertNotNull("Android location manager must exist for the offline GPS test.", locationManager);
    assertTrue("GPS_PROVIDER must remain enabled with networking disabled.", locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER));
    capture.invoke(service, tripId, "tripStartLocation");
    JSONObject startSnapshot = null;
    // The service waits up to 30 seconds for a one-shot fix; allow five more seconds for the canonical store read.
    final long gpsFixWaitMillis = 35000L;
    long deadline = SystemClock.uptimeMillis() + gpsFixWaitMillis;
    while (SystemClock.uptimeMillis() < deadline) {
      JSONObject found = store.getRecord("TRIP", tripId);
      JSONObject trip = found.optJSONObject("record");
      if (trip != null) startSnapshot = trip.optJSONObject("tripStartLocation");
      if (found.optBoolean("found", false) && startSnapshot != null && !startSnapshot.optString("capturedAt", "").isEmpty()) break;
      SystemClock.sleep(100L);
    }
    assertNotNull("Native overlay must capture a GPS start fix with networking disabled.", startSnapshot);
    String startAt = startSnapshot.getString("capturedAt");
    assertTrue(Double.isFinite(startSnapshot.getDouble("latitude")));
    assertTrue(Double.isFinite(startSnapshot.getDouble("longitude")));
    java.time.Instant.parse(startAt);

    // A repeated lifecycle callback must not replace the first durable fix.
    capture.invoke(service, tripId, "tripStartLocation");
    JSONObject afterRetry = store.getRecord("TRIP", tripId).getJSONObject("record").getJSONObject("tripStartLocation");
    assertEquals(startAt, afterRetry.getString("capturedAt"));

    capture.invoke(service, tripId, "tripEndLocation");
    JSONObject endSnapshot = null;
    deadline = SystemClock.uptimeMillis() + gpsFixWaitMillis;
    while (SystemClock.uptimeMillis() < deadline) {
      JSONObject found = store.getRecord("TRIP", tripId);
      JSONObject trip = found.optJSONObject("record");
      if (trip != null) endSnapshot = trip.optJSONObject("tripEndLocation");
      if (found.optBoolean("found", false) && endSnapshot != null && !endSnapshot.optString("capturedAt", "").isEmpty()) break;
      SystemClock.sleep(100L);
    }
    assertNotNull("Native overlay must capture a GPS end fix with networking disabled.", endSnapshot);
    String endAt = endSnapshot.getString("capturedAt");
    assertTrue(Double.isFinite(endSnapshot.getDouble("latitude")));
    assertTrue(Double.isFinite(endSnapshot.getDouble("longitude")));
    java.time.Instant.parse(endAt);

    store.close();
    Field singleton = KfeCanonicalWorkStore.class.getDeclaredField("instance");
    singleton.setAccessible(true);
    singleton.set(null, null);
    KfeCanonicalWorkStore reopenedStore = KfeCanonicalWorkStore.get(context);
    JSONObject reopened = reopenedStore.getRecord("TRIP", tripId).getJSONObject("record");
    assertEquals("Start fix timestamp must survive native store reopen.", startAt, reopened.getJSONObject("tripStartLocation").getString("capturedAt"));
    assertEquals("End fix timestamp must survive native store reopen.", endAt, reopened.getJSONObject("tripEndLocation").getString("capturedAt"));

    // Do not leak an ACTIVE shift into the following instrumentation cases.
    JSONObject completedTrip = new JSONObject(reopened.toString())
      .put("status", "COMPLETED").put("updatedAt", java.time.Instant.now().toString());
    reopenedStore.putRecord("test-complete-trip-" + tripId + "-" + java.util.UUID.randomUUID(), "TRIP", completedTrip);
    JSONObject completedShift = reopenedStore.getRecord("SHIFT", shiftId).getJSONObject("record");
    completedShift.put("status", "COMPLETED").put("updatedAt", java.time.Instant.now().toString());
    reopenedStore.putRecord("test-complete-shift-" + shiftId + "-" + java.util.UUID.randomUUID(), "SHIFT", completedShift);
  }

  @Test public void nativeOverlayCompletesFareAndCancellationUsingGesturesAndVisibleFormControlsWithoutPwaReplay() throws Exception {
    // These domain rules are independently testable from the form widgets.
    assertTrue(KfeNativeTripFormRules.isValidOptionalAmount(""));
    assertTrue(KfeNativeTripFormRules.isValidOptionalAmount("  "));
    assertTrue(KfeNativeTripFormRules.isValidOptionalAmount("0"));
    assertTrue(KfeNativeTripFormRules.isValidOptionalAmount("1.25"));
    assertTrue(!KfeNativeTripFormRules.isValidOptionalAmount("-0.01"));
    assertTrue(!KfeNativeTripFormRules.isValidOptionalAmount("NaN"));
    assertTrue(!KfeNativeTripFormRules.isValidOptionalAmount("Infinity"));
    assertTrue(!KfeNativeTripFormRules.isValidOptionalAmount("abc"));
    assertTrue(KfeNativeTripFormRules.isValidCancellationReason("PASSENGER"));
    assertTrue(KfeNativeTripFormRules.isValidCancellationReason("DRIVER"));
    assertTrue(!KfeNativeTripFormRules.isValidCancellationReason(""));
    assertTrue(!KfeNativeTripFormRules.isValidCancellationReason("UNKNOWN"));
    JSONObject fareCommand=KfeNativeTripFormRules.buildFarePayload(" 425 "," 12.5 ","",true,false);
    assertEquals("425",fareCommand.getString("fare"));
    assertEquals("12.5",fareCommand.getString("toll"));
    assertEquals("",fareCommand.getString("parking"));
    assertEquals("EXCLUDED",fareCommand.getString("tollTreatment"));
    assertEquals("INCLUDED",fareCommand.getString("parkingTreatment"));
    JSONObject cancellationCommand=KfeNativeTripFormRules.buildCancellationPayload(" 0 ","PASSENGER");
    assertEquals("0",cancellationCommand.getString("revenue"));
    assertEquals("PASSENGER",cancellationCommand.getString("reason"));

    android.content.SharedPreferences draftPrefs=context.getSharedPreferences("native-form-draft-boundary-test",Context.MODE_PRIVATE);
    draftPrefs.edit().clear().commit();
    KfeNativeTripFormDraftStore.save(draftPrefs,new KfeNativeTripFormDraftStore.Draft(
        "FARE","425","12.5","", "PASSENGER",true,true,false,true,false));
    KfeNativeTripFormDraftStore.Draft restoredDraft=KfeNativeTripFormDraftStore.load(draftPrefs);
    assertEquals("FARE",restoredDraft.mode);
    assertEquals("425",restoredDraft.fare);
    assertEquals("12.5",restoredDraft.toll);
    assertEquals("",restoredDraft.parking);
    assertEquals("PASSENGER",restoredDraft.reason);
    assertTrue(restoredDraft.cancelFormPwaSynchronized);
    assertTrue(restoredDraft.tollExpanded);
    assertTrue(restoredDraft.tollExcluded);
    assertFalse(restoredDraft.parkingExpanded);
    KfeNativeTripFormDraftStore.clear(draftPrefs);
    assertFalse("Clearing a submitted/dismissed form must remove its saved draft.",draftPrefs.contains("formMode"));
    draftPrefs.edit().clear().commit();

    // This invocation runs after the PWA is force-stopped. Prevent WebView creation in this process.
    android.webkit.WebView.disableWebView();
    clearPending();
    String suffix = Long.toString(System.currentTimeMillis());
    String shiftId = "overlay-full-shift-" + suffix;
    String fareTripId = "overlay-fare-trip-" + suffix;
    String cancelTripId = "overlay-cancel-trip-" + suffix;
    String now = new java.util.Date().toInstant().toString();
    KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(context);
    assertTrue(store.putRecord("overlay-shift-" + suffix, "SHIFT",
      new JSONObject().put("id", shiftId).put("status", "ACTIVE").put("revenue", 0).put("updatedAt", now)).accepted);

    JSONObject state = new JSONObject()
      .put("shift", new JSONObject().put("id", shiftId).put("status", "ACTIVE"))
      .put("trip", JSONObject.NULL).put("overlayAction", "GO_TO_PICKUP")
      .put("overlayTripId", fareTripId).put("revenue", "₹0");
    KfeOverlayService.update(context, state.toString());
    waitForOverlay();
    KfeOverlayService service = waitForService();

    // These swipes run the production touch handler. The native service advances
    // each stage immediately and persists the lifecycle before the PWA replays
    // the queued events; this test deliberately never launches MainActivity.
    assertSwipeTracksAndRetracts(service);
    assertEquals("START_RIDE", fieldValue(service, "actionStage"));

    // A stale PWA snapshot with another trip ID must not roll back the durable
    // native checkpoint after a simulated service/process restart boundary.
    JSONObject staleState = new JSONObject(state.toString())
        .put("overlayAction", "GO_TO_PICKUP")
        .put("overlayTripId", "stale-pwa-trip-" + suffix);
    KfeOverlayService.update(context, staleState.toString());
    waitForOverlay();
    service = waitForService();
    assertEquals("START_RIDE", fieldValue(service, "actionStage"));
    assertEquals("Native trip ID must survive stale PWA state.", fareTripId, fieldValue(service, "pendingTripId"));

    assertSwipeTracksAndRetracts(service);
    assertEquals("END_RIDE", fieldValue(service, "actionStage"));
    assertSwipeTracksAndRetracts(service);
    assertEquals("ENTER_FARE", fieldValue(service, "actionStage"));
    assertEquals("FARE", fieldValue(service, "formMode"));

    final KfeOverlayService fareService = service;
    InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
      try {
        ((EditText) fieldValue(fareService, "formInput")).setText("250");
        android.widget.Button save = findButton((android.view.ViewGroup) fieldValue(fareService, "formPanel"), "Save trip");
        assertNotNull("Driver-facing Save trip control must be visible", save);
        save.performClick();
      } catch (Exception e) { throw new AssertionError(e); }
    });
    JSONObject fareRecord = store.getRecord("TRIP", fareTripId);
    assertTrue("Visible fare form must commit a canonical trip without PWA replay", fareRecord.optBoolean("found", false));
    assertEquals("COMPLETED", fareRecord.getJSONObject("record").getString("status"));
    assertEquals(250d, fareRecord.getJSONObject("record").getDouble("revenue"), 0.001d);
    assertEquals("GO_TO_PICKUP", fieldValue(service, "actionStage"));

    // Start a second trip and open cancellation using the native overlay's
    // visible RIDE CANCELLATION hit target. No PWA state transition is invoked.
    state.put("overlayAction", "GO_TO_PICKUP").put("overlayTripId", cancelTripId);
    KfeOverlayService.update(context, state.toString());
    waitForOverlay();
    service = waitForService();
    // The overlay view already exists, so waitForOverlay() alone does not prove
    // that the asynchronous ACTION_UPDATE has applied the second trip. Do not
    // swipe until the native service has adopted the expected ID and stage.
    long secondTripDeadline = SystemClock.uptimeMillis() + 5000L;
    while (SystemClock.uptimeMillis() < secondTripDeadline
        && (!cancelTripId.equals(fieldValue(service, "pendingTripId"))
          || !"GO_TO_PICKUP".equals(fieldValue(service, "actionStage")))) {
      SystemClock.sleep(50L);
      service = waitForService();
    }
    assertEquals("Overlay must adopt the second trip before accepting its first swipe",
      cancelTripId, fieldValue(service, "pendingTripId"));
    assertEquals("Second trip must begin at pickup", "GO_TO_PICKUP", fieldValue(service, "actionStage"));
    assertSwipeTracksAndRetracts(service);
    assertEquals("START_RIDE", fieldValue(service, "actionStage"));
    assertEquals("Cancellation must target the trip opened by the native overlay.", cancelTripId, fieldValue(service, "pendingTripId"));
    final KfeOverlayService cancellationService = service;
    InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
      try {
        Field overlayField = KfeOverlayService.class.getDeclaredField("overlay");
        overlayField.setAccessible(true);
        android.view.View overlay = (android.view.View) overlayField.get(cancellationService);
        long t = SystemClock.uptimeMillis();
        float x = overlay.getWidth() - 30f * context.getResources().getDisplayMetrics().density;
        float y = 80f * context.getResources().getDisplayMetrics().density;
        overlay.dispatchTouchEvent(android.view.MotionEvent.obtain(t, t, android.view.MotionEvent.ACTION_DOWN, x, y, 0));
        overlay.dispatchTouchEvent(android.view.MotionEvent.obtain(t, t + 60, android.view.MotionEvent.ACTION_UP, x, y, 0));
      } catch (Exception e) { throw new AssertionError(e); }
    });
    assertEquals("CANCEL", fieldValue(service, "formMode"));
    InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
      try {
        android.view.ViewGroup panel = (android.view.ViewGroup) fieldValue(cancellationService, "formPanel");
        android.widget.Button passenger = findButton(panel, "Passenger cancellation");
        android.widget.Button driver = findButton(panel, "Driver cancellation");
        assertNotNull("Driver-facing passenger cancellation option must be visible", passenger);
        assertNotNull("Driver-facing driver cancellation option must be visible", driver);
        Field reasonPanelField = KfeOverlayService.class.getDeclaredField("cancelReasonPanel");
        reasonPanelField.setAccessible(true);
        Object reasonPanel = reasonPanelField.get(cancellationService);
        assertNotNull("Named cancellation reason panel must be present.", reasonPanel);
        assertEquals("Reason selector must remain a child of the form panel.", panel, ((android.view.View) reasonPanel).getParent());
        assertEquals("Reason buttons must belong to the named selector.", reasonPanel, passenger.getParent());
        assertEquals("Reason buttons must belong to the named selector.", reasonPanel, driver.getParent());
        Method restoreCancelDraft = KfeOverlayService.class.getDeclaredMethod("applyCancelDraft", JSONObject.class);
        restoreCancelDraft.setAccessible(true);
        restoreCancelDraft.invoke(cancellationService, new JSONObject().put("cancelReason", "DRIVER").put("cancelFare", ""));
        assertTrue("Restored driver reason must be highlighted.", driver.getAlpha() > passenger.getAlpha());
        passenger.performClick();
        assertEquals("Passenger cancellation choice must reach native form state.", "PASSENGER", fieldValue(cancellationService, "cancelReason"));
        ((EditText) fieldValue(cancellationService, "formInput")).setText("20");
        android.widget.Button confirm = findButton(panel, "Confirm cancellation");
        assertNotNull("Driver-facing cancellation confirmation must be visible", confirm);
        confirm.performClick();
      } catch (Exception e) { throw new AssertionError(e); }
    });
    JSONObject cancelledRecord = store.getRecord("TRIP", cancelTripId);
    assertTrue("Visible cancellation form must commit a canonical trip without PWA replay", cancelledRecord.optBoolean("found", false));
    assertEquals("CANCELLED", cancelledRecord.getJSONObject("record").getString("status"));
    assertEquals("PASSENGER", cancelledRecord.getJSONObject("record").getString("cancelReason"));
    assertEquals(20d, cancelledRecord.getJSONObject("record").getDouble("cancelledRevenue"), 0.001d);
    JSONObject shiftRecord = store.getRecord("SHIFT", shiftId);
    assertEquals("Native shift revenue must include the fare and cancellation fee exactly once.", 270d,
      shiftRecord.getJSONObject("record").getDouble("revenue"), 0.001d);
    assertEquals("GO_TO_PICKUP", fieldValue(service, "actionStage"));

    // Retry both exact native form operations after their visible Save/Confirm clicks.
    org.json.JSONArray pending = KfeNativeEventStore.get(context).pending(500);
    String fareEventId = "";
    String cancelEventId = "";
    for (int i = 0; i < pending.length(); i++) {
      JSONObject event = pending.optJSONObject(i);
      if (event == null) continue;
      String tripId = event.optString("tripId", "");
      String stage = event.optString("stage", "");
      if (fareTripId.equals(tripId) && "ENTER_FARE".equals(stage)) fareEventId = event.optString("eventId", "");
      if (cancelTripId.equals(tripId) && "CANCEL_RIDE".equals(stage)) cancelEventId = event.optString("eventId", "");
    }
    assertTrue("Visible fare form must leave a durable retry identity.", !fareEventId.isEmpty());
    assertTrue("Visible cancellation form must leave a durable retry identity.", !cancelEventId.isEmpty());
    java.lang.reflect.Method persistForm = KfeOverlayService.class.getDeclaredMethod(
        "persistCanonicalTripForm", String.class, String.class, JSONObject.class, String.class);
    persistForm.setAccessible(true);
    persistForm.invoke(service, "FARE", fareTripId,
        new JSONObject().put("fare", "250").put("toll", "0").put("parking", "0")
            .put("tollTreatment", "INCLUDED").put("parkingTreatment", "INCLUDED"), fareEventId);
    persistForm.invoke(service, "CANCEL", cancelTripId,
        new JSONObject().put("revenue", "20").put("reason", "PASSENGER"), cancelEventId);

    store.close();
    Field singleton = KfeCanonicalWorkStore.class.getDeclaredField("instance");
    singleton.setAccessible(true);
    singleton.set(null, null);
    store = KfeCanonicalWorkStore.get(context);
    JSONObject reopenedShift = store.getRecord("SHIFT", shiftId).getJSONObject("record");
    assertEquals("Shift revenue must remain exactly once after native store reopen.", 270d,
        reopenedShift.getDouble("revenue"), 0.001d);
    assertEquals("Exactly two unique trip records must survive store reopen.", 2,
        countTripsForShift(store.listRecords("TRIP", 1000).getJSONArray("records"), shiftId));
    assertEquals("Fare remains durable after reopen.", 250d,
        store.getRecord("TRIP", fareTripId).getJSONObject("record").getDouble("revenue"), 0.001d);
    assertEquals("Cancellation fee remains durable after reopen.", 20d,
        store.getRecord("TRIP", cancelTripId).getJSONObject("record").getDouble("cancelledRevenue"), 0.001d);
  }

  private int countTripsForShift(org.json.JSONArray records, String shiftId) {
    int count = 0;
    for (int i = 0; i < records.length(); i++) {
      JSONObject record = records.optJSONObject(i);
      if (record != null && shiftId.equals(record.optString("shiftId", ""))) count++;
    }
    return count;
  }

  private android.widget.Button findButton(android.view.ViewGroup parent, String label) {
    for (int i = 0; i < parent.getChildCount(); i++) {
      android.view.View child = parent.getChildAt(i);
      if (child instanceof android.widget.Button && label.contentEquals(((android.widget.Button) child).getText())) {
        return (android.widget.Button) child;
      }
      if (child instanceof android.view.ViewGroup) {
        android.widget.Button found = findButton((android.view.ViewGroup) child, label);
        if (found != null) return found;
      }
    }
    return null;
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

  @Test public void minimizedOverlayBubbleCanBeDraggedDockedAndRestoredWithoutLosingTripState() throws Exception {
    if (android.os.Build.VERSION.SDK_INT >= 23) {
      assertTrue("SYSTEM_ALERT_WINDOW must be granted by CI", Settings.canDrawOverlays(context));
    }
    String tripId = "bubble-trip-" + System.currentTimeMillis();
    JSONObject state = new JSONObject()
      .put("shift", new JSONObject().put("id", "bubble-shift"))
      .put("trip", new JSONObject().put("id", tripId).put("status", "ACTIVE"))
      .put("overlayAction", "START_RIDE")
      .put("overlayTripId", tripId)
      .put("tripStartAt", System.currentTimeMillis() - 5000L);
    context.startService(new Intent(context, KfeOverlayService.class)
      .setAction(KfeOverlayService.ACTION_UPDATE)
      .putExtra(KfeOverlayService.EXTRA_STATE, state.toString()));

    KfeOverlayService service = waitForService();
    long deadline = SystemClock.uptimeMillis() + 5000L;
    while (SystemClock.uptimeMillis() < deadline && fieldValue(service, "overlay") == null) {
      SystemClock.sleep(50L);
    }
    android.view.View overlay = (android.view.View) fieldValue(service, "overlay");
    assertNotNull("The real overlay view must exist before minimizing", overlay);

    context.startService(new Intent(context, KfeOverlayService.class).setAction(KfeOverlayService.ACTION_MINIMIZE));
    deadline = SystemClock.uptimeMillis() + 3000L;
    while (SystemClock.uptimeMillis() < deadline && !((Boolean) fieldValue(service, "minimized"))) {
      SystemClock.sleep(25L);
    }
    assertTrue("Minimize action must retain the visible overlay as a bubble", (Boolean) fieldValue(service, "minimized"));

    float density = context.getResources().getDisplayMetrics().density;
    int bubblePx = Math.round(58f * density);
    int screenWidth = context.getResources().getDisplayMetrics().widthPixels;
    android.view.WindowManager windowManager = (android.view.WindowManager) fieldValue(service, "windowManager");
    android.view.WindowManager.LayoutParams params = (android.view.WindowManager.LayoutParams) fieldValue(service, "params");
    android.view.View root = (android.view.View) fieldValue(service, "overlayRoot");
    assertNotNull("Bubble must keep its WindowManager root attached", root);
    // ACTION_MINIMIZE is delivered through the service main thread. Wait for
    // the WindowManager attachment state to settle instead of racing that UI
    // transition from the instrumentation thread; still fail if it never attaches.
    long attachedDeadline = SystemClock.uptimeMillis() + 1500L;
    while (SystemClock.uptimeMillis() < attachedDeadline) {
      final boolean[] attached = {false};
      InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
        attached[0] = root.isAttachedToWindow());
      if (attached[0]) break;
      SystemClock.sleep(25L);
    }
    final boolean[] rootAttached = {false};
    InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
      rootAttached[0] = root.isAttachedToWindow());
    assertTrue("Bubble root must remain attached to the Android window", rootAttached[0]);
    assertEquals("Bubble width must use the compact bubble size", bubblePx, params.width);
    assertEquals("Bubble height must use the compact bubble size", bubblePx, params.height);

    InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
      try {
        params.x = Math.min(screenWidth - bubblePx - 1, screenWidth / 2 + Math.round(20f * density));
        params.y = Math.round(160f * density);
        windowManager.updateViewLayout(root, params);
        context.getSharedPreferences("kfe_overlay", Context.MODE_PRIVATE).edit()
          .putInt("x", params.x).putInt("y", params.y).apply();
      } catch (Exception e) { throw new AssertionError(e); }
    });
    int initialX = params.x;
    int initialY = params.y;
    float localX = bubblePx / 2f;
    float localY = bubblePx / 2f;
    float startRawX = initialX + localX;
    float startRawY = initialY + localY;
    float endRawX = screenWidth - 2f;
    float endRawY = startRawY + Math.round(20f * density);
    long downTime = SystemClock.uptimeMillis();
    InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
      android.view.MotionEvent down = android.view.MotionEvent.obtain(downTime, downTime,
        android.view.MotionEvent.ACTION_DOWN, startRawX, startRawY, 0);
      down.offsetLocation(-initialX, -initialY);
      overlay.onTouchEvent(down);
      down.recycle();
      android.view.MotionEvent move = android.view.MotionEvent.obtain(downTime, downTime + 80,
        android.view.MotionEvent.ACTION_MOVE, endRawX, endRawY, 0);
      move.offsetLocation(-initialX, -initialY);
      overlay.onTouchEvent(move);
      move.recycle();
      android.view.MotionEvent up = android.view.MotionEvent.obtain(downTime, downTime + 120,
        android.view.MotionEvent.ACTION_UP, endRawX, endRawY, 0);
      up.offsetLocation(-initialX, -initialY);
      overlay.onTouchEvent(up);
      up.recycle();
    });
    assertEquals("Dragged bubble must dock to the right edge", Math.max(0, screenWidth - bubblePx), params.x);
    assertTrue("Dragging must not expand or discard the active workflow", (Boolean) fieldValue(service, "minimized"));
    assertEquals("Active trip identity must survive bubble dragging", tripId, fieldValue(service, "pendingTripId"));

    int dockedX = params.x;
    int dockedY = params.y;
    float tapRawX = dockedX + localX;
    float tapRawY = dockedY + localY;
    long tapTime = SystemClock.uptimeMillis();
    InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
      android.view.MotionEvent down = android.view.MotionEvent.obtain(tapTime, tapTime,
        android.view.MotionEvent.ACTION_DOWN, tapRawX, tapRawY, 0);
      down.offsetLocation(-dockedX, -dockedY);
      overlay.onTouchEvent(down);
      down.recycle();
      android.view.MotionEvent up = android.view.MotionEvent.obtain(tapTime, tapTime + 60,
        android.view.MotionEvent.ACTION_UP, tapRawX, tapRawY, 0);
      up.offsetLocation(-dockedX, -dockedY);
      overlay.onTouchEvent(up);
      up.recycle();
    });
    assertTrue("Tapping the bubble must restore the expanded overlay", !(Boolean) fieldValue(service, "minimized"));
    assertEquals("Expanded overlay must return to full width", android.view.WindowManager.LayoutParams.MATCH_PARENT, params.width);
    assertEquals("Expanded overlay must restore its normal height", Math.round(158f * density), params.height);
    assertTrue("Restored overlay must remain attached", root.isAttachedToWindow());
    assertEquals("Restoring must preserve the same active trip", tripId, fieldValue(service, "pendingTripId"));
    assertEquals("Restoring must preserve the current action stage", "START_RIDE", fieldValue(service, "actionStage"));
    assertTrue("Bubble state must be durably cleared after restore",
      !context.getSharedPreferences("kfe_overlay", Context.MODE_PRIVATE).getBoolean("minimized", true));
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
