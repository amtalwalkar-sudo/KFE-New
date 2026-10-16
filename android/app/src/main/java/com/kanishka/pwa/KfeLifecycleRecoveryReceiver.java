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
    if (!Intent.ACTION_BOOT_COMPLETED.equals(action) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) return;

    // Persist a small diagnostic marker before recovery attempts. It makes boot
    // delivery distinguishable from a service-start failure in instrumentation
    // logs and survives the reboot being tested.
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
}
