package com.kanishka.pwa;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.PixelFormat;
import android.os.IBinder;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

public class KfeOverlayService extends Service {
  static final String ACTION_PREPARE="com.kanishka.pwa.KFE_OVERLAY_PREPARE";
  static final String ACTION_SHOW="com.kanishka.pwa.KFE_OVERLAY_SHOW";
  static final String ACTION_UPDATE="com.kanishka.pwa.KFE_OVERLAY_UPDATE";
  static final String ACTION_HIDE="com.kanishka.pwa.KFE_OVERLAY_HIDE";
  static final String EXTRA_STATE="state";
  private static final String CHANNEL_ID="kfe_overlay";
  private static final int NOTIFICATION_ID=4201;
  private static final int BAR_DP=82;
  private static final int COLLAPSED_TOTAL_DP=158;
  private static final int BUBBLE_DP=58;
  private static final int MINIMIZE_SWIPE_DP=48;

  private WindowManager windowManager;
  private FrameLayout overlayRoot;
  private SwipeOverlayView overlay;
  private WindowManager.LayoutParams params;
  private String actionStage="GO_TO_PICKUP";
  private String theme="light";
  private String target="—", rides="0", liveKm="0.0 km", revenue="₹0", pendingTripId="";
  private int targetProgress=0;
  private boolean minimized=false;
  private String formMode=null;
  private String formValue="";
  private boolean formSubmitting=false;
  private LinearLayout formPanel;

  public static void prepare(Context context){Intent i=new Intent(context,KfeOverlayService.class);i.setAction(ACTION_PREPARE);ContextCompat.startForegroundService(context,i);}
  public static void show(Context context,String state){Intent i=new Intent(context,KfeOverlayService.class);i.setAction(ACTION_SHOW);i.putExtra(EXTRA_STATE,state==null?"{}":state);context.startService(i);}
  public static void update(Context context,String state){Intent i=new Intent(context,KfeOverlayService.class);i.setAction(ACTION_UPDATE);i.putExtra(EXTRA_STATE,state==null?"{}":state);context.startService(i);}
  public static void hide(Context context){Intent i=new Intent(context,KfeOverlayService.class);i.setAction(ACTION_HIDE);context.startService(i);}

  @Override public void onCreate(){super.onCreate();createChannel();startForeground(NOTIFICATION_ID,buildNotification());}
  @Override public int onStartCommand(Intent intent,int flags,int startId){
    if(intent==null)return START_NOT_STICKY;
    String action=intent.getAction();
    if(ACTION_HIDE.equals(action)){removeOverlay();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();return START_NOT_STICKY;}
    if(!Settings.canDrawOverlays(this))return START_NOT_STICKY;
    if(ACTION_SHOW.equals(action)||ACTION_UPDATE.equals(action)){ensureOverlay();applyState(intent.getStringExtra(EXTRA_STATE));}
    return START_NOT_STICKY;
  }

  private void ensureOverlay(){
    if(overlay!=null)return;
    windowManager=(WindowManager)getSystemService(WINDOW_SERVICE);
    params=new WindowManager.LayoutParams(WindowManager.LayoutParams.MATCH_PARENT,dp(COLLAPSED_TOTAL_DP),WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,PixelFormat.TRANSLUCENT);
    params.gravity=Gravity.TOP|Gravity.START;
    params.y=getSharedPreferences("kfe_overlay",MODE_PRIVATE).getInt("y",dp(120));
    overlayRoot=new FrameLayout(this);
    overlay=new SwipeOverlayView(this);
    overlayRoot.addView(overlay,new FrameLayout.LayoutParams(-1,-1));
    windowManager.addView(overlayRoot,params);
  }

  private void applyState(String raw){
    if(overlay==null)return;
    try{
      JSONObject root=new JSONObject(raw==null?"{}":raw);
      JSONObject shift=root.optJSONObject("shift"),trip=root.optJSONObject("trip");
      if(shift==null||shift.optString("id","").isEmpty()){removeOverlay();return;}
      theme=root.optString("theme","light");
      target=root.optString("target","—");
      targetProgress=Math.max(0,Math.min(100,root.optInt("targetProgress",0)));
      rides=root.optString("rides","0");
      liveKm=root.optString("liveKm","0.0 km");
      revenue=root.optString("revenue","₹0");
      actionStage=root.optString("overlayAction","GO_TO_PICKUP");
      pendingTripId=root.optString("overlayTripId","");
      if(pendingTripId.isEmpty()&&trip!=null)pendingTripId=trip.optString("id","");
      if(formMode!=null){
        if(("ENTER_FARE".equals(actionStage)&&!"FARE".equals(formMode))||("CANCEL_RIDE".equals(actionStage)&&!"CANCEL".equals(formMode)))closeForm();
      }
      overlay.invalidate();
    }catch(Exception ignored){actionStage="GO_TO_PICKUP";overlay.invalidate();}
  }

  private void triggerAction(){
    if("END_RIDE".equals(actionStage)){KfeRideNotificationsPlugin.recordPendingAction(this,actionStage,pendingTripId,"");KfeRideNotificationsPlugin.emitAction(actionStage,pendingTripId,"");return;}
    if("START_RIDE".equals(actionStage)){KfeRideNotificationsPlugin.recordPendingAction(this,actionStage,pendingTripId,"");KfeRideNotificationsPlugin.emitAction(actionStage,pendingTripId,"");return;}
    if("GO_TO_PICKUP".equals(actionStage)){KfeRideNotificationsPlugin.recordPendingAction(this,actionStage,pendingTripId,"");KfeRideNotificationsPlugin.emitAction(actionStage,pendingTripId,"");}
  }

  private void openFareForm(){openNumericForm("FARE","TRIP FARE","Enter fare");}
  private void openCancelForm(){openNumericForm("CANCEL","CANCELLATION FEE","Enter fee or leave ₹0");}
  private void openNumericForm(String mode,String title,String hint){
    if(formMode!=null)return;
    formMode=mode;formValue="";formSubmitting=false;
    params.flags=WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;
    params.height=dp(310);
    if(windowManager!=null)windowManager.updateViewLayout(overlayRoot,params);

    formPanel=new LinearLayout(this);formPanel.setOrientation(LinearLayout.VERTICAL);formPanel.setPadding(dp(14),dp(8),dp(14),dp(8));
    TextView titleView=new TextView(this);titleView.setText(title);titleView.setTextSize(15);titleView.setTextColor(textColor());titleView.setGravity(Gravity.CENTER);
    formPanel.addView(titleView,new LinearLayout.LayoutParams(-1,dp(30)));
    TextView valueView=new TextView(this);valueView.setTag("value");valueView.setText("₹0");valueView.setTextSize(25);valueView.setTypeface(android.graphics.Typeface.DEFAULT,android.graphics.Typeface.BOLD);valueView.setTextColor(actionColor());valueView.setGravity(Gravity.CENTER);
    formPanel.addView(valueView,new LinearLayout.LayoutParams(-1,dp(42)));
    TextView hintView=new TextView(this);hintView.setText(hint);hintView.setTextSize(10);hintView.setTextColor(mutedColor());hintView.setGravity(Gravity.CENTER);
    formPanel.addView(hintView,new LinearLayout.LayoutParams(-1,dp(20)));
    LinearLayout grid=new LinearLayout(this);grid.setOrientation(LinearLayout.VERTICAL);
    String[][] keys={{"1","2","3"},{"4","5","6"},{"7","8","9"},{"C","0","⌫"}};
    for(String[] row:keys){LinearLayout line=new LinearLayout(this);line.setGravity(Gravity.CENTER);for(String key:row){Button b=keyButton(key);line.addView(b,new LinearLayout.LayoutParams(0,dp(40),1));}grid.addView(line,new LinearLayout.LayoutParams(-1,dp(42)));} 
    formPanel.addView(grid,new LinearLayout.LayoutParams(-1,dp(168)));
    LinearLayout actions=new LinearLayout(this);actions.setGravity(Gravity.CENTER);
    Button cancel=keyButton("CANCEL");cancel.setTextSize(11);cancel.setOnClickListener(v->closeForm());
    Button ok=keyButton("OK");ok.setTextSize(11);ok.setOnClickListener(v->submitNumericForm());
    actions.addView(cancel,new LinearLayout.LayoutParams(dp(105),dp(44)));actions.addView(ok,new LinearLayout.LayoutParams(dp(105),dp(44)));
    formPanel.addView(actions,new LinearLayout.LayoutParams(-1,dp(48)));
    overlayRoot.addView(formPanel,new FrameLayout.LayoutParams(-1,dp(300),Gravity.TOP));
  }

  private Button keyButton(String label){
    Button b=new Button(this);b.setText(label);b.setTextSize(15);b.setAllCaps(false);
    b.setOnClickListener(v->{
      if("C".contentEquals(b.getText())){formValue="";updateFormValue();return;}
      if("⌫".contentEquals(b.getText())){if(formValue.length()>0)formValue=formValue.substring(0,formValue.length()-1);updateFormValue();return;}
      if("CANCEL".contentEquals(b.getText())||"OK".contentEquals(b.getText()))return;
      if(formValue.length()<9)formValue+=b.getText().toString();updateFormValue();
    });return b;
  }
  private void updateFormValue(){if(formPanel==null)return;TextView v=formPanel.findViewWithTag("value");if(v!=null)v.setText("₹"+(formValue.isEmpty()?"0":formValue));}
  private void submitNumericForm(){
    if(formSubmitting||pendingTripId.isEmpty())return;
    double amount=0;try{amount=formValue.isEmpty()?0:Double.parseDouble(formValue);}catch(Exception e){return;}
    if(amount<0)return;formSubmitting=true;
    if("FARE".equals(formMode)){
      KfeRideNotificationsPlugin.recordPendingAction(this,"ENTER_FARE",pendingTripId,String.valueOf(amount));
      KfeRideNotificationsPlugin.emitAction("ENTER_FARE",pendingTripId,String.valueOf(amount));
    }else if("CANCEL".equals(formMode)){
      try{JSONObject input=new JSONObject();input.put("revenue",amount);input.put("reason","DRIVER_MISTAKE");KfeRideNotificationsPlugin.recordPendingAction(this,"CANCEL_RIDE",pendingTripId,input.toString());KfeRideNotificationsPlugin.emitAction("CANCEL_RIDE",pendingTripId,input.toString());}catch(Exception ignored){}
    }
    closeForm();
  }
  private void closeForm(){
    if(formPanel!=null&&overlayRoot!=null)overlayRoot.removeView(formPanel);
    formPanel=null;formMode=null;formValue="";formSubmitting=false;
    if(params!=null){params.height=dp(COLLAPSED_TOTAL_DP);params.flags=WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;if(windowManager!=null&&overlayRoot!=null)windowManager.updateViewLayout(overlayRoot,params);}
    if(overlay!=null)overlay.invalidate();
  }

  private int textColor(){return dark()?Color.rgb(235,240,245):Color.rgb(23,32,42);}
  private int mutedColor(){return dark()?Color.rgb(170,180,191):Color.rgb(91,102,115);}
  private int actionColor(){if("END_RIDE".equals(actionStage))return dark()?Color.rgb(255,110,110):Color.rgb(198,40,40);if("START_RIDE".equals(actionStage))return dark()?Color.rgb(70,205,120):Color.rgb(22,128,60);return dark()?Color.rgb(95,150,245):Color.rgb(37,99,235);}
  private boolean dark(){return "dark".equals(theme)||"night".equals(theme)||"dusk".equals(theme);}
  private void removeOverlay(){closeForm();if(windowManager!=null&&overlayRoot!=null){try{windowManager.removeView(overlayRoot);}catch(Exception ignored){}}overlayRoot=null;overlay=null;}
  @Override public void onDestroy(){removeOverlay();super.onDestroy();}
  @Override public IBinder onBind(Intent intent){return null;}
  private Notification buildNotification(){return new NotificationCompat.Builder(this,CHANNEL_ID).setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("KFE overlay ready").setContentText("Driver overlay is ready for use above other apps.").setOngoing(true).setCategory(NotificationCompat.CATEGORY_SERVICE).build();}
  private void createChannel(){if(android.os.Build.VERSION.SDK_INT>=android.os.Build.VERSION_CODES.O){NotificationManager m=(NotificationManager)getSystemService(Context.NOTIFICATION_SERVICE);if(m!=null)m.createNotificationChannel(new NotificationChannel(CHANNEL_ID,"KFE Overlay",NotificationManager.IMPORTANCE_LOW));}}
  private int dp(int v){return (int)(v*getResources().getDisplayMetrics().density+0.5f);}
  private float dpf(float v){return v*getResources().getDisplayMetrics().density;}

  private class SwipeOverlayView extends View{
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);private final RectF rect=new RectF();
    private float downX,downY,lastX,lastY;private boolean tracking,moving,swipeLocked;private float progress;
    SwipeOverlayView(Context c){super(c);setLayerType(View.LAYER_TYPE_SOFTWARE,null);}
    private int surface(){return dark()?Color.rgb(22,29,37):Color.WHITE;}
    @Override protected void onDraw(Canvas c){
      super.onDraw(c);int w=getWidth(),h=getHeight(),a=actionColor();if(minimized){paint.setStyle(Paint.Style.FILL);paint.setColor(Color.argb(235,Color.red(surface()),Color.green(surface()),Color.blue(surface())));c.drawCircle(dp(BUBBLE_DP)/2f,dp(BUBBLE_DP)/2f,dp(29),paint);paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(dp(1));paint.setColor(Color.argb(65,Color.red(textColor()),Color.green(textColor()),Color.blue(textColor())));c.drawCircle(dp(BUBBLE_DP)/2f,dp(BUBBLE_DP)/2f,dpf(28.5f),paint);text(18,a,true);center(c,"K",dp(BUBBLE_DP)/2f,dp(39));return;}
      int metricsH=dp(54),gap=dp(6),barTop=metricsH+gap,barH=dp(BAR_DP);
      paint.setStyle(Paint.Style.FILL);paint.setColor(Color.argb(dark()?180:165,Color.red(surface()),Color.green(surface()),Color.blue(surface())));rect.set(8,0,w-8,metricsH);c.drawRoundRect(rect,dp(18),dp(18),paint);
      paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(dp(1));paint.setColor(Color.argb(55,Color.red(textColor()),Color.green(textColor()),Color.blue(textColor())));c.drawRoundRect(rect,dp(18),dp(18),paint);
      text(9,mutedColor(),true);center(c,"TARGET",w*.20f,dp(18));text(18,targetColor(),true);center(c,target,w*.20f,dp(43));
      text(9,mutedColor(),true);center(c,"LIVE KM",w*.50f,dp(18));text(18,actionColor(),true);center(c,liveKm,w*.50f,dp(43));
      text(9,mutedColor(),true);center(c,"REVENUE",w*.80f,dp(18));text(18,textColor(),true);center(c,revenue,w*.80f,dp(43));
      paint.setStyle(Paint.Style.FILL);paint.setShadowLayer(dp(7),0,dp(3),Color.argb(60,0,0,0));setLayerType(View.LAYER_TYPE_SOFTWARE,null);paint.setColor(Color.argb(dark()?225:235,Color.red(surface()),Color.green(surface()),Color.blue(surface())));rect.set(8,barTop,w-8,barTop+barH);c.drawRoundRect(rect,dp(20),dp(20),paint);paint.clearShadowLayer();
      paint.setColor(Color.argb(55,Color.red(a),Color.green(a),Color.blue(a)));rect.set(8,barTop,(w-8)*progress+8,barTop+barH);c.drawRoundRect(rect,dp(20),dp(20),paint);
      int thumbW=dp(58),pad=dp(8);float tx=pad+(w-pad*2-thumbW)*progress;paint.setColor(a);rect.set(tx,barTop+pad,tx+thumbW,barTop+barH-pad);c.drawRoundRect(rect,dp(15),dp(15),paint);
      String stateLabel="GO TO PICKUP";if("START_RIDE".equals(actionStage))stateLabel="START RIDE";if("END_RIDE".equals(actionStage))stateLabel="END RIDE";float baseX=w/2f;String prefix="SWIPE TO ";text(11,mutedColor(),true);float total=paint.measureText(prefix)+dp(4)+measureAction(stateLabel,11);float start=baseX-total/2f;c.drawText(prefix,start,barTop+barH/2f+dp(5),paint);text(11,a,true);c.drawText(stateLabel,start+paint.measureText(prefix)+dp(4),barTop+barH/2f+dp(5),paint);
      text(9,a,true);center(c,"DRAG →",tx+thumbW/2f,barTop+barH-dp(10));
      if("END_RIDE".equals(actionStage)){paint.setStyle(Paint.Style.FILL);paint.setColor(Color.argb(235,dark()?90:245,dark()?35:245,dark()?35:245));c.drawCircle(w-dp(22),barTop+barH/2f,dp(17),paint);text(12,Color.WHITE,true);center(c,"×",w-dp(22),barTop+barH/2f+dp(5));}
    }
    private void text(float size,int color,boolean bold){paint.setStyle(Paint.Style.FILL);paint.setColor(color);paint.setTextSize(dp((int)size));paint.setTypeface(android.graphics.Typeface.create("sans-serif",bold?android.graphics.Typeface.BOLD:android.graphics.Typeface.NORMAL));}
    private void center(Canvas c,String s,float x,float y){c.drawText(s,x-paint.measureText(s)/2f,y,paint);}
    private float measureAction(String s,float size){paint.setTextSize(dp((int)size));return paint.measureText(s);}
    @Override public boolean onTouchEvent(MotionEvent e){
      switch(e.getActionMasked()){
        case MotionEvent.ACTION_DOWN:downX=e.getRawX();downY=e.getRawY();lastX=downX;lastY=downY;tracking=true;moving=false;swipeLocked=false;progress=0;return true;
        case MotionEvent.ACTION_MOVE:{float dx=e.getRawX()-downX,dy=e.getRawY()-downY;if(!swipeLocked&&!moving&&Math.hypot(dx,dy)>dp(10)){if(Math.abs(dx)>Math.abs(dy))swipeLocked=true;else moving=true;}if(moving){if(!minimized&&dy<-dp(MINIMIZE_SWIPE_DP)){minimized=true;params.width=dp(BUBBLE_DP);params.height=dp(BUBBLE_DP);int sw=getResources().getDisplayMetrics().widthPixels;params.x=e.getRawX()<sw/2f?0:Math.max(0,sw-dp(BUBBLE_DP));params.y=Math.max(0,(int)e.getRawY()-dp(BUBBLE_DP)/2);if(windowManager!=null)windowManager.updateViewLayout(overlayRoot,params);invalidate();return true;}int maxY=Math.max(0,windowManager.getDefaultDisplay().getHeight()-getHeight());params.y=Math.max(0,Math.min(maxY,(int)(params.y+e.getRawY()-lastY)));if(minimized){int sw=getResources().getDisplayMetrics().widthPixels;params.x=Math.max(0,Math.min(sw-getWidth(),(int)(params.x+e.getRawX()-lastX)));}lastY=e.getRawY();lastX=e.getRawX();if(windowManager!=null)windowManager.updateViewLayout(overlayRoot,params);getSharedPreferences("kfe_overlay",MODE_PRIVATE).edit().putInt("y",params.y).apply();}else{progress=Math.min(1f,Math.max(0f,dx)/Math.max(1,getWidth()));invalidate();}return true;}
        case MotionEvent.ACTION_UP:{float fx=e.getRawX()-downX,fy=e.getRawY()-downY;tracking=false;if(minimized&&!moving&&Math.abs(fx)<dp(16)&&Math.abs(fy)<dp(16)){minimized=false;params.width=WindowManager.LayoutParams.MATCH_PARENT;params.height=dp(COLLAPSED_TOTAL_DP);params.x=0;if(windowManager!=null)windowManager.updateViewLayout(overlayRoot,params);invalidate();return true;}if(!minimized&&!moving&&Math.abs(fx)<dp(12)&&Math.abs(fy)<dp(12)&&"END_RIDE".equals(actionStage)&&downX>getWidth()-dp(52)){openCancelForm();return true;}if(!minimized&&!moving&&swipeLocked&&fx>=getWidth()*.55f){progress=1;invalidate();if("END_RIDE".equals(actionStage)){openFareForm();KfeRideNotificationsPlugin.recordPendingAction(KfeOverlayService.this,"END_RIDE",pendingTripId,"");KfeRideNotificationsPlugin.emitAction("END_RIDE",pendingTripId,"");}else triggerAction();return true;}progress=0;invalidate();return true;}
        case MotionEvent.ACTION_CANCEL:tracking=false;moving=false;swipeLocked=false;progress=0;invalidate();return true;
      }return true;
    }
  }
}
