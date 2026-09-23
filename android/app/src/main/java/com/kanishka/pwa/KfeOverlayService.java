package com.kanishka.pwa;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;

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
  private static final int BAR_DP = 81;
  private static final int COLLAPSED_TOTAL_DP = 158;
  private static final int EXPANDED_TOTAL_DP = 208;
  private static final int COLLAPSED_METRICS_DP = 50;
  private static final int EXPANDED_METRICS_DP = 100;
  private static final int BUBBLE_DP = 58;
  private static final int MINIMIZE_SWIPE_DP = 48;

  private WindowManager windowManager;
  private SwipeOverlayView overlay;
  private WindowManager.LayoutParams params;
  private String actionStage = "GO_TO_PICKUP";
  private String theme = "light";
  private String target = "—";
  private String rides = "0";
  private String liveKm = "0.0 km";
  private String revenue = "₹0";
  private boolean targetExpanded = false;
  private boolean minimized = false;

  public static void prepare(Context context){ Intent i=new Intent(context,KfeOverlayService.class); i.setAction(ACTION_PREPARE); ContextCompat.startForegroundService(context,i); }
  public static void show(Context context,String state){ Intent i=new Intent(context,KfeOverlayService.class); i.setAction(ACTION_SHOW); i.putExtra(EXTRA_STATE,state==null?"{}":state); context.startService(i); }
  public static void update(Context context,String state){ Intent i=new Intent(context,KfeOverlayService.class); i.setAction(ACTION_UPDATE); i.putExtra(EXTRA_STATE,state==null?"{}":state); context.startService(i); }
  public static void hide(Context context){ Intent i=new Intent(context,KfeOverlayService.class); i.setAction(ACTION_HIDE); context.startService(i); }

  @Override public void onCreate(){ super.onCreate(); createChannel(); startForeground(NOTIFICATION_ID,buildNotification()); }
  @Override public int onStartCommand(Intent intent,int flags,int startId){
    if(intent==null)return START_NOT_STICKY;
    String action=intent.getAction();
    if(ACTION_HIDE.equals(action)){ removeOverlay(); stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); return START_NOT_STICKY; }
    if(!Settings.canDrawOverlays(this))return START_NOT_STICKY;
    if(ACTION_SHOW.equals(action)||ACTION_UPDATE.equals(action)){ ensureOverlay(); applyState(intent.getStringExtra(EXTRA_STATE)); }
    return START_NOT_STICKY;
  }
  private void ensureOverlay(){
    if(overlay!=null)return;
    windowManager=(WindowManager)getSystemService(WINDOW_SERVICE);
    params=new WindowManager.LayoutParams(WindowManager.LayoutParams.MATCH_PARENT,dp(COLLAPSED_TOTAL_DP),WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,PixelFormat.TRANSLUCENT);
    params.gravity=Gravity.TOP|Gravity.START;
    params.y=getSharedPreferences("kfe_overlay",MODE_PRIVATE).getInt("y",dp(120));
    overlay=new SwipeOverlayView(this);
    windowManager.addView(overlay,params);
  }
  private void applyState(String raw){
    if(overlay==null)return;
    try{
      JSONObject root=new JSONObject(raw==null?"{}":raw);
      JSONObject shift=root.optJSONObject("shift"), trip=root.optJSONObject("trip");
      if(shift==null||shift.optString("id","").isEmpty()){ removeOverlay(); return; }
      theme=root.optString("theme","light");
      target=root.optString("target","—");
      rides=root.optString("rides","0");
      liveKm=root.optString("liveKm","0.0 km");
      revenue=root.optString("revenue","₹0");
      String requested=root.optString("overlayAction","");
      actionStage=trip!=null&&!trip.optString("id","").isEmpty()?"END_RIDE":("START_RIDE".equals(requested)?"START_RIDE":"GO_TO_PICKUP");
      overlay.invalidate();
    }catch(Exception ignored){ actionStage="GO_TO_PICKUP"; overlay.invalidate(); }
  }
  private void triggerAction(){ KfeRideNotificationsPlugin.recordPendingAction(this,actionStage,"",""); }
  private void removeOverlay(){ if(windowManager!=null&&overlay!=null){try{windowManager.removeView(overlay);}catch(Exception ignored){}} overlay=null; }
  @Override public void onDestroy(){removeOverlay();super.onDestroy();}
  @Override public IBinder onBind(Intent intent){return null;}

  private Notification buildNotification(){return new NotificationCompat.Builder(this,CHANNEL_ID).setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("KFE overlay ready").setContentText("Driver overlay is ready for use above other apps.").setOngoing(true).setCategory(NotificationCompat.CATEGORY_SERVICE).build();}
  private void createChannel(){if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.O){NotificationManager m=(NotificationManager)getSystemService(Context.NOTIFICATION_SERVICE);if(m!=null)m.createNotificationChannel(new NotificationChannel(CHANNEL_ID,"KFE Overlay",NotificationManager.IMPORTANCE_LOW));}}
  private int dp(int v){return (int)(v*getResources().getDisplayMetrics().density+0.5f);}

  private class SwipeOverlayView extends View{
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG); private final RectF rect=new RectF();
    private float downX,downY,lastY; private boolean tracking,moving; private float progress;
    SwipeOverlayView(Context c){super(c);setLayerType(View.LAYER_TYPE_SOFTWARE,null);}
    private boolean dark(){return "dark".equals(theme)||"night".equals(theme)||"dusk".equals(theme);}
    private int surface(){return dark()?Color.rgb(23,30,38):Color.WHITE;}
    private int text(){return dark()?Color.rgb(232,237,242):Color.rgb(23,32,42);}
    private int muted(){return dark()?Color.rgb(170,180,191):Color.rgb(91,102,115);}
    private int actionColor(){if("END_RIDE".equals(actionStage))return dark()?Color.rgb(240,106,106):Color.rgb(198,40,40);if("START_RIDE".equals(actionStage))return dark()?Color.rgb(77,189,116):Color.rgb(22,128,60);return dark()?Color.rgb(91,141,239):Color.rgb(37,99,235);}
    private void text(float size,int color,boolean bold){paint.setStyle(Paint.Style.FILL);paint.setColor(color);paint.setTextSize(dp((int)size));paint.setTypeface(android.graphics.Typeface.create("sans-serif",bold?android.graphics.Typeface.BOLD:android.graphics.Typeface.NORMAL));}
    private void center(Canvas c,String s,float x,float y){c.drawText(s,x-paint.measureText(s)/2f,y,paint);}
    @Override protected void onDraw(Canvas c){
      super.onDraw(c); int w=getWidth(),h=getHeight(),a=actionColor();
      if(minimized){
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.argb(225,Color.red(surface()),Color.green(surface()),Color.blue(surface())));
        c.drawCircle(dp(BUBBLE_DP)/2f,dp(BUBBLE_DP)/2f,dp(29),paint);
        paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(dp(1));
        paint.setColor(Color.argb(55,Color.red(text()),Color.green(text()),Color.blue(text())));
        c.drawCircle(dp(BUBBLE_DP)/2f,dp(BUBBLE_DP)/2f,dp(28.5f),paint);
        text(17,a,true); center(c,"K",dp(BUBBLE_DP)/2f,dp(39));
        text(8,muted(),true); center(c,"KFE",dp(BUBBLE_DP)/2f,dp(51));
        return;
      }
      int metricsH=dp(targetExpanded?EXPANDED_METRICS_DP:COLLAPSED_METRICS_DP), gap=dp(6), barTop=metricsH+gap, barH=dp(BAR_DP);
      paint.setStyle(Paint.Style.FILL);
      paint.setColor(Color.argb(dark()?158:150,Color.red(surface()),Color.green(surface()),Color.blue(surface())));
      rect.set(0,0,w,metricsH); c.drawRoundRect(rect,dp(16),dp(16),paint);
      paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(dp(1));
      paint.setColor(Color.argb(45,Color.red(text()),Color.green(text()),Color.blue(text())));
      c.drawRoundRect(rect,dp(16),dp(16),paint);
      if(!targetExpanded){
        text(9,muted(),true); center(c,"TODAY'S TARGET",w*.42f,dp(18));
        text(17,text(),true); center(c,target,w*.42f,dp(39));
        text(11,muted(),true); center(c,"⌄",w*.88f,dp(31));
      }else{
        float col1=w*.20f,col2=w*.50f,col3=w*.80f;
        text(9,muted(),true); center(c,"RIDES",col1,dp(30));
        text(15,text(),true); center(c,rides,col1,dp(54));
        text(9,muted(),true); center(c,"REVENUE",col2,dp(30));
        text(15,text(),true); center(c,revenue,col2,dp(54));
        text(9,muted(),true); center(c,"LIVE KM",col3,dp(30));
        text(15,text(),true); center(c,liveKm,col3,dp(54));
        text(11,muted(),true); center(c,"⌃",w*.92f,dp(20));
      }
      paint.setStyle(Paint.Style.FILL);
      paint.setColor(Color.argb(150,Color.red(surface()),Color.green(surface()),Color.blue(surface())));
      rect.set(0,barTop,w,barTop+barH); c.drawRoundRect(rect,dp(15),dp(15),paint);
      paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(dp(1));
      paint.setColor(Color.argb(45,Color.red(text()),Color.green(text()),Color.blue(text())));
      c.drawRoundRect(rect,dp(15),dp(15),paint);
      paint.setStyle(Paint.Style.FILL);
      paint.setColor(Color.argb(progress>=.8f?72:36,Color.red(a),Color.green(a),Color.blue(a)));
      rect.set(0,barTop,w*progress,barTop+barH); c.drawRoundRect(rect,dp(15),dp(15),paint);
      int tw=dp(52),pad=dp(7); float tx=pad+(w-pad-tw-pad)*progress;
      paint.setColor(a); rect.set(tx,barTop+pad,tx+tw,barTop+barH-pad); c.drawRoundRect(rect,dp(11),dp(11),paint);
      text(19,Color.WHITE,true); center(c,"→",tx+tw/2f,barTop+barH/2f+dp(7));
      text(11,text(),true); center(c,"LIVE KM  "+liveKm+"   •   "+revenue,w/2f,barTop+barH/2f+dp(5));
      paint.setColor(Color.argb(80,Color.red(a),Color.green(a),Color.blue(a))); float marker=w*.80f; c.drawRoundRect(marker-dp(1.5f),barTop+dp(13),marker+dp(1.5f),barTop+dp(56),dp(2),dp(2),paint);
      text(7,muted(),true); center(c,"80%",marker,barTop+barH-dp(9));
      text(9,muted(),true); String hint=tracking&&progress>=.8f?"RELEASE TO CONFIRM":tracking?"KEEP SWIPING →":"SWIPE LEFT TO RIGHT"; center(c,hint,w/2f,barTop+barH+dp(15));
    }
    @Override public boolean onTouchEvent(MotionEvent e){
      switch(e.getActionMasked()){
        case MotionEvent.ACTION_DOWN:
          downX=e.getRawX();downY=e.getRawY();lastY=downY;tracking=true;moving=false;progress=0;return true;
        case MotionEvent.ACTION_MOVE:
          float dx=e.getRawX()-downX,dy=e.getRawY()-downY;
          if(!moving&&Math.abs(dy)>dp(10)&&Math.abs(dy)>Math.abs(dx))moving=true;
          if(moving){
            if(!minimized && dy < -dp(MINIMIZE_SWIPE_DP)){
              minimized=true; targetExpanded=false; params.width=dp(BUBBLE_DP); params.height=dp(BUBBLE_DP);
              params.x=Math.max(0,(getResources().getDisplayMetrics().widthPixels-dp(BUBBLE_DP))/2);
              params.y=Math.max(0,(int)e.getRawY()-dp(BUBBLE_DP)/2);
              if(windowManager!=null)windowManager.updateViewLayout(this,params);
              invalidate(); return true;
            }
            int maxY=Math.max(0,windowManager.getDefaultDisplay().getHeight()-getHeight());params.y=Math.max(0,Math.min(maxY,(int)(params.y+e.getRawY()-lastY)));lastY=e.getRawY();if(windowManager!=null)windowManager.updateViewLayout(this,params);getSharedPreferences("kfe_overlay",MODE_PRIVATE).edit().putInt("y",params.y).apply();
          }
          else{progress=Math.min(1f,Math.max(0f,dx)/(Math.max(1,getWidth())));invalidate();}return true;
        case MotionEvent.ACTION_UP:
          float fx=e.getRawX()-downX, fy=e.getRawY()-downY; tracking=false;
          if(minimized && !moving && Math.abs(fx)<dp(16) && Math.abs(fy)<dp(16)){
            minimized=false; params.width=WindowManager.LayoutParams.MATCH_PARENT; params.height=dp(COLLAPSED_TOTAL_DP);
            if(windowManager!=null)windowManager.updateViewLayout(this,params);
            invalidate(); return true;
          }
          if(!minimized && !moving && Math.abs(fx)<dp(12) && Math.abs(fy)<dp(12) && downY < dp(targetExpanded?EXPANDED_METRICS_DP:COLLAPSED_METRICS_DP)){
            targetExpanded=!targetExpanded;
            params.height=dp(targetExpanded?EXPANDED_TOTAL_DP:COLLAPSED_TOTAL_DP);
            if(windowManager!=null) windowManager.updateViewLayout(this,params);
            invalidate();
          }else if(!minimized&&!moving&&fx>=(getWidth()*.55f)){progress=1;invalidate();triggerAction();}
          else{progress=0;invalidate();}return true;
        case MotionEvent.ACTION_CANCEL:tracking=false;moving=false;progress=0;invalidate();return true;
      }return true;
    }
  }
}