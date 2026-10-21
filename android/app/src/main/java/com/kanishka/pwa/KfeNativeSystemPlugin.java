package com.kanishka.pwa;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.content.pm.PackageManager;
import android.app.NotificationManager;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.JSObject;

@CapacitorPlugin(
  name = "KfeNativeSystem",
  permissions = {
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
  }
)
public class KfeNativeSystemPlugin extends Plugin {
  @com.getcapacitor.PluginMethod
  public void getStartupPermissionStatus(PluginCall call) {
    boolean notifications = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) notifications = notifications && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationManager manager = (NotificationManager) getContext().getSystemService(android.content.Context.NOTIFICATION_SERVICE);
      if (manager != null) {
        android.app.NotificationChannel channel = manager.getNotificationChannel("kfe_overlay");
        if (channel != null && channel.getImportance() == NotificationManager.IMPORTANCE_NONE) notifications = false;
      }
    }
    boolean overlay = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(getContext());
    PowerManager powerManager = (PowerManager) getContext().getSystemService(android.content.Context.POWER_SERVICE);
    boolean batteryOptimizationExempt = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || (powerManager != null && powerManager.isIgnoringBatteryOptimizations(getContext().getPackageName()));
    String manufacturer = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase(java.util.Locale.ROOT);
    boolean xiaomiOem = manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco");
    JSObject result = new JSObject();
    result.put("supported", true);
    result.put("notificationsAllowed", notifications);
    result.put("overlayAllowed", overlay);
    result.put("batteryOptimizationExempt", batteryOptimizationExempt);
    result.put("oemBackgroundSettingsRequired", xiaomiOem);
    call.resolve(result);
  }

  @com.getcapacitor.PluginMethod
  public void requestStartupPermission(PluginCall call) {
    String permission = call.getString("permission", "");
    if ("notifications".equals(permission)) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
        call.resolve();
        return;
      }
      requestPermissionForAlias("notifications", call, "startupNotificationsPermissionCallback");
      return;
    }
    call.reject("Unsupported startup permission request.");
  }

  @PermissionCallback
  private void startupNotificationsPermissionCallback(PluginCall call) { call.resolve(); }

  @com.getcapacitor.PluginMethod
  public void openStartupSetting(PluginCall call) {
    String setting = call.getString("setting", "");
    try {
      Intent intent;
      switch (setting) {
        case "overlay":
          intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getContext().getPackageName()));
          break;
        case "oemAutostart":
          intent = new Intent();
          intent.setComponent(new android.content.ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"));
          if (!canResolve(intent)) intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
          break;
        case "oemBattery":
          intent = new Intent();
          intent.setComponent(new android.content.ComponentName("com.miui.powerkeeper", "com.miui.powerkeeper.ui.HiddenAppsConfigActivity"));
          intent.putExtra("package_name", getContext().getPackageName());
          intent.putExtra("package_label", getContext().getApplicationInfo().loadLabel(getContext().getPackageManager()).toString());
          if (!canResolve(intent)) {
            intent = new Intent();
            intent.setComponent(new android.content.ComponentName("com.miui.powercenter", "com.miui.powercenter.PowerSettings"));
          }
          if (!canResolve(intent)) intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
          break;
        case "notifications":
          intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
          break;
        default:
          call.reject("Unsupported startup setting.");
          return;
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(intent);
      call.resolve();
    } catch (Exception error) {
      call.reject("Unable to open the required phone setting.", error);
    }
  }

  private boolean canResolve(Intent intent) {
    try { return intent.resolveActivity(getContext().getPackageManager()) != null; }
    catch (Exception ignored) { return false; }
  }
}
