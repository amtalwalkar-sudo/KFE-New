package com.kanishka.pwa;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;

import androidx.annotation.NonNull;

/**
 * Shared Android connectivity adapter for network-dependent features.
 * It is event-driven for observers and distinguishes a network from validated
 * internet. Durable work should still use WorkManager network constraints.
 */
public final class KfeConnectivityService {
  public enum State { OFFLINE, CONNECTED_UNVALIDATED, INTERNET_AVAILABLE }

  public interface Listener {
    void onConnectivityChanged(@NonNull State state);
  }

  private KfeConnectivityService() {}

  private static ConnectivityManager manager(@NonNull Context context) {
    return (ConnectivityManager) context.getApplicationContext()
        .getSystemService(Context.CONNECTIVITY_SERVICE);
  }

  @NonNull
  public static State getState(@NonNull Context context) {
    ConnectivityManager manager = manager(context);
    if (manager == null) return State.OFFLINE;
    Network active = manager.getActiveNetwork();
    if (active == null) return State.OFFLINE;
    NetworkCapabilities capabilities = manager.getNetworkCapabilities(active);
    if (capabilities == null || !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
      return State.CONNECTED_UNVALIDATED;
    }
    return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        ? State.INTERNET_AVAILABLE : State.CONNECTED_UNVALIDATED;
  }

  public static boolean hasValidatedInternet(@NonNull Context context) {
    return getState(context) == State.INTERNET_AVAILABLE;
  }

  /**
   * Register an event-driven observer. Call unwatch() when its owner is done.
   * The immediate callback reports current state; no polling is scheduled.
   */
  @NonNull
  public static ConnectivityManager.NetworkCallback watch(
      @NonNull Context context, @NonNull Listener listener) {
    ConnectivityManager manager = manager(context);
    if (manager == null) {
      listener.onConnectivityChanged(State.OFFLINE);
      return new ConnectivityManager.NetworkCallback();
    }
    ConnectivityManager.NetworkCallback callback = new ConnectivityManager.NetworkCallback() {
      private void publish() { listener.onConnectivityChanged(getState(context)); }
      @Override public void onAvailable(Network network) { publish(); }
      @Override public void onLost(Network network) { publish(); }
      @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) { publish(); }
    };
    try {
      manager.registerNetworkCallback(
          new NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(),
          callback);
      listener.onConnectivityChanged(getState(context));
    } catch (RuntimeException error) {
      android.util.Log.w("KfeConnectivity", "Connectivity observer could not be registered.", error);
      listener.onConnectivityChanged(getState(context));
    }
    return callback;
  }

  public static void unwatch(@NonNull Context context, @NonNull ConnectivityManager.NetworkCallback callback) {
    ConnectivityManager manager = manager(context);
    if (manager == null || callback == null) return;
    try { manager.unregisterNetworkCallback(callback); }
    catch (IllegalArgumentException ignored) { /* Already unregistered or registration failed. */ }
    catch (RuntimeException error) {
      android.util.Log.w("KfeConnectivity", "Connectivity observer could not be removed.", error);
    }
  }
}
