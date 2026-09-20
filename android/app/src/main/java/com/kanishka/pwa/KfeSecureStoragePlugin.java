package com.kanishka.pwa;

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

@CapacitorPlugin(name = "KfeSecureStorage")
public class KfeSecureStoragePlugin extends Plugin {
  private static final String PREFS = "kfe_secure_storage";
  private static final String KEY_ALIAS = "kfe_backup_secret_key_v1";
  private static final byte STORAGE_FORMAT_V1 = 0x4B;
  private static final int LEGACY_IV_LENGTH = 12;

  private SecretKey getKey() throws Exception {
    KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
    ks.load(null);
    if (ks.containsAlias(KEY_ALIAS)) {
      return ((KeyStore.SecretKeyEntry) ks.getEntry(KEY_ALIAS, null)).getSecretKey();
    }

    KeyGenerator generator = KeyGenerator.getInstance("AES", "AndroidKeyStore");
    generator.init(new android.security.keystore.KeyGenParameterSpec.Builder(
      KEY_ALIAS,
      android.security.keystore.KeyProperties.PURPOSE_ENCRYPT
        | android.security.keystore.KeyProperties.PURPOSE_DECRYPT
    )
      .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
      .setUserAuthenticationRequired(false)
      .build());
    return generator.generateKey();
  }

  @PluginMethod
  public void set(PluginCall call) {
    try {
      String key = call.getString("key");
      String value = call.getString("value", "");
      if (key == null || key.trim().isEmpty()) {
        call.reject("Key is required.");
        return;
      }

      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.ENCRYPT_MODE, getKey());
      byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
      byte[] iv = cipher.getIV();

      // Versioned envelope: format marker + IV length + IV + ciphertext/tag.
      // Keeping the IV length in the record avoids assuming a provider-specific
      // GCM IV size while retaining compatibility with records written before
      // this envelope was introduced.
      if (iv.length > 255) {
        call.reject("Secure storage IV is unexpectedly large.");
        return;
      }
      byte[] packed = new byte[2 + iv.length + encrypted.length];
      packed[0] = STORAGE_FORMAT_V1;
      packed[1] = (byte) iv.length;
      System.arraycopy(iv, 0, packed, 2, iv.length);
      System.arraycopy(encrypted, 0, packed, 2 + iv.length, encrypted.length);

      getContext().getSharedPreferences(PREFS, 0)
        .edit()
        .putString(key, Base64.encodeToString(packed, Base64.NO_WRAP))
        .apply();
      call.resolve();
    } catch (Exception e) {
      call.reject("Secure storage write failed.", e);
    }
  }

  @PluginMethod
  public void get(PluginCall call) {
    try {
      String key = call.getString("key");
      if (key == null || key.trim().isEmpty()) {
        call.reject("Key is required.");
        return;
      }

      String encoded = getContext().getSharedPreferences(PREFS, 0).getString(key, null);
      JSObject result = new JSObject();
      if (encoded == null) {
        result.put("value", "");
        call.resolve(result);
        return;
      }

      byte[] packed = Base64.decode(encoded, Base64.NO_WRAP);
      int ivLength;
      int encryptedOffset;

      if (packed.length >= 2 && packed[0] == STORAGE_FORMAT_V1) {
        ivLength = packed[1] & 0xFF;
        encryptedOffset = 2 + ivLength;
        if (ivLength < 12 || encryptedOffset >= packed.length) {
          call.reject("Secure storage record is malformed.");
          return;
        }
      } else {
        // Backward compatibility with the original envelope: IV(12) + ciphertext/tag.
        ivLength = LEGACY_IV_LENGTH;
        encryptedOffset = ivLength;
        if (packed.length <= encryptedOffset) {
          call.reject("Secure storage record is malformed.");
          return;
        }
      }

      byte[] iv = new byte[ivLength];
      byte[] encrypted = new byte[packed.length - encryptedOffset];
      System.arraycopy(packed, packed[0] == STORAGE_FORMAT_V1 ? 2 : 0, iv, 0, iv.length);
      System.arraycopy(packed, encryptedOffset, encrypted, 0, encrypted.length);

      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.DECRYPT_MODE, getKey(), new GCMParameterSpec(128, iv));
      result.put("value", new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8));
      call.resolve(result);
    } catch (Exception e) {
      call.reject("Secure storage read failed.", e);
    }
  }

  @PluginMethod
  public void remove(PluginCall call) {
    String key = call.getString("key");
    if (key != null) {
      getContext().getSharedPreferences(PREFS, 0).edit().remove(key).apply();
    }
    call.resolve();
  }
}
