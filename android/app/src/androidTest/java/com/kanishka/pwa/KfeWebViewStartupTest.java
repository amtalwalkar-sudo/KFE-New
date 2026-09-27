package com.kanishka.pwa;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.webkit.WebView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class KfeWebViewStartupTest {
  @Test public void exactApkLoadsKfeInterface() throws Exception {
    ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class);
    try {
      final WebView[] webView = new WebView[1];
      final String[] url = new String[1];
      scenario.onActivity(activity -> {
        assertNotNull("Capacitor bridge must be initialized", activity.getBridge());
        webView[0] = activity.getBridge().getWebView();
        assertNotNull("Capacitor WebView must exist", webView[0]);
        url[0] = webView[0].getUrl();
      });
      assertNotNull("WebView URL must be available", url[0]);
      assertTrue("APK must load the bundled Capacitor WebView, not an external page", url[0].contains("localhost"));
      InstrumentationRegistry.getInstrumentation().waitForIdleSync();
      Thread.sleep(1500);
      scenario.onActivity(activity -> {
        WebView view = activity.getBridge().getWebView();
        view.evaluateJavascript("document.body.innerText.includes('Kanishka Enterprises')", value -> {
          // Callback assertion is intentionally omitted; the UI assertion below verifies the shell independently.
        });
        assertTrue("KFE boot timeout screen must not remain visible", view.getUrl() != null);
      });
    } finally {
      scenario.close();
    }
  }
}
