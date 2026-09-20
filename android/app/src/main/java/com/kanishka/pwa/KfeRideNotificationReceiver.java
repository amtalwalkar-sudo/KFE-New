package com.kanishka.pwa;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

import androidx.core.app.RemoteInput;

public class KfeRideNotificationReceiver extends BroadcastReceiver {
  public static final String ACTION_ALARM = "com.kanishka.pwa.KFE_RIDE_ALARM";
  public static final String ACTION_ACTION = "com.kanishka.pwa.KFE_RIDE_ACTION";
  public static final String REMOTE_INPUT_KEY = "kfe_ride_input";

  @Override
  public void onReceive(Context context, Intent intent) {
    String stage = intent.getStringExtra("stage");
    String tripId = intent.getStringExtra("tripId");
    if (stage == null) return;

    if (ACTION_ALARM.equals(intent.getAction())) {
      KfeRideNotificationsPlugin.showNotification(context, stage, tripId == null ? "" : tripId);
      return;
    }

    if (ACTION_ACTION.equals(intent.getAction())) {
      String input = null;
      Bundle results = RemoteInput.getResultsFromIntent(intent);
      if (results != null) input = results.getString(REMOTE_INPUT_KEY);
      KfeRideNotificationsPlugin.cancelNotification(context);
      KfeRideNotificationsPlugin.recordPendingAction(context, stage, tripId, input);
      KfeRideNotificationsPlugin.emitAction(stage, tripId == null ? "" : tripId, input);
    }
  }
}
