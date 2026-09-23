package com.kanishka.pwa;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(android.os.Bundle savedInstanceState) {
    registerPlugin(KfeSecureStoragePlugin.class);
    registerPlugin(KfeRideNotificationsPlugin.class);
    registerPlugin(KfeOverlayPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
