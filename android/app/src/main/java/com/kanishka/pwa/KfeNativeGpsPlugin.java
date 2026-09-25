package com.kanishka.pwa;

import android.Manifest;
import android.content.pm.PackageManager;

import com.getcapacitor.Bridge;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.JSObject;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

@CapacitorPlugin(
  name = "KfeNativeGps",
  permissions = {
    @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION })
  }
)
public class KfeNativeGpsPlugin extends Plugin {
  @com.getcapacitor.PluginMethod
  public void start(PluginCall call) {
    String tripId = call.getString("tripId", "");
    if (tripId.isEmpty()) { call.reject("tripId is required"); return; }
    if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
        && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      call.reject("LOCATION_PERMISSION_REQUIRED");
      return;
    }
    KfeNativeGpsService.start(getContext(), tripId);
    call.resolve();
  }

  @com.getcapacitor.PluginMethod
  public void stop(PluginCall call) {
    KfeNativeGpsService.stop(getContext(), call.getString("tripId", ""));
    call.resolve();
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
  public void clearTrace(PluginCall call) {
    KfeNativeGpsService.clearTrace(getContext(), call.getString("tripId", ""));
    call.resolve();
  }

  @com.capacitorjs.plugins.core.PermissionsPlugin
  private void unused() {}
}
