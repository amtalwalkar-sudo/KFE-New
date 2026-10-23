package com.kanishka.pwa;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "KfeBackupFile")
public class KfeBackupFilePlugin extends Plugin {
  @PluginMethod
  public void save(PluginCall call) {
    String filename = call.getString("filename");
    String content = call.getString("content");
    if (filename == null || filename.trim().isEmpty() || content == null) {
      call.reject("Backup filename and content are required.");
      return;
    }
    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType("application/json");
    intent.putExtra(Intent.EXTRA_TITLE, filename);
    startActivityForResult(call, intent, "saveBackupResult");
  }

  @ActivityCallback
  private void saveBackupResult(PluginCall call, ActivityResult result) {
    if (call == null) return;
    if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
      call.reject("Backup export was cancelled; no file was saved.");
      return;
    }
    String content = call.getString("content");
    Uri destination = result.getData().getData();
    try (OutputStream output = getContext().getContentResolver().openOutputStream(destination, "wt")) {
      if (output == null) throw new IllegalStateException("Android could not open the selected file.");
      output.write(content.getBytes(StandardCharsets.UTF_8));
      output.flush();
      JSObject response = new JSObject();
      response.put("saved", true);
      response.put("uri", destination.toString());
      call.resolve(response);
    } catch (Exception error) {
      call.reject("Could not write the backup file: " + error.getMessage(), error);
    }
  }
}
