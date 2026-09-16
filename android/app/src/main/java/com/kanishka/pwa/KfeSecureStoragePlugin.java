package com.kanishka.pwa;

import android.content.SharedPreferences;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

@CapacitorPlugin(name = "KfeSecureStorage")
public class KfeSecureStoragePlugin extends Plugin {
  private static final String PREFS = "kfe_secure_storage";
  private static final String KEY_ALIAS = "kfe_backup_secret_key_v1";

  private SecretKey getKey() throws Exception {
    KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
    ks.load(null);
    if (ks.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(KEY_ALIAS, null)).getSecretKey();
    KeyGenerator generator = KeyGenerator.getInstance("AES", "AndroidKeyStore");
    generator.init(new android.security.keystore.KeyGenParameterSpec.Builder(KEY_ALIAS, android.security.keystore.KeyProperties.PURPOSE_ENCRYPT | android.security.keystore.KeyProperties.PURPOSE_DECRYPT).setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE).setUserAuthenticationRequired(false).build());
    return generator.generateKey();
  }

  @PluginMethod
  public void set(PluginCall call) {
    try {
      String key = call.getString("key");
      String value = call.getString("value", "");
      if (key == null || key.trim().isEmpty()) { call.reject("Key is required."); return; }
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.ENCRYPT_MODE, getKey());
      byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
      byte[] packed = new byte[cipher.getIV().length + encrypted.length];
      System.arraycopy(cipher.getIV(), 0, packed, 0, cipher.getIV().length);
      System.arraycopy(encrypted, 0, packed, cipher.getIV().length, encrypted.length);
      getContext().getSharedPreferences(PREFS, 0).edit().putString(key, Base64.encodeToString(packed, Base64.NO_WRAP)).apply();
      call.resolve();
    } catch (Exception e) { call.reject("Secure storage write failed.", e); }
  }

  @PluginMethod
  public void get(PluginCall call) {
    try {
      String key = call.getString("key");
      String encoded = getContext().getSharedPreferences(PREFS, 0).getString(key, null);
      JSObject result = new JSObject();
      if (encoded == null) { result.put("value", ""); call.resolve(result); return; }
      byte[] packed = Base64.decode(encoded, Base64.NO_WRAP);
      byte[] iv = new byte[12];
      byte[] encrypted = new byte[packed.length - iv.length];
      System.arraycopy(packed, 0, iv, 0, iv.length);
      System.arraycopy(packed, iv.length, encrypted, 0, encrypted.length);
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.DECRYPT_MODE, getKey(), new GCMParameterSpec(128, iv));
      result.put("value", new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8));
      call.resolve(result);
    } catch (Exception e) { call.reject("Secure storage read failed.", e); }
  }

  @PluginMethod
  public void remove(PluginCall call) {
    String key = call.getString("key");
    if (key != null) getContext().getSharedPreferences(PREFS, 0).edit().remove(key).apply();
    call.resolve();
  }
}
