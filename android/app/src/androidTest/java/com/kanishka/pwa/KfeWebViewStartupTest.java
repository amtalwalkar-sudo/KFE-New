package com.kanishka.pwa;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.os.SystemClock;
import android.webkit.WebView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class KfeWebViewStartupTest {
  @Test public void exactApkLoadsKfeInterface() throws Exception {
    ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class);
    try {
      AtomicReference<String> url = new AtomicReference<>();
      scenario.onActivity(activity -> {
        assertNotNull("Capacitor bridge must be initialized", activity.getBridge());
        WebView view = activity.getBridge().getWebView();
        assertNotNull("Capacitor WebView must exist", view);
        url.set(view.getUrl());
      });
      assertNotNull("WebView URL must be available", url.get());
      assertTrue("APK must load the bundled Capacitor WebView", url.get().contains("localhost"));

      long deadline = SystemClock.uptimeMillis() + 90000L;
      AtomicReference<Integer> progress = new AtomicReference<>(0);
      AtomicReference<String> pageUrl = new AtomicReference<>("");
      AtomicReference<String> originalUrl = new AtomicReference<>("");
      AtomicReference<String> title = new AtomicReference<>("");
      while (SystemClock.uptimeMillis() < deadline) {
        scenario.onActivity(activity -> {
          WebView view = activity.getBridge().getWebView();
          progress.set(view.getProgress());
          pageUrl.set(String.valueOf(view.getUrl()));
          originalUrl.set(String.valueOf(view.getOriginalUrl()));
          title.set(String.valueOf(view.getTitle()));
        });
        if (progress.get() >= 100) break;
        SystemClock.sleep(500L);
      }
      assertTrue("Bundled HTML did not finish loading; url=" + pageUrl.get()
        + "; originalUrl=" + originalUrl.get() + "; progress=" + progress.get()
        + "; title=" + title.get(), progress.get() >= 100);

      AtomicReference<String> dom = new AtomicReference<>("");
      CountDownLatch evaluated = new CountDownLatch(1);
      scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(
        "!!(document.getElementById('app') && document.body && document.body.innerText.includes('KFE WORK') && document.body.innerText.includes('START SHIFT'))",
        value -> {
          dom.set(value == null ? "null JS result" : value);
          evaluated.countDown();
        }
      ));
      assertTrue("WebView JavaScript evaluation timed out", evaluated.await(10, TimeUnit.SECONDS));
      assertTrue("KFE Work and Start Shift controls did not mount in APK WebView: " + dom.get(),
        "true".equals(dom.get()));
    } finally {
      scenario.close();
    }
  }
}
