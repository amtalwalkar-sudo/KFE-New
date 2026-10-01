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
    context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    context.getSharedPreferences("kfe_overlay", Context.MODE_PRIVATE).edit().clear().apply();
    context.startService(new Intent(context, KfeOverlayService.class));
  }

  @After public void tearDown() {
    context.stopService(new Intent(context, KfeOverlayService.class));
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
