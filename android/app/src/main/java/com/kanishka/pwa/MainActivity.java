package com.kanishka.pwa;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  public static volatile boolean isResumed = false;

  @Override
  public void onResume() {
    super.onResume();
    isResumed = true;
  }

  @Override
  public void onPause() {
    isResumed = false;
    super.onPause();
  }

  @Override
  public void onCreate(android.os.Bundle savedInstanceState) {
    registerPlugin(KfeSecureStoragePlugin.class);
    registerPlugin(KfeRideNotificationsPlugin.class);
    registerPlugin(KfeOverlayPlugin.class);
    registerPlugin(KfeNativeGpsPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
