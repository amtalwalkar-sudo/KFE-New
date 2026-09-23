package com.kanishka.pwa;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
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
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

public class KfeOverlayService extends Service {
  static final String ACTION_PREPARE = "com.kanishka.pwa.KFE_OVERLAY_PREPARE";
  static final String ACTION_SHOW = "com.kanishka.pwa.KFE_OVERLAY_SHOW";
  static final String ACTION_UPDATE = "com.kanishka.pwa.KFE_OVERLAY_UPDATE";
  static final String ACTION_HIDE = "com.kanishka.pwa.KFE_OVERLAY_HIDE";
  static final String EXTRA_STATE = "state";

  private static final String CHANNEL_ID = "kfe_overlay";
  private static final int NOTIFICATION_ID = 4201;
  private static final int SWIPE_TRIGGER_DP = 88;

  private WindowManager windowManager;
  private View overlay;
  private WindowManager.LayoutParams params;
  private TextView title;
  private TextView status;
  private TextView metrics;
  private TextView actionBar;
  private String actionStage = "GO_TO_PICKUP";

  public static void prepare(Context context) {
    Intent intent = new Intent(context, KfeOverlayService.class);
    intent.setAction(ACTION_PREPARE);
    ContextCompat.startForegroundService(context, intent);
  }

  public static void show(Context context, String state) {
    Intent intent = new Intent(context, KfeOverlayService.class);
    intent.setAction(ACTION_SHOW);
    intent.putExtra(EXTRA_STATE, state == null ? "{}" : state);
    context.startService(intent);
  }

  public static void update(Context context, String state) {
    Intent intent = new Intent(context, KfeOverlayService.class);
    intent.setAction(ACTION_UPDATE);
    intent.putExtra(EXTRA_STATE, state == null ? "{}" : state);
    context.startService(intent);
  }

  public static void hide(Context context) {
    Intent intent = new Intent(context, KfeOverlayService.class);
    intent.setAction(ACTION_HIDE);
    context.startService(intent);
  }

  @Override
  public void onCreate() {
    super.onCreate();
    createChannel();
    startForeground(NOTIFICATION_ID, buildNotification());
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    if (intent == null) return START_NOT_STICKY;
    String action = intent.getAction();
    if (ACTION_HIDE.equals(action)) {
      removeOverlay();
      stopForeground(STOP_FOREGROUND_REMOVE);
      stopSelf();
      return START_NOT_STICKY;
    }
    if (!Settings.canDrawOverlays(this)) return START_NOT_STICKY;
    if (ACTION_SHOW.equals(action) || ACTION_UPDATE.equals(action)) {
      ensureOverlay();
      applyState(intent.getStringExtra(EXTRA_STATE));
    }
    return START_NOT_STICKY;
  }

  private void ensureOverlay() {
    if (overlay != null || windowManager == null && getSystemService(WINDOW_SERVICE) == null) return;

    windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
    params = new WindowManager.LayoutParams(
      dp(220), WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT
    );
    params.gravity = Gravity.TOP | Gravity.START;
    params.x = dp(12);
    params.y = dp(120);

    LinearLayout card = new LinearLayout(this);
    card.setOrientation(LinearLayout.VERTICAL);
    card.setPadding(dp(12), dp(8), dp(10), dp(10));
    GradientDrawable background = new GradientDrawable();
    background.setColor(Color.argb(238, 24, 24, 27));
    background.setCornerRadius(dp(18));
    card.setBackground(background);
    card.setElevation(dp(8));

    LinearLayout header = new LinearLayout(this);
    header.setGravity(Gravity.CENTER_VERTICAL);

    title = text("KFE", 14, Color.WHITE);
    header.addView(title, new LinearLayout.LayoutParams(0, dp(28), 1));

    TextView minimize = text("−", 22, Color.WHITE);
    minimize.setGravity(Gravity.CENTER);
    header.addView(minimize, new LinearLayout.LayoutParams(dp(34), dp(34)));
    minimize.setOnClickListener(v -> removeOverlay());
    card.addView(header);

    status = text("Ready", 12, Color.LTGRAY);
    card.addView(status);

    metrics = text("Target —  •  Live KM —\nRides —", 12, Color.WHITE);
    metrics.setPadding(0, dp(3), 0, dp(6));
    card.addView(metrics);

    actionBar = text("Swipe to go to pickup  →", 11, Color.WHITE);
    actionBar.setGravity(Gravity.CENTER_VERTICAL);
    actionBar.setPadding(dp(12), 0, dp(12), 0);
    actionBar.setSingleLine(true);
    actionBar.setEllipsize(android.text.TextUtils.TruncateAt.END);
    card.addView(actionBar, new LinearLayout.LayoutParams(-1, dp(40)));

    View.OnTouchListener swipe = new View.OnTouchListener() {
      float startX;
      boolean tracking;

      @Override public boolean onTouch(View v, MotionEvent event) {
        switch (event.getActionMasked()) {
          case MotionEvent.ACTION_DOWN:
            startX = event.getRawX();
            tracking = true;
            v.setAlpha(0.78f);
            return true;
          case MotionEvent.ACTION_MOVE:
            if (!tracking) return true;
            float distance = Math.max(0f, event.getRawX() - startX);
            float progress = Math.min(1f, distance / Math.max(dp(120), v.getWidth() * 0.55f));
            v.setAlpha(0.55f + (0.45f * progress));
            return true;
          case MotionEvent.ACTION_UP:
            if (!tracking) return true;
            float completed = event.getRawX() - startX;
            tracking = false;
            v.setAlpha(1f);
            if (completed >= Math.max(dp(SWIPE_TRIGGER_DP), v.getWidth() * 0.55f)) {
              triggerAction();
            }
            return true;
          case MotionEvent.ACTION_CANCEL:
            tracking = false;
            v.setAlpha(1f);
            return true;
          default:
            return true;
        }
      }
    };
    actionBar.setOnTouchListener(swipe);

    View.OnTouchListener drag = new View.OnTouchListener() {
      int initialX, initialY;
      float touchX, touchY;
      boolean moved;

      @Override public boolean onTouch(View v, MotionEvent event) {
        switch (event.getActionMasked()) {
          case MotionEvent.ACTION_DOWN:
            initialX = params.x;
            initialY = params.y;
            touchX = event.getRawX();
            touchY = event.getRawY();
            moved = false;
            return true;
          case MotionEvent.ACTION_MOVE:
            int dx = (int) (event.getRawX() - touchX);
            int dy = (int) (event.getRawY() - touchY);
            if (Math.abs(dx) + Math.abs(dy) > dp(6)) moved = true;
            params.x = initialX + dx;
            params.y = initialY + dy;
            if (windowManager != null && overlay != null) windowManager.updateViewLayout(overlay, params);
            return true;
          case MotionEvent.ACTION_UP:
            if (!moved) openKfe();
            return true;
          default:
            return false;
        }
      }
    };
    card.setOnTouchListener(drag);
    overlay = card;
    windowManager.addView(overlay, params);
  }

  private void applyState(String raw) {
    if (status == null || metrics == null || actionBar == null) return;
    try {
      JSONObject root = new JSONObject(raw == null ? "{}" : raw);
      JSONObject shift = root.optJSONObject("shift");
      JSONObject trip = root.optJSONObject("trip");
      boolean activeShift = shift != null && shift.optString("id", "").length() > 0;
      boolean activeTrip = trip != null && trip.optString("id", "").length() > 0;
      status.setText(activeTrip ? "Trip active" : activeShift ? "Shift active" : "KFE");

      String target = root.optString("target", "—");
      String liveKm = root.optString("liveKm", "0.0 km");
      String rides = root.optString("rides", "0");
      metrics.setText("Target " + target + "  •  Live KM " + liveKm + "\nRides " + rides);

      String requestedStage = root.optString("overlayAction", "");
      if (activeTrip) {
        actionStage = "END_RIDE";
      } else if ("START_RIDE".equals(requestedStage)) {
        actionStage = "START_RIDE";
      } else {
        actionStage = "GO_TO_PICKUP";
      }
      updateActionBar();
    } catch (Exception ignored) {
      status.setText("KFE");
      metrics.setText("Target —  •  Live KM 0.0 km\nRides 0");
      actionStage = "GO_TO_PICKUP";
      updateActionBar();
    }
  }

  private void updateActionBar() {
    if (actionBar == null) return;
    String label;
    int backgroundColor;
    if ("END_RIDE".equals(actionStage)) {
      label = "Swipe to end trip  →";
      backgroundColor = Color.rgb(190, 54, 54);
    } else if ("START_RIDE".equals(actionStage)) {
      label = "Swipe to start trip  →";
      backgroundColor = Color.rgb(32, 112, 196);
    } else {
      label = "Swipe to go to pickup  →";
      backgroundColor = Color.rgb(32, 112, 196);
    }
    GradientDrawable bar = new GradientDrawable();
    bar.setColor(backgroundColor);
    bar.setCornerRadius(dp(20));
    actionBar.setBackground(bar);
    actionBar.setText(label);
  }

  private void triggerAction() {
    KfeRideNotificationsPlugin.recordPendingAction(this, actionStage, "", "");
    openKfe();
  }

  private void openKfe() {
    Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
    if (intent != null) {
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
      startActivity(intent);
    }
  }

  private void removeOverlay() {
    if (windowManager != null && overlay != null) {
      try { windowManager.removeView(overlay); } catch (Exception ignored) {}
    }
    overlay = null;
    title = null;
    status = null;
    metrics = null;
    actionBar = null;
  }

  @Override public void onDestroy() {
    removeOverlay();
    super.onDestroy();
  }

  @Override public IBinder onBind(Intent intent) { return null; }

  private Notification buildNotification() {
    return new NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle("KFE overlay ready")
      .setContentText("Driver overlay is ready for use above other apps.")
      .setOngoing(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .build();
  }

  private void createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager != null) {
      manager.createNotificationChannel(new NotificationChannel(
        CHANNEL_ID, "KFE Overlay", NotificationManager.IMPORTANCE_LOW
      ));
    }
  }

  private TextView text(String value, int size, int color) {
    TextView view = new TextView(this);
    view.setText(value);
    view.setTextSize(size);
    view.setTextColor(color);
    return view;
  }

  private int dp(int value) {
    return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
  }
}