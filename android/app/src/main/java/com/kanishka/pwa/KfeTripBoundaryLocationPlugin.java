package com.kanishka.pwa;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;


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
  public void openBackgroundLocationSettings(PluginCall call) {
    try {
      Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
        Uri.fromParts("package", getContext().getPackageName(), null));
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(intent);
      call.resolve();
    } catch (Exception error) {
      call.reject("Could not open Android app permission settings.", error);
    }
  }

  @com.getcapacitor.PluginMethod
  public void queueEventLocationCapture(PluginCall call) {
    String entityType = call.getString("entityType", "TRIP");
    String entityId = call.getString("entityId", "");
    String eventType = call.getString("eventType", "");
    String eventAt = call.getString("eventAt", "");
    boolean rideEvent = "TRIP".equals(entityType)
      && ("PICKUP_START".equals(eventType) || "TRIP_CANCELLED".equals(eventType)
        || "TRIP_START".equals(eventType) || "TRIP_END".equals(eventType));
    if (!rideEvent || entityId == null || entityId.trim().isEmpty()) {
      call.reject("One of the four ride events is required for GPS capture.");
      return;
    }
    if (!KfeOverlayService.queueEventLocationCapture(getContext(), entityType, entityId, eventType, eventAt)) {
      call.reject("The event GPS request could not be durably queued.");
      return;
    }
    call.resolve();
  }

  private boolean hasFineLocationPermission() {
    return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
  }


}
