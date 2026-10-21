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

    // Persist a diagnostic marker so boot delivery is distinguishable from a
    // service-start failure in instrumentation and field diagnostics.
    Log.i(TAG, "Received lifecycle recovery action=" + action);
    context.getSharedPreferences("kfe_lifecycle_recovery", Context.MODE_PRIVATE).edit()
        .putString("lastRecoveryAction", action)
        .putLong("lastRecoveryAt", System.currentTimeMillis())
        .commit();

    try {
      KfeOverlayService.resumePersisted(context);
    } catch (RuntimeException error) {
      Log.e(TAG, "Unable to request persisted overlay recovery.", error);
    }
  }
}
