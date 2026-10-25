package com.kanishka.pwa;

import android.app.NotificationManager;
import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "KfeNativeWorkActions")
public class KfeNativeWorkActionsPlugin extends Plugin {
  static volatile KfeNativeWorkActionsPlugin instance;
  private static final String PREFS = "kfe_native_work_actions";
  private static final String LEGACY_PREFS = "kfe_ride_notification_events";
  private static final String PENDING_KEY = "pending";
  private static final int LEGACY_RIDE_NOTIFICATION_ID = 4101;

  @Override
  public void load() {
    instance = this;
    // Move any compatibility handoff from the former notification-owned
    // bridge before retiring its SharedPreferences namespace.
    android.content.SharedPreferences legacy = getContext().getSharedPreferences(LEGACY_PREFS, 0);
    android.content.SharedPreferences current = getContext().getSharedPreferences(PREFS, 0);
    String legacyPending = legacy.getString(PENDING_KEY, "");
    if (!legacyPending.isEmpty() && current.getString(PENDING_KEY, "").isEmpty()) {
      current.edit().putString(PENDING_KEY, legacyPending)
        .putString("pendingEventId", legacy.getString("pendingEventId", "")).apply();
    }
    legacy.edit().remove(PENDING_KEY).remove("pendingEventId").apply();

    // Remove the old ride notification and channel from existing installations.
    NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager != null) {
      manager.cancel(LEGACY_RIDE_NOTIFICATION_ID);
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        manager.deleteNotificationChannel("kfe_ride_actions");
      }
    }
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

  static boolean isResetBarrierActive(Context context) {
    return !context.getSharedPreferences(PREFS, 0).getString("resetBarrierId", "").isEmpty();
  }

  static void beginResetBarrier(Context context, String resetId) {
    if (!context.getSharedPreferences(PREFS, 0).edit().putString("resetBarrierId", resetId).commit()) {
      throw new IllegalStateException("Native reset event barrier could not be durably recorded.");
    }
  }

  static void releaseResetBarrier(Context context, String resetId) {
    android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, 0);
    if (resetId.equals(prefs.getString("resetBarrierId", ""))) {
      if (!prefs.edit().remove("resetBarrierId").commit()) {
        throw new IllegalStateException("Native reset event barrier could not be durably released.");
      }
    }
  }

  static void cancelPendingForReset(Context context, String resetId) {
    KfeNativeEventStore.get(context).cancelPendingForReset(resetId);
    context.getSharedPreferences(PREFS, 0).edit().remove(PENDING_KEY).remove("pendingEventId").commit();
    context.getSharedPreferences(LEGACY_PREFS, 0).edit().remove(PENDING_KEY).remove("pendingEventId").commit();
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
    android.content.SharedPreferences prefs = getContext().getSharedPreferences(PREFS, 0);
    String pending = prefs.getString(PENDING_KEY, "");
    String eventId = prefs.getString("pendingEventId", "");
    if (isResetBarrierActive(getContext()) || (!eventId.isEmpty() && !KfeNativeEventStore.get(getContext()).isPending(eventId))) {
      prefs.edit().remove(PENDING_KEY).remove("pendingEventId").apply();
      pending = "";
    }
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
    try {
      JSObject result = new JSObject();
      result.put("events", KfeNativeEventStore.get(getContext()).pending(100));
      call.resolve(result);
    } catch (RuntimeException error) {
      // Do not resolve an empty queue when SQLite failed: PWA recovery must
      // remain visibly unsuccessful so the durable events can be retried.
      call.reject("Unable to read pending native lifecycle events; recovery is incomplete.", error);
    }
  }

  @com.getcapacitor.PluginMethod
  public void acknowledgeAction(PluginCall call) {
    String eventId = call.getString("eventId", "");
    KfeNativeEventStore store = KfeNativeEventStore.get(getContext());
    boolean acknowledged = store.acknowledge(eventId);
    // A repeated acknowledgement is a valid recovery path: the DB commit may
    // have survived a process interruption while the overlay's in-memory stage
    // transition did not. Notify the service for both newly and already acked IDs.
    boolean alreadyAcknowledged = store.isAcknowledged(eventId);
    boolean accepted = acknowledged || alreadyAcknowledged;
    String stage = call.getString("stage", "");
    String tripId = call.getString("tripId", "");
    if (accepted) KfeOverlayService.acknowledgeFromPwa(getContext(), eventId, stage, tripId);
    String legacyId = getContext().getSharedPreferences(PREFS, 0).getString("pendingEventId", "");
    if (accepted && eventId.equals(legacyId)) {
      getContext().getSharedPreferences(PREFS, 0).edit().remove(PENDING_KEY).remove("pendingEventId").apply();
    }
    JSObject result = new JSObject();
    result.put("acknowledged", accepted);
    call.resolve(result);
  }

  @com.getcapacitor.PluginMethod
  public void recordActionFailure(PluginCall call) {
    KfeNativeEventStore.get(getContext()).recordFailure(
      call.getString("eventId", ""), call.getString("error", "Processing failed"));
    call.resolve();
  }
}
