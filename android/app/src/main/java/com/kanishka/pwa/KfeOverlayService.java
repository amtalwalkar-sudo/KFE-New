package com.kanishka.pwa;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.content.pm.ServiceInfo;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.app.NotificationCompat;

import java.util.Locale;

public class KfeOverlayService extends Service {
  public static final String ACTION_SHOW = "com.kanishka.pwa.KFE_OVERLAY_SHOW";
  public static final String ACTION_UPDATE = "com.kanishka.pwa.KFE_OVERLAY_UPDATE";
  public static final String ACTION_HIDE = "com.kanishka.pwa.KFE_OVERLAY_HIDE";

  private static final String CHANNEL_ID = "kfe_overlay_service";
  private static final int NOTIFICATION_ID = 4201;

  private WindowManager windowManager;
  private View overlayView;
  private WindowManager.LayoutParams params;
  private TextView targetValue;
  private TextView achievedValue;
  private TextView liveKmsValue;
  private TextView progressValue;
  private TextView ridesValue;
  private TextView tripValue;
  private float downX;
  private float downY;
  private int originX;
  private int originY;
  private boolean dragGesture;
  private boolean minimized;
  private static final int MINIMIZE_TRIGGER_DP = 90;

  @Override public void onCreate() {
    super.onCreate();
    createChannel();
    windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
    } else {
      startForeground(NOTIFICATION_ID, buildNotification());
    }
  }

  @Override public int onStartCommand(Intent intent, int flags, int startId) {
    if (intent == null) {
      removeOverlay();
      return START_NOT_STICKY;
    }
    if (ACTION_HIDE.equals(intent.getAction())) {
      removeOverlay();
      stopSelf();
      return START_NOT_STICKY;
    }
    if (!canDraw()) {
      stopSelf();
      return START_NOT_STICKY;
    }
    ensureOverlay();
    updateState(intent);
    return START_STICKY;
  }

  private boolean canDraw() {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this);
  }

  private void ensureOverlay() {
    if (overlayView != null) return;

    LinearLayout shell = new LinearLayout(this);
    shell.setOrientation(LinearLayout.VERTICAL);
    shell.setGravity(Gravity.CENTER_HORIZONTAL);

    TextView swipe = text("KFE  •  SWIPE", 12, Color.WHITE);
    swipe.setGravity(Gravity.CENTER);
    GradientDrawable swipeBg = new GradientDrawable();
    swipeBg.setColor(Color.argb(242, 22, 120, 92));
    swipeBg.setCornerRadius(dp(20));
    swipe.setBackground(swipeBg);
    swipe.setPadding(dp(14), dp(9), dp(14), dp(9));
    swipe.setContentDescription("KFE swipe bar. Drag to move. Drag upward to minimise. Tap to open KFE.");
    swipe.setOnTouchListener((v, event) -> handleSwipe(v, event));
    shell.addView(swipe, new LinearLayout.LayoutParams(dp(292), dp(48)));

    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setPadding(dp(14), dp(10), dp(14), dp(10));
    GradientDrawable background = new GradientDrawable();
    background.setColor(Color.argb(238, 20, 24, 30));
    background.setCornerRadius(dp(20));
    background.setStroke(dp(1), Color.argb(90, 255, 255, 255));
    root.setBackground(background);
    root.setElevation(dp(12));

    LinearLayout header = new LinearLayout(this);
    header.setGravity(Gravity.CENTER_VERTICAL);
    TextView label = text("TARGET", 11, Color.LTGRAY);
    header.addView(label, weight(1));
    tripValue = text("READY", 11, Color.WHITE);
    header.addView(tripValue);
    header.setOnClickListener(v -> toggleMinimized());

    LinearLayout values = new LinearLayout(this);
    values.setGravity(Gravity.CENTER_VERTICAL);
    targetValue = text("—", 21, Color.WHITE);
    values.addView(targetValue, weight(1));
    achievedValue = text("₹0", 14, Color.LTGRAY);
    values.addView(achievedValue);

    LinearLayout stats = new LinearLayout(this);
    stats.setGravity(Gravity.CENTER_VERTICAL);
    liveKmsValue = text("LIVE KMS —", 11, Color.WHITE);
    stats.addView(liveKmsValue, weight(1));
    progressValue = text("0%", 11, Color.WHITE);
    stats.addView(progressValue);
    ridesValue = text("0 rides", 11, Color.LTGRAY);
    stats.addView(ridesValue);

    root.addView(header);
    root.addView(values);
    stats.addView(text("TRIP ", 10, Color.LTGRAY));
    root.addView(stats);

    LinearLayout endRide = new LinearLayout(this);
    endRide.setGravity(Gravity.CENTER_VERTICAL);
    TextView endLabel = text("END RIDE  •  FARE / TOLL / PARKING", 10, Color.WHITE);
    endLabel.setGravity(Gravity.CENTER);
    GradientDrawable endBg = new GradientDrawable();
    endBg.setColor(Color.argb(120, 180, 70, 45));
    endBg.setCornerRadius(dp(14));
    endLabel.setBackground(endBg);
    endLabel.setPadding(dp(10), dp(8), dp(10), dp(8));
    endLabel.setContentDescription("End ride and enter fare, toll and parking in KFE");
    endLabel.setOnClickListener(v -> launchKfe());
    endRide.addView(endLabel, new LinearLayout.LayoutParams(-1, dp(40)));
    root.addView(endRide);

    shell.addView(root, new LinearLayout.LayoutParams(dp(292), LinearLayout.LayoutParams.WRAP_CONTENT));

    overlayView = shell;
    params = new WindowManager.LayoutParams(
      dp(292),
      WindowManager.LayoutParams.WRAP_CONTENT,
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
        ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        : WindowManager.LayoutParams.TYPE_PHONE,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT
    );
    params.gravity = Gravity.TOP | Gravity.END;
    params.x = dp(10);
    params.y = dp(72);

    try {
      windowManager.addView(overlayView, params);
    } catch (WindowManager.BadTokenException | SecurityException ignored) {
      overlayView = null;
    }
  }

  private boolean handleSwipe(View view, MotionEvent event) {
    switch (event.getActionMasked()) {
      case MotionEvent.ACTION_DOWN:
        downX = event.getRawX();
        downY = event.getRawY();
        originX = params.x;
        originY = params.y;
        dragGesture = false;
        return true;
      case MotionEvent.ACTION_MOVE:
        float dx = event.getRawX() - downX;
        float dy = event.getRawY() - downY;
        dragGesture = Math.abs(dx) > dp(10) || Math.abs(dy) > dp(10);
        if (dragGesture) {
          params.x = Math.max(0, Math.round(originX - dx));
          params.y = Math.max(dp(24), Math.round(originY + dy));
          try { windowManager.updateViewLayout(overlayView, params); } catch (Exception ignored) {}
        }
        return true;
      case MotionEvent.ACTION_UP:
        float finalDx = event.getRawX() - downX;
        float finalDy = event.getRawY() - downY;
        if (finalDy < -dp(MINIMIZE_TRIGGER_DP)) {
          minimized = true;
          updateMinimizedView();
        } else if (!dragGesture && Math.abs(finalDx) < dp(12) && Math.abs(finalDy) < dp(12)) {
          launchKfe();
        }
        dragGesture = false;
        return true;
      case MotionEvent.ACTION_CANCEL:
        dragGesture = false;
        return true;
      default:
        return false;
    }
  }

  private void toggleMinimized() {
    minimized = !minimized;
    updateMinimizedView();
  }

  private void updateMinimizedView() {
    if (overlayView == null) return;
    View targetPanel = ((LinearLayout) overlayView).getChildAt(1);
    if (targetPanel != null) targetPanel.setVisibility(minimized ? View.GONE : View.VISIBLE);
    params.height = minimized ? dp(48) : WindowManager.LayoutParams.WRAP_CONTENT;
    try { windowManager.updateViewLayout(overlayView, params); } catch (Exception ignored) {}
  }

  private void launchKfe() {
    Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
    if (launch != null) {
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
      startActivity(launch);
    }
  }

  private void updateState(Intent intent) {
    if (overlayView == null) return;
    double target = intent.getDoubleExtra("target", Double.NaN);
    double achieved = intent.getDoubleExtra("achieved", 0);
    double liveKms = intent.getDoubleExtra("liveKms", Double.NaN);
    double progress = intent.getDoubleExtra("progress", 0);
    int rides = intent.getIntExtra("rides", 0);
    boolean tripActive = intent.getBooleanExtra("tripActive", false);
    String timer = intent.getStringExtra("tripTimer");

    targetValue.setText(Double.isNaN(target) ? "—" : money(target));
    achievedValue.setText(money(achieved));
    liveKmsValue.setText(Double.isNaN(liveKms) ? "LIVE KMS —" : String.format(Locale.US, "LIVE KMS %.1f", liveKms));
    progressValue.setText(String.format(Locale.US, "%.0f%%", Math.max(0, Math.min(100, progress))));
    ridesValue.setText(rides + " rides");
    tripValue.setText(tripActive ? (timer == null || timer.isEmpty() ? "ON TRIP" : timer) : "READY");
  }

  private String money(double value) {
    return String.format(Locale.US, "₹%.0f", value);
  }

  private Notification buildNotification() {
    Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
    PendingIntent pending = launch == null ? null : PendingIntent.getActivity(
      this, 4202, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    return new NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle("KFE floating overlay")
      .setContentText("KFE Target and live KM stay available over other apps.")
      .setOngoing(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setContentIntent(pending)
      .build();
  }

  private void createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager == null) return;
    NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "KFE Floating Overlay", NotificationManager.IMPORTANCE_LOW);
    channel.setDescription("Keeps the KFE driver overlay active while KFE is in the background.");
    manager.createNotificationChannel(channel);
  }

  private TextView text(String value, float sp, int color) {
    TextView view = new TextView(this);
    view.setText(value);
    view.setTextColor(color);
    view.setTextSize(sp);
    view.setIncludeFontPadding(false);
    return view;
  }

  private LinearLayout.LayoutParams weight(int value) {
    return new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, value);
  }

  private int dp(int value) {
    return Math.round(value * getResources().getDisplayMetrics().density);
  }

  private void removeOverlay() {
    if (overlayView != null) {
      try { windowManager.removeView(overlayView); } catch (Exception ignored) {}
      overlayView = null;
    }
  }

  @Override public void onDestroy() {
    removeOverlay();
    super.onDestroy();
  }

  @Override public IBinder onBind(Intent intent) { return null; }
}
