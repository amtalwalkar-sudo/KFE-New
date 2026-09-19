package com.kanishka.pwa;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;

import androidx.core.app.RemoteInput;

public class KfeRideNotificationReceiver extends BroadcastReceiver {
  public static final String ACTION_ALARM = "com.kanishka.pwa.KFE_RIDE_ALARM";
  public static final String ACTION_ACTION = "com.kanishka.pwa.KFE_RIDE_ACTION";
  public static final String REMOTE_INPUT_KEY = "kfe_ride_input";
  private static final String PREFS = "kfe_ride_notification_events";

  @Override
  public void onReceive(Context context, Intent intent) {
    String stage = intent.getStringExtra("stage");
    String tripId = intent.getStringExtra("tripId");
    if (stage == null) return;

    if (ACTION_ALARM.equals(intent.getAction())) {
      KfeRideNotificationsPlugin.showNotification(stage, tripId == null ? "" : tripId);
      return;
    }

    if (ACTION_ACTION.equals(intent.getAction())) {
      String input = null;
      Bundle results = RemoteInput.getResultsFromIntent(intent);
      if (results != null) input = results.getString(REMOTE_INPUT_KEY);
      KfeRideNotificationsPlugin.cancelNotification();
      SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
      prefs.edit().putString("pending", stage + "|" + (tripId == null ? "" : tripId) + "|" + (input == null ? "" : input)).apply();
      KfeRideNotificationsPlugin.emitAction(stage, tripId == null ? "" : tripId, input);
    }
  }
}
