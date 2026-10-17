package com.kanishka.pwa;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Restores only persisted, in-progress native surfaces after device reboot or
 * package replacement. No new workflow is created here.
 */
public class KfeLifecycleRecoveryReceiver extends BroadcastReceiver {
  private static final String TAG = "KfeLifecycleRecovery";

  @Override public void onReceive(Context context, Intent intent) {
    String action = intent == null ? "" : intent.getAction();
    boolean bootRecovery = Intent.ACTION_BOOT_COMPLETED.equals(action)
        || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action);
    boolean providerChanged = android.location.LocationManager.PROVIDERS_CHANGED_ACTION.equals(action)
        || android.location.LocationManager.MODE_CHANGED_ACTION.equals(action);
    if (!bootRecovery && !providerChanged) return;

    if (providerChanged) {
      // BOOT_COMPLETED can arrive while location is disabled. Android may reject
      // promotion of a location foreground service before its in-service provider
      // listener is registered. Retry when the system reports location enabled.
      if (!isLocationEnabled(context)) return;
      Log.i(TAG, "Location provider enabled; retrying persisted GPS recovery.");
      try {
        KfeNativeGpsService.resumePersisted(context);
      } catch (RuntimeException error) {
        Log.e(TAG, "Unable to retry persisted GPS recovery after provider change.", error);
      }
      return;
    }

    // Persist a diagnostic marker so boot delivery is distinguishable from a
    // service-start failure in instrumentation and field diagnostics.
    Log.i(TAG, "Received lifecycle recovery action=" + action);
    context.getSharedPreferences("kfe_lifecycle_recovery", Context.MODE_PRIVATE).edit()
        .putString("lastRecoveryAction", action)
        .putLong("lastRecoveryAt", System.currentTimeMillis())
        .commit();

    try {
      KfeNativeGpsService.resumePersisted(context);
    } catch (RuntimeException error) {
      Log.e(TAG, "Unable to request persisted GPS recovery.", error);
    }

    try {
      KfeOverlayService.resumePersisted(context);
    } catch (RuntimeException error) {
      Log.e(TAG, "Unable to request persisted overlay recovery.", error);
    }
  }

  private static boolean isLocationEnabled(Context context) {
    android.location.LocationManager manager =
        (android.location.LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
    if (manager == null) return false;
    try {
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
        return manager.isLocationEnabled();
      }
      return manager.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER)
          || manager.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER);
    } catch (RuntimeException error) {
      Log.w(TAG, "Unable to inspect location provider state during recovery.", error);
      return false;
    }
  }
}
