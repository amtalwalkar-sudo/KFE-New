package com.kanishka.pwa;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.webkit.WebView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class KfeWebViewStartupTest {
  @Test public void exactApkLoadsKfeInterface() throws Exception {
    ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class);
    try {
      final String[] url = new String[1];
      scenario.onActivity(activity -> {
        assertNotNull("Capacitor bridge must be initialized", activity.getBridge());
        WebView view = activity.getBridge().getWebView();
        assertNotNull("Capacitor WebView must exist", view);
        url[0] = view.getUrl();
      });
      assertNotNull("WebView URL must be available", url[0]);
      assertTrue("APK must load the bundled Capacitor WebView", url[0].contains("localhost"));

      final CountDownLatch ready = new CountDownLatch(1);
      final AtomicBoolean kfeVisible = new AtomicBoolean(false);
      scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(
        "document.body.innerText.includes('Kanishka Enterprises') && !document.body.innerText.includes('KFE could not start')",
        value -> { kfeVisible.set("true".equals(value)); ready.countDown(); }
      ));
      assertTrue("KFE interface must render in the APK WebView", ready.await(8, TimeUnit.SECONDS));
      assertTrue("KFE interface must render without the startup error screen", kfeVisible.get());
    } finally {
      scenario.close();
    }
  }
}
