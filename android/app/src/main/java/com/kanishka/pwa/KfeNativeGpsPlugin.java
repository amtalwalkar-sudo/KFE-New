package com.kanishka.pwa;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.content.pm.PackageManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.JSObject;

import androidx.core.content.ContextCompat;

@CapacitorPlugin(
  name = "KfeNativeGps",
  permissions = {
    @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
    @Permission(alias = "backgroundLocation", strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION })
  }
)
public class KfeNativeGpsPlugin extends Plugin {
  @com.getcapacitor.PluginMethod
  public void getPermissionStatus(PluginCall call) {
    boolean fine = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    boolean coarse = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    boolean background = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
      || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
    JSObject result = new JSObject();
    result.put("supported", true);
    result.put("locationAllowed", fine || coarse);
    result.put("backgroundLocationAllowed", background);
    call.resolve(result);
  }

  @com.getcapacitor.PluginMethod
  public void openAppSettings(PluginCall call) {
    try {
      Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(intent);
      call.resolve();
    } catch (Exception error) {
      call.reject("Unable to open KFE app settings.", error);
    }
  }

  @com.getcapacitor.PluginMethod
  public void start(PluginCall call) {
    String tripId = call.getString("tripId", "");
    if (tripId.isEmpty()) { call.reject("tripId is required"); return; }
    if (getPermissionState("location") != PermissionState.GRANTED) {
      requestPermissionForAlias("location", call, "locationPermissionCallback");
      return;
    }
    startTracking(call, tripId);
  }

  @PermissionCallback
  private void locationPermissionCallback(PluginCall call) {
    if (getPermissionState("location") != PermissionState.GRANTED) {
      call.reject("LOCATION_PERMISSION_REQUIRED");
      return;
    }
    String tripId = call.getString("tripId", "");
    if (tripId.isEmpty()) { call.reject("tripId is required"); return; }
    startTracking(call, tripId);
  }

  private void startTracking(PluginCall call, String tripId) {
    if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
        && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      call.reject("LOCATION_PERMISSION_REQUIRED");
      return;
    }
    String eventType = call.getString("eventType", "PASSENGER_RIDE_TRACE");
    String entityType = call.getString("entityType", "TRIP");
    KfeNativeGpsService.start(getContext(), tripId, eventType, entityType);
    awaitCollectorState(call, tripId, eventType, entityType, true, System.currentTimeMillis() + 8000L);
  }

  @com.getcapacitor.PluginMethod
  public void stop(PluginCall call) {
    String tripId = call.getString("tripId", "");
    if (tripId == null || tripId.trim().isEmpty()) { call.reject("tripId is required"); return; }
    KfeNativeGpsService.stop(getContext(), tripId);
    awaitCollectorState(call, tripId, null, null, false, System.currentTimeMillis() + 8000L);
  }

  private void awaitCollectorState(PluginCall call, String tripId, String eventType, String entityType, boolean expectActive, long deadline) {
    Handler handler = new Handler(Looper.getMainLooper());
    Runnable check = new Runnable() {
      @Override public void run() {
        if (!call.getCallbackId().isEmpty()) {
          boolean matches = expectActive
            ? KfeNativeGpsService.isPersistedTracking(getContext(), tripId, eventType, entityType)
            : !tripId.equals(KfeNativeGpsService.persistedActiveTripId(getContext()));
          if (matches) { call.resolve(); return; }
          if (System.currentTimeMillis() >= deadline) {
            call.reject(expectActive ? "NATIVE_GPS_START_NOT_CONFIRMED" : "NATIVE_GPS_STOP_NOT_CONFIRMED");
            return;
          }
          handler.postDelayed(this, 100L);
        }
      }
    };
    handler.post(check);
  }

  @com.getcapacitor.PluginMethod
  public void getTrace(PluginCall call) {
    String tripId = call.getString("tripId", "");
    try {
      JSObject result = new JSObject();
      result.put("points", new org.json.JSONArray(KfeNativeGpsService.readTrace(getContext(), tripId)));
      call.resolve(result);
    } catch (Exception error) {
      call.reject("Unable to read native GPS trace", error);
    }
  }

  @com.getcapacitor.PluginMethod
  public void listTraceOwners(PluginCall call) {
    try {
      JSObject result = new JSObject();
      result.put("owners", new org.json.JSONArray(KfeNativeGpsService.listTraceOwners(getContext())));
      call.resolve(result);
    } catch (Exception error) {
      call.reject("Unable to list persisted native GPS traces.", error);
    }
  }

  @com.getcapacitor.PluginMethod
  public void clearTrace(PluginCall call) {
    KfeNativeGpsService.clearTrace(getContext(), call.getString("tripId", ""));
    call.resolve();
  }
}
