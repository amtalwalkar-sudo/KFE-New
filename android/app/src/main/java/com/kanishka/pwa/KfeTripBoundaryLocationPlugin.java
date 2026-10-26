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
    @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
    @Permission(alias = "backgroundLocation", strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION })
  }
)
public class KfeTripBoundaryLocationPlugin extends Plugin {
  @com.getcapacitor.PluginMethod
  public void getLocationStatus(PluginCall call) {
    Context context = getContext();
    boolean fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    boolean coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    boolean background = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
      || ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
    LocationManager manager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
    boolean gpsEnabled = false;
    if (manager != null) {
      try { gpsEnabled = manager.isProviderEnabled(LocationManager.GPS_PROVIDER); }
      catch (Exception ignored) {}
    }
    JSObject status = new JSObject();
    status.put("fineGranted", fine);
    status.put("coarseGranted", coarse);
    status.put("backgroundGranted", background);
    status.put("gpsEnabled", gpsEnabled);
    status.put("backgroundCaptureAllowed", fine && background);
    status.put("pendingCount", KfeOverlayService.pendingEventLocationCount(context));
    call.resolve(status);
  }

  @com.getcapacitor.PluginMethod
  public void requestLocationPermissions(PluginCall call) {
    if (hasFineLocationPermission()) {
      call.resolve();
      return;
    }
    requestPermissionForAlias("location", call, "locationPermissionCallback");
  }

  @PermissionCallback
  private void locationPermissionCallback(PluginCall call) {
    if (!hasFineLocationPermission()) {
      call.reject("Precise location permission was not granted.");
      return;
    }
    call.resolve();
  }

  @com.getcapacitor.PluginMethod
  public void requestBackgroundLocationPermission(PluginCall call) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      KfeOverlayService.retryPendingLocations(getContext());
      call.resolve();
      return;
    }
    if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      call.reject("Grant precise location permission before enabling background GPS.");
      return;
    }
    if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED) {
      KfeOverlayService.retryPendingLocations(getContext());
      call.resolve();
      return;
    }
    requestPermissionForAlias("backgroundLocation", call, "backgroundLocationPermissionCallback");
  }

  @PermissionCallback
  private void backgroundLocationPermissionCallback(PluginCall call) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
      && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      call.reject("Background location permission was not granted. Background GPS capture remains disabled.");
      return;
    }
    KfeOverlayService.retryPendingLocations(getContext());
    call.resolve();
  }
  @com.getcapacitor.PluginMethod
  public void queueEventLocationCapture(PluginCall call) {
    String entityType = call.getString("entityType", "TRIP");
    String entityId = call.getString("entityId", "");
    String eventType = call.getString("eventType", "");
    if (!"TRIP".equals(entityType) || entityId == null || entityId.trim().isEmpty()) {
      call.reject("A valid trip event is required for background GPS capture.");
      return;
    }
    if (!"TRIP_START".equals(eventType) && !"TRIP_END".equals(eventType)
      && !"PICKUP_START".equals(eventType) && !"TRIP_CANCELLED".equals(eventType)) {
      call.reject("Unsupported trip GPS event type.");
      return;
    }
    KfeOverlayService.queueEventLocationCapture(getContext(), entityId, eventType);
    call.resolve();
  }

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
