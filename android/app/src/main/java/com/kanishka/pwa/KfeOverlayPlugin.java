package com.kanishka.pwa;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "KfeOverlay")
public class KfeOverlayPlugin extends Plugin {
  private boolean canDraw() {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(getContext());
  }

  @com.getcapacitor.PluginMethod
  public void status(PluginCall call) {
    JSObject result = new JSObject();
    result.put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.M);
    result.put("granted", canDraw());
    call.resolve(result);
  }

  @com.getcapacitor.PluginMethod
  public void openPermissionSettings(PluginCall call) {
    try {
      Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
      intent.setData(Uri.parse("package:" + getContext().getPackageName()));
      getActivity().startActivity(intent);
      call.resolve();
    } catch (Exception e) {
      call.reject("Could not open overlay permission settings.", e);
    }
  }

  @com.getcapacitor.PluginMethod
  public void show(PluginCall call) {
    if (!canDraw()) {
      call.reject("Overlay permission is not granted.");
      return;
    }
    Intent intent = new Intent(getContext(), KfeOverlayService.class);
    intent.setAction(KfeOverlayService.ACTION_SHOW);
    putState(intent, call);
    startService(intent);
    call.resolve();
  }

  @com.getcapacitor.PluginMethod
  public void update(PluginCall call) {
    if (!canDraw()) {
      call.reject("Overlay permission is not granted.");
      return;
    }
    Intent intent = new Intent(getContext(), KfeOverlayService.class);
    intent.setAction(KfeOverlayService.ACTION_UPDATE);
    putState(intent, call);
    startService(intent);
    call.resolve();
  }

  @com.getcapacitor.PluginMethod
  public void consumePendingEndRide(PluginCall call) {
    android.content.SharedPreferences prefs = getContext().getSharedPreferences("kfe_overlay", android.content.Context.MODE_PRIVATE);
    if (!prefs.getBoolean("pending_end_ride", false)) {
      call.resolve(new JSObject());
      return;
    }
    JSObject result = new JSObject();
    result.put("fare", prefs.getString("pending_fare", ""));
    result.put("toll", prefs.getString("pending_toll", "0"));
    result.put("parking", prefs.getString("pending_parking", "0"));
    call.resolve(result);
  }

  @com.getcapacitor.PluginMethod
  public void acknowledgePendingEndRide(PluginCall call) {
    android.content.SharedPreferences prefs = getContext().getSharedPreferences("kfe_overlay", android.content.Context.MODE_PRIVATE);
    prefs.edit().clear().apply();
    call.resolve();
  }

  @com.getcapacitor.PluginMethod
  public void hide(PluginCall call) {
    Intent intent = new Intent(getContext(), KfeOverlayService.class);
    intent.setAction(KfeOverlayService.ACTION_HIDE);
    startService(intent);
    call.resolve();
  }

  private void startService(Intent intent) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      androidx.core.content.ContextCompat.startForegroundService(getContext(), intent);
    } else {
      getContext().startService(intent);
    }
  }

  private void putState(Intent intent, PluginCall call) {
    intent.putExtra("target", call.getDouble("target", Double.NaN));
    intent.putExtra("achieved", call.getDouble("achieved", 0.0));
    intent.putExtra("liveKms", call.getDouble("liveKms", Double.NaN));
    intent.putExtra("progress", call.getDouble("progress", 0.0));
    intent.putExtra("rides", call.getInt("rides", 0));
    intent.putExtra("tripActive", call.getBoolean("tripActive", false));
    intent.putExtra("tripTimer", call.getString("tripTimer", ""));
  }
}
