package com.kanishka.pwa;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
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
public class KfeOverlayGoldenRideTest {
  private Context context;
  private KfeOverlayService service;

  @Before public void setUp() throws Exception {
    context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    context.getSharedPreferences("kfe_overlay", Context.MODE_PRIVATE).edit().clear().apply();
    context.getSharedPreferences("kfe_ride_notification_events", Context.MODE_PRIVATE).edit().clear().apply();
    Intent start = new Intent(context, KfeOverlayService.class);
    context.startService(start);
    waitFor(() -> KfeOverlayService.instance != null, 3000);
    service = KfeOverlayService.instance;
    assertNotNull("Overlay foreground service must start", service);
  }

  @After public void tearDown() {
    context.stopService(new Intent(context, KfeOverlayService.class));
  }

  @Test public void goldenRideGate_nativeOverlay() throws Exception {
    if (android.os.Build.VERSION.SDK_INT >= 23) {
      assertTrue("SYSTEM_ALERT_WINDOW must be granted by CI", Settings.canDrawOverlays(context));
    }

    showState("END_RIDE", "golden-trip", "₹500");
    waitFor(() -> getOverlay() != null, 2000);
    View overlay = getOverlay();
    assertNotNull("Overlay must be visible", overlay);

    // END -> fare: same canonical trip id is carried in the native fallback.
    swipeHorizontally(overlay, 20, 300);
    waitFor(() -> "FARE".equals(getField("formMode")), 1000);
    assertTrue(pending().startsWith("END_RIDE|golden-trip|"));
    assertFalse("Fare UI must not contain EditText/system keyboard input", containsEditText(getField("formPanel")));

    // Enter 250 through the native keypad and press OK.
    clickButton("2"); clickButton("5"); clickButton("0"); clickButton("OK");
    assertTrue("ENTER_FARE must carry the same trip id", pending().startsWith("ENTER_FARE|golden-trip|250"));

    // Main-app cancellation parity: the same overlay can render CANCELLED + ₹0.
    closeForm();
    showState("CANCELLED", "", "₹0");
    assertEquals("CANCELLED", getField("actionStage"));
    assertEquals("₹0", getField("cancellationRevenue"));

    // Cancellation from overlay: ❌ opens numeric fee entry; default OK records ₹0.
    showState("END_RIDE", "golden-trip", "₹500");
    tapRightEdge(overlay);
    waitFor(() -> "CANCEL".equals(getField("formMode")), 1000);
    clickButton("OK");
    assertTrue("CANCEL_RIDE must carry the same canonical trip id and ₹0", pending().startsWith("CANCEL_RIDE|golden-trip|"));
    assertTrue("CANCEL_RIDE fallback must include ₹0", pending().contains("\"revenue\":0"));
    assertFalse("Cancellation keypad must remain non-focusable", isFocusable());

    // Bubble: vertical drag minimizes, persists both axes, then tap restores.
    closeForm();
    showState("GO_TO_PICKUP", "", "₹500");
    overlay = getOverlay();
    swipeVerticallyToMinimize(overlay);
    assertTrue("Overlay must minimize to a visible bubble", (Boolean) getField("minimized"));
    assertTrue(context.getSharedPreferences("kfe_overlay", 0).contains("x"));
    assertTrue(context.getSharedPreferences("kfe_overlay", 0).contains("y"));
    tapBubble();
    assertFalse("Bubble tap must restore the full overlay", (Boolean) getField("minimized"));

    // Restored overlay still accepts the next state.
    showState("START_RIDE", "", "₹500");
    assertEquals("START_RIDE", getField("actionStage"));
  }

  private void showState(String action, String tripId, String cancellationRevenue) throws Exception {
    JSONObject root = new JSONObject();
    root.put("shift", new JSONObject().put("id", "golden-shift"));
    if (!"CANCELLED".equals(action)) root.put("trip", new JSONObject().put("id", tripId));
    else root.put("trip", JSONObject.NULL);
    root.put("target", "₹500");
    root.put("targetProgress", 50);
    root.put("rides", "1");
    root.put("liveKm", "12.4 km");
    root.put("revenue", "₹250");
    root.put("overlayAction", action);
    root.put("overlayTripId", tripId);
    root.put("cancellationRevenue", cancellationRevenue);
    Intent update = new Intent(context, KfeOverlayService.class)
      .setAction(KfeOverlayService.ACTION_UPDATE)
      .putExtra(KfeOverlayService.EXTRA_STATE, root.toString());
    context.startService(update);
    SystemClock.sleep(120);
  }

  private View getOverlay() throws Exception {
    return (View) getField("overlay");
  }

  private String pending() {
    return context.getSharedPreferences("kfe_ride_notification_events", 0).getString("pending", "");
  }

  private void swipeHorizontally(View v, float x1, float x2) {
    float y = Math.max(20, v.getHeight() * .65f);
    dispatch(v, x1, y, MotionEvent.ACTION_DOWN);
    dispatch(v, x1, y, x2, y, MotionEvent.ACTION_MOVE);
    dispatch(v, x1, y, x2, y, MotionEvent.ACTION_UP);
  }

  private void swipeVerticallyToMinimize(View v) {
    float x = Math.max(80, v.getWidth() * .45f);
    dispatch(v, x, 100, x, 100, MotionEvent.ACTION_DOWN);
    dispatch(v, x, 100, x, 0, MotionEvent.ACTION_MOVE);
    dispatch(v, x, 100, x, 0, MotionEvent.ACTION_UP);
    SystemClock.sleep(120);
  }

  private void tapBubble() {
    View v = getOverlayUnchecked();
    dispatch(v, 20, 20, 20, 20, MotionEvent.ACTION_DOWN);
    dispatch(v, 20, 20, 20, 20, MotionEvent.ACTION_UP);
    SystemClock.sleep(120);
  }

  private void tapRightEdge(View v) {
    float x = Math.max(1, v.getWidth() - 20);
    float y = Math.min(v.getHeight() - 1, 8 + 77);
    dispatch(v, x, y, x, y, MotionEvent.ACTION_DOWN);
    dispatch(v, x, y, x, y, MotionEvent.ACTION_UP);
  }

  private void clickButton(String label) throws Exception {
    LinearSearch:
    {
      ViewGroup panel = (ViewGroup) getField("formPanel");
      Button found = findButton(panel, label);
      assertNotNull("Keypad button "+label+" must exist", found);
      InstrumentationRegistry.getInstrumentation().runOnMainSync(found::performClick);
    }
  }

  private Button findButton(ViewGroup root, String label) {
    for (int i=0;i<root.getChildCount();i++) {
      View child=root.getChildAt(i);
      if (child instanceof Button && label.contentEquals(((Button)child).getText())) return (Button)child;
      if (child instanceof ViewGroup) {
        Button found=findButton((ViewGroup)child,label);
        if(found!=null)return found;
      }
    }
    return null;
  }

  private boolean containsEditText(Object value) {
    if (!(value instanceof View)) return false;
    return containsEditText((View)value);
  }

  private boolean containsEditText(View view) {
    if (view instanceof EditText) return true;
    if (view instanceof ViewGroup) {
      ViewGroup group=(ViewGroup)view;
      for(int i=0;i<group.getChildCount();i++) if(containsEditText(group.getChildAt(i))) return true;
    }
    return false;
  }

  private boolean isFocusable() throws Exception {
    WindowManager.LayoutParams p=(WindowManager.LayoutParams)getField("params");
    return (p.flags & WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE)==0;
  }

  private void closeForm() throws Exception {
    Method m=KfeOverlayService.class.getDeclaredMethod("closeForm");
    m.setAccessible(true);
    m.invoke(service);
  }

  private Object getField(String name) throws Exception {
    Field f=KfeOverlayService.class.getDeclaredField(name);
    f.setAccessible(true);
    return f.get(service);
  }

  private View getOverlayUnchecked() {
    try { return getOverlay(); } catch(Exception e) { throw new AssertionError(e); }
  }

  private void dispatch(View v, float x1, float y1, float actionX, float actionY, int action) {
    long now=SystemClock.uptimeMillis();
    MotionEvent e=MotionEvent.obtain(now,now,action,actionX,actionY,0);
    InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> v.dispatchTouchEvent(e));
    e.recycle();
  }

  private void waitFor(Check check, long timeoutMs) throws Exception {
    long deadline=SystemClock.uptimeMillis()+timeoutMs;
    while(SystemClock.uptimeMillis()<deadline){
      if(check.ok())return;
      SystemClock.sleep(40);
    }
    fail("Timed out waiting for Android overlay condition");
  }

  interface Check { boolean ok() throws Exception; }
}
