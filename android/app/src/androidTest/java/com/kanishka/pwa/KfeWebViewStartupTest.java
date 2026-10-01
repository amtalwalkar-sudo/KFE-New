package com.kanishka.pwa;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.webkit.WebView;
import android.os.SystemClock;

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

      long deadline = SystemClock.uptimeMillis() + 45000L;
      AtomicReference<String> dom = new AtomicReference<>("");
      while (SystemClock.uptimeMillis() < deadline) {
        CountDownLatch evaluated = new CountDownLatch(1);
        scenario.onActivity(activity -> {
          WebView view = activity.getBridge().getWebView();
          view.evaluateJavascript(
            "({ready:document.readyState,root:!!document.querySelector('#app'),children:document.querySelector('#app')?.children.length||0,text:(document.querySelector('#app')?.innerText||'').slice(0,500),body:(document.body?.innerText||'').slice(0,800),url:location.href,errors:[...document.querySelectorAll('[class*=error],[role=alert]')].map(e=>e.innerText).slice(0,5)})",
            value -> {
              dom.set(value == null ? "" : value);
              evaluated.countDown();
            }
          );
        });
        evaluated.await(2, TimeUnit.SECONDS);
        String state = dom.get();
        if (state.contains("\"children\":") && !state.contains("\"children\":0")
            && !state.contains("\"text\":\"\"")) return;
        SystemClock.sleep(300L);
      }
      throw new AssertionError("Bundled KFE UI did not mount in the APK WebView. Last DOM snapshot: " + dom.get());
    } finally {
      scenario.close();
    }
  }
}
