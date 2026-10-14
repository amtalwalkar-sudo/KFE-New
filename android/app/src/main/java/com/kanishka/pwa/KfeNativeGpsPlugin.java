package com.kanishka.pwa;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.app.NotificationManager;
import androidx.core.app.NotificationManagerCompat;

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
    @Permission(alias = "backgroundLocation", strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION }),
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
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
  public void getStartupPermissionStatus(PluginCall call) {
    boolean fine = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    boolean coarse = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    boolean background = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
    LocationManager locationManager = (LocationManager) getContext().getSystemService(android.content.Context.LOCATION_SERVICE);
    boolean locationServices = false;
    try { if (locationManager != null) { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) locationServices = locationManager.isLocationEnabled(); else locationServices = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) || locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER); } } catch (Exception ignored) { locationServices = false; }
    boolean notifications = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) notifications = notifications && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) { NotificationManager manager = (NotificationManager) getContext().getSystemService(android.content.Context.NOTIFICATION_SERVICE); if (manager != null) { android.app.NotificationChannel channel = manager.getNotificationChannel("kfe_ride_actions"); if (channel != null && channel.getImportance() == NotificationManager.IMPORTANCE_NONE) notifications = false; } }
    boolean overlay = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(getContext());
    PowerManager powerManager = (PowerManager) getContext().getSystemService(android.content.Context.POWER_SERVICE);
    boolean batteryOptimizationExempt = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || (powerManager != null && powerManager.isIgnoringBatteryOptimizations(getContext().getPackageName()));
    String manufacturer = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase(java.util.Locale.ROOT);
    boolean xiaomiOem = manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco");
    JSObject result = new JSObject(); result.put("supported", true); result.put("locationAllowed", fine || coarse); result.put("fineLocationAllowed", fine); result.put("backgroundLocationAllowed", background); result.put("locationServicesEnabled", locationServices); result.put("notificationsAllowed", notifications); result.put("overlayAllowed", overlay); result.put("batteryOptimizationExempt", batteryOptimizationExempt); result.put("oemBackgroundSettingsRequired", xiaomiOem); call.resolve(result);
  }

  @com.getcapacitor.PluginMethod
  public void requestStartupPermission(PluginCall call) {
    String permission = call.getString("permission", "");
    if ("location".equals(permission)) { if (getPermissionState("location") == PermissionState.GRANTED) { call.resolve(); return; } requestPermissionForAlias("location", call, "startupLocationPermissionCallback"); return; }
    if ("notifications".equals(permission)) { if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) { call.resolve(); return; } requestPermissionForAlias("notifications", call, "startupNotificationsPermissionCallback"); return; }
    call.reject("Unsupported startup permission request.");
  }
  @PermissionCallback private void startupLocationPermissionCallback(PluginCall call) { call.resolve(); }
  @PermissionCallback private void startupNotificationsPermissionCallback(PluginCall call) { call.resolve(); }

  @com.getcapacitor.PluginMethod
  public void openStartupSetting(PluginCall call) {
    String setting = call.getString("setting", "");
    try {
      Intent intent;
      switch (setting) {
        case "locationServices": intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS); break;
        case "overlay": intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getContext().getPackageName())); break;
        case "oemAutostart":
          intent = new Intent(); intent.setComponent(new android.content.ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"));
          if (!canResolve(intent)) intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
          break;
        case "oemBattery":
          intent = new Intent(); intent.setComponent(new android.content.ComponentName("com.miui.powerkeeper", "com.miui.powerkeeper.ui.HiddenAppsConfigActivity")); intent.putExtra("package_name", getContext().getPackageName()); intent.putExtra("package_label", getContext().getApplicationInfo().loadLabel(getContext().getPackageManager()).toString());
          if (!canResolve(intent)) { intent = new Intent(); intent.setComponent(new android.content.ComponentName("com.miui.powercenter", "com.miui.powercenter.PowerSettings")); }
          if (!canResolve(intent)) intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
          break;
        case "location": case "backgroundLocation": case "notifications": intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName())); break;
        default: call.reject("Unsupported startup setting."); return;
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); getContext().startActivity(intent); call.resolve();
    } catch (Exception error) { call.reject("Unable to open the required phone setting.", error); }
  }
  private boolean canResolve(Intent intent) {
    try { return intent.resolveActivity(getContext().getPackageManager()) != null; } catch (Exception ignored) { return false; }
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
