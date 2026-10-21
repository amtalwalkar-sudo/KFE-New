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
    registerPlugin(KfeNativeWorkActionsPlugin.class);
    registerPlugin(KfeCanonicalWorkPlugin.class);
    registerPlugin(KfeOverlayPlugin.class);
    registerPlugin(KfeNativeSystemPlugin.class);
    registerPlugin(KfeTripBoundaryLocationPlugin.class);
    super.onCreate(savedInstanceState);
    try {
      KfeOverlayService.resumePersisted(this);
    } catch (RuntimeException error) {
      android.util.Log.e("KfeMainActivity", "Unable to resume persisted overlay after app recreation.", error);
    }
  }
}
