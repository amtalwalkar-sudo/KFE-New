package com.kanishka.pwa;

import android.app.NotificationManager;
import android.content.Context;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "KfeNativeWorkActions")
public class KfeNativeWorkActionsPlugin extends Plugin {
  static volatile KfeNativeWorkActionsPlugin instance;
  private static final String PREFS = "kfe_ride_notification_events";
  private static final String PENDING_KEY = "pending";
  private static final int LEGACY_RIDE_NOTIFICATION_ID = 4101;

  @Override
  public void load() {
    instance = this;
    // Remove the legacy ride notification from installations upgrading from
    // versions that exposed ride management in Android notifications.
    NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager != null) manager.cancel(LEGACY_RIDE_NOTIFICATION_ID);
  }

  @Override
  protected void handleOnDestroy() {
    if (instance == this) instance = null;
    super.handleOnDestroy();
  }

  static void emitAction(String stage, String tripId, String input, String eventId) {
    KfeNativeWorkActionsPlugin plugin = instance;
    if (plugin == null) return;
    JSObject data = new JSObject();
    data.put("stage", stage);
    data.put("tripId", tripId == null ? "" : tripId);
    if (input != null) data.put("input", input);
    if (eventId != null && !eventId.isEmpty()) data.put("eventId", eventId);
    plugin.notifyListeners("nativeWorkAction", data);
  }

  static String recordPendingAction(Context context, String stage, String tripId, String input) {
    // The SQLite event log is the durable bridge between overlay controls and
    // Work. It is intentionally independent of Android notifications.
    String eventId = KfeNativeEventStore.get(context).append(stage, tripId, input);
    String packed = stage + "|" + (tripId == null ? "" : tripId) + "|" + (input == null ? "" : input);
    context.getSharedPreferences(PREFS, 0).edit()
      .putString(PENDING_KEY, packed).putString("pendingEventId", eventId).apply();
    return eventId;
  }

  @com.getcapacitor.PluginMethod
  public void getPendingAction(PluginCall call) {
    String pending = getContext().getSharedPreferences(PREFS, 0).getString(PENDING_KEY, "");
    JSObject result = new JSObject();
    result.put("pending", pending);
    call.resolve(result);
  }

  @com.getcapacitor.PluginMethod
  public void clearPendingAction(PluginCall call) {
    getContext().getSharedPreferences(PREFS, 0).edit().remove(PENDING_KEY).remove("pendingEventId").apply();
    call.resolve();
  }

  @com.getcapacitor.PluginMethod
  public void getPendingActions(PluginCall call) {
    JSObject result = new JSObject();
    result.put("events", KfeNativeEventStore.get(getContext()).pending(100));
    call.resolve(result);
  }

  @com.getcapacitor.PluginMethod
  public void acknowledgeAction(PluginCall call) {
    String eventId = call.getString("eventId", "");
    boolean acknowledged = KfeNativeEventStore.get(getContext()).acknowledge(eventId);
    String stage = call.getString("stage", "");
    String tripId = call.getString("tripId", "");
    if (acknowledged) KfeOverlayService.acknowledgeFromPwa(getContext(), eventId, stage, tripId);
    String legacyId = getContext().getSharedPreferences(PREFS, 0).getString("pendingEventId", "");
    if (acknowledged && eventId.equals(legacyId)) {
      getContext().getSharedPreferences(PREFS, 0).edit().remove(PENDING_KEY).remove("pendingEventId").apply();
    }
    JSObject result = new JSObject();
    result.put("acknowledged", acknowledged);
    call.resolve(result);
  }

  @com.getcapacitor.PluginMethod
  public void recordActionFailure(PluginCall call) {
    KfeNativeEventStore.get(getContext()).recordFailure(
      call.getString("eventId", ""), call.getString("error", "Processing failed"));
    call.resolve();
  }
}
