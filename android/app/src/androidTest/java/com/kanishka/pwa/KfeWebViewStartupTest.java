package com.kanishka.pwa;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.webkit.WebView;
import android.os.SystemClock;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;

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

      // The Capacitor WebView can exist before the bundled SPA has mounted.
      // Poll the actual UI instead of evaluating once against an empty document.
      long deadline = SystemClock.uptimeMillis() + 30000L;
      AtomicBoolean kfeVisible = new AtomicBoolean(false);
      while (SystemClock.uptimeMillis() < deadline && !kfeVisible.get()) {
        CountDownLatch evaluated = new CountDownLatch(1);
        scenario.onActivity(activity -> {
          WebView view = activity.getBridge().getWebView();
          view.evaluateJavascript(
            "document.readyState === 'complete' && !!document.querySelector('.work-canonical') && document.body.innerText.includes('Kanishka Enterprises') && !document.querySelector('.kfe-runtime-error')",
            value -> {
              kfeVisible.set("true".equals(value));
              evaluated.countDown();
            }
          );
        });
        evaluated.await(1, TimeUnit.SECONDS);
        if (!kfeVisible.get()) SystemClock.sleep(250L);
      }
      assertTrue("KFE interface must render in the APK WebView within 30 seconds", kfeVisible.get());
    } finally {
      scenario.close();
    }
  }
}
