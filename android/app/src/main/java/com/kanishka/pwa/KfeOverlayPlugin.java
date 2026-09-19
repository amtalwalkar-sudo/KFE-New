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
  @com.getcapacitor.PluginMethod
  public void canDrawOverlays(PluginCall call) {
    JSObject result = new JSObject();
    result.put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.M);
    result.put("granted", Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(getContext()));
    call.resolve(result);
  }

  @com.getcapacitor.PluginMethod
  public void openPermissionSettings(PluginCall call) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      call.resolve();
      return;
    }
    Intent intent = new Intent(
      Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
      Uri.parse("package:" + getContext().getPackageName())
    );
    getContext().startActivity(intent);
    call.resolve();
  }

  @com.getcapacitor.PluginMethod
  public void show(PluginCall call) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(getContext())) {
      call.reject("Overlay permission is not granted.");
      return;
    }
    KfeOverlayService.show(getContext(), call.getString("state", "{}"));
    call.resolve();
  }

  @com.getcapacitor.PluginMethod
  public void update(PluginCall call) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(getContext())) {
      call.reject("Overlay permission is not granted.");
      return;
    }
    KfeOverlayService.update(getContext(), call.getString("state", "{}"));
    call.resolve();
  }

  @com.getcapacitor.PluginMethod
  public void hide(PluginCall call) {
    KfeOverlayService.hide(getContext());
    call.resolve();
  }
}
