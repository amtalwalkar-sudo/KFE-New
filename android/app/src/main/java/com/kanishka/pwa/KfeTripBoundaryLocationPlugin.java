package com.kanishka.pwa;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.time.Instant;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(
  name = "KfeTripBoundaryLocation",
  permissions = {
    @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION })
  }
)
public class KfeTripBoundaryLocationPlugin extends Plugin {
  @com.getcapacitor.PluginMethod
  public void captureCurrentLocation(PluginCall call) {
    if (!hasFineLocationPermission()) {
      requestPermissionForAlias("location", call, "tripBoundaryLocationPermissionCallback");
      return;
    }
    captureOneFix(call);
  }

  @PermissionCallback
  private void tripBoundaryLocationPermissionCallback(PluginCall call) {
    if (!hasFineLocationPermission()) {
      call.reject("Precise location permission is required to capture the trip boundary.");
      return;
    }
    captureOneFix(call);
  }

  private boolean hasFineLocationPermission() {
    return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
  }

  private void captureOneFix(PluginCall call) {
    LocationManager manager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
    if (manager == null) { call.reject("Android location provider is unavailable."); return; }
    Handler handler = new Handler(Looper.getMainLooper());
    AtomicBoolean finished = new AtomicBoolean(false);
    Runnable timeout = () -> {
      if (!finished.compareAndSet(false, true)) return;
      call.reject("No GPS fix was available for this trip boundary.");
    };
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        handler.postDelayed(timeout, 20000L);
        CancellationSignal cancellation = new CancellationSignal();
        handler.postDelayed(cancellation::cancel, 20000L);
        manager.getCurrentLocation(LocationManager.GPS_PROVIDER, cancellation, getActivity().getMainExecutor(), location -> {
          if (!finished.compareAndSet(false, true)) return;
          handler.removeCallbacks(timeout);
          if (location == null) { call.reject("No GPS fix was available for this trip boundary."); return; }
          JSObject snapshot = toSnapshot(location);
          if (snapshot == null) { call.reject("GPS fix did not provide a valid provider timestamp."); return; }
          call.resolve(snapshot);
        });
      } else {
        final LocationListener[] listener = new LocationListener[1];
        final Runnable singleUpdateTimeout = () -> {
          if (!finished.compareAndSet(false, true)) return;
          try { manager.removeUpdates(listener[0]); } catch (Exception ignored) {}
          call.reject("No GPS fix was available for this trip boundary.");
        };
        listener[0] = new LocationListener() {
          @Override public void onLocationChanged(Location location) {
            if (!finished.compareAndSet(false, true)) return;
            handler.removeCallbacks(singleUpdateTimeout);
            try { manager.removeUpdates(this); } catch (Exception ignored) {}
            JSObject snapshot = toSnapshot(location);
            if (snapshot == null) { call.reject("GPS fix did not provide a valid provider timestamp."); return; }
            call.resolve(snapshot);
          }
          @Override public void onProviderEnabled(String provider) {}
          @Override public void onProviderDisabled(String provider) {}
          @SuppressWarnings("deprecation") @Override public void onStatusChanged(String provider, int status, android.os.Bundle extras) {}
        };
        handler.postDelayed(singleUpdateTimeout, 20000L);
        manager.requestSingleUpdate(LocationManager.GPS_PROVIDER, listener[0], Looper.getMainLooper());
      }
    } catch (Exception error) {
      if (finished.compareAndSet(false, true)) {
        handler.removeCallbacks(timeout);
        call.reject("Could not capture a one-shot GPS fix.", error);
      }
    }
  }

  private JSObject toSnapshot(Location location) {
    if (location == null || location.getTime() <= 0L) return null;
    JSObject result = new JSObject();
    result.put("latitude", location.getLatitude());
    result.put("longitude", location.getLongitude());
    result.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : JSObject.NULL);
    result.put("capturedAt", Instant.ofEpochMilli(location.getTime()).toString());
    return result;
  }
}
