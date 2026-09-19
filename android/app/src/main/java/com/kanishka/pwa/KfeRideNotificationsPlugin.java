package com.kanishka.pwa;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.NotificationCompat;
import androidx.core.app.RemoteInput;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "KfeRideNotifications")
public class KfeRideNotificationsPlugin extends Plugin {
  static KfeRideNotificationsPlugin instance;
  static final String CHANNEL_ID = "kfe_ride_actions";
  static final int NOTIFICATION_ID = 4101;

  @Override
  public void load() {
    instance = this;
    createChannel();
  }

  @Override
  protected void handleOnDestroy() {
    if (instance == this) instance = null;
    super.handleOnDestroy();
  }

  @com.getcapacitor.PluginMethod
  public void requestPermission(PluginCall call) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getContext().checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
      getActivity().requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 4102);
    }
    call.resolve();
  }

  @com.getcapacitor.PluginMethod
  public void show(PluginCall call) {
    showNotification(call.getString("stage", "GO_TO_PICKUP"), call.getString("tripId", ""));
    call.resolve();
  }

  @com.getcapacitor.PluginMethod
  public void schedule(PluginCall call) {
    String stage = call.getString("stage", "START_RIDE");
    String tripId = call.getString("tripId", "");
    long delayMs = Math.max(1000L, call.getLong("delayMs", 1000L));
    long triggerAt = System.currentTimeMillis() + delayMs;

    Intent intent = new Intent(getContext(), KfeRideNotificationReceiver.class);
    intent.setAction(KfeRideNotificationReceiver.ACTION_ALARM);
    intent.putExtra("stage", stage);
    intent.putExtra("tripId", tripId);
    PendingIntent pending = PendingIntent.getBroadcast(
      getContext(), requestCode(stage, tripId), intent,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );
    AlarmManager alarm = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
    if (alarm != null) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && alarm.canScheduleExactAlarms()) {
        alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending);
      } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending);
      } else {
        alarm.set(AlarmManager.RTC_WAKEUP, triggerAt, pending);
      }
    }
    call.resolve();
  }

  @com.getcapacitor.PluginMethod
  public void cancel(PluginCall call) {
    cancelNotification();
    call.resolve();
  }

  @com.getcapacitor.PluginMethod
  public void clearScheduled(PluginCall call) {
    String stage = call.getString("stage", "");
    String tripId = call.getString("tripId", "");
    if (!stage.isEmpty()) {
      Intent intent = new Intent(getContext(), KfeRideNotificationReceiver.class);
      intent.setAction(KfeRideNotificationReceiver.ACTION_ALARM);
      PendingIntent pending = PendingIntent.getBroadcast(
        getContext(), requestCode(stage, tripId), intent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
      );
      AlarmManager alarm = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
      if (alarm != null) alarm.cancel(pending);
      pending.cancel();
    }
    call.resolve();
  }

  static void showNotification(String stage, String tripId) {
    if (instance == null) return;
    Context context = instance.getContext();
    NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager == null) return;

    String title;
    String body;
    String actionLabel;
    boolean directInput = false;
    String inputLabel = null;

    switch (stage) {
      case "ENTER_PICKUP_DURATION":
        title = "Pickup duration";
        body = "Enter expected time to reach pickup.";
        actionLabel = "ENTER MINUTES";
        directInput = true;
        inputLabel = "Minutes to pickup";
        break;
      case "START_RIDE":
        title = "Pickup reached";
        body = "Ready to start the passenger ride.";
        actionLabel = "START RIDE";
        break;
      case "ENTER_RIDE_DURATION":
        title = "Ride duration";
        body = "Enter expected passenger ride duration.";
        actionLabel = "ENTER MINUTES";
        directInput = true;
        inputLabel = "Ride minutes";
        break;
      case "END_RIDE":
        title = "Ride duration reached";
        body = "Enter fare and end the ride.";
        actionLabel = "END RIDE + FARE";
        directInput = true;
        inputLabel = "Fare";
        break;
      default:
        title = "KFE";
        body = "Ready for the next pickup.";
        actionLabel = "GO TO PICKUP";
        break;
    }

    Intent actionIntent = new Intent(context, KfeRideNotificationReceiver.class);
    actionIntent.setAction(KfeRideNotificationReceiver.ACTION_ACTION);
    actionIntent.putExtra("stage", stage);
    actionIntent.putExtra("tripId", tripId);
    PendingIntent actionPending = PendingIntent.getBroadcast(
      context, requestCode(stage, tripId),
      actionIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE
    );

    NotificationCompat.Action.Builder action = new NotificationCompat.Action.Builder(0, actionLabel, actionPending);
    if (directInput) {
      RemoteInput remoteInput = new RemoteInput.Builder(KfeRideNotificationReceiver.REMOTE_INPUT_KEY)
        .setLabel(inputLabel)
        .build();
      action.addRemoteInput(remoteInput);
    }

    Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle(title)
      .setContentText(body)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setOngoing(true)
      .setAutoCancel(false)
      .setOnlyAlertOnce(true)
      .addAction(action.build())
      .build();

    manager.notify(NOTIFICATION_ID, notification);
  }

  static void cancelNotification() {
    if (instance == null) return;
    NotificationManager manager = (NotificationManager) instance.getContext().getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager != null) manager.cancel(NOTIFICATION_ID);
  }

  static void emitAction(String stage, String tripId, String input) {
    if (instance == null) return;
    JSObject data = new JSObject();
    data.put("stage", stage);
    data.put("tripId", tripId);
    if (input != null) data.put("input", input);
    instance.notifyListeners("rideNotificationAction", data);
  }

  private void createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager == null) return;
    NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "KFE Ride Actions", NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription("Persistent KFE driver ride actions");
    manager.createNotificationChannel(channel);
  }

  private static int requestCode(String stage, String tripId) {
    return Math.abs((stage + ":" + tripId).hashCode()) + 100;
  }
}
