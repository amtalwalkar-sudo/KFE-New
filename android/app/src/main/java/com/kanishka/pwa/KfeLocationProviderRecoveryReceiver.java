package com.kanishka.pwa;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.location.LocationManager;
import android.os.Build;
import android.util.Log;

/**
 * Retries persisted GPS recovery after the system enables location providers.
 * Kept non-exported separately from the protected boot/package lifecycle receiver.
 */
public final class KfeLocationProviderRecoveryReceiver extends BroadcastReceiver {
  private static final String TAG = "KfeLocationProviderRecovery";

  @Override public void onReceive(Context context, Intent intent) {
    String action = intent == null ? "" : intent.getAction();
    if (!LocationManager.PROVIDERS_CHANGED_ACTION.equals(action)
        && !LocationManager.MODE_CHANGED_ACTION.equals(action)) return;
    if (!isLocationEnabled(context)) return;

    Log.i(TAG, "Location provider enabled; retrying persisted GPS recovery.");
    try {
      KfeNativeGpsService.resumePersisted(context);
    } catch (RuntimeException error) {
      Log.e(TAG, "Unable to retry persisted GPS recovery after provider change.", error);
    }
  }

  private static boolean isLocationEnabled(Context context) {
    LocationManager manager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
    if (manager == null) return false;
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) return manager.isLocationEnabled();
      return manager.isProviderEnabled(LocationManager.GPS_PROVIDER)
          || manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
    } catch (RuntimeException error) {
      Log.w(TAG, "Unable to inspect location provider state during recovery.", error);
      return false;
    }
  }
}
