package com.kanishka.pwa;

import android.animation.ValueAnimator;
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
import android.graphics.drawable.ColorDrawable;
import android.graphics.PixelFormat;
import android.os.IBinder;
import android.provider.Settings;
import android.view.Gravity;
import android.view.inputmethod.InputMethodManager;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

public class KfeOverlayService extends Service {
  static volatile KfeOverlayService instance;
  static final String ACTION_PREPARE="com.kanishka.pwa.KFE_OVERLAY_PREPARE";
  static final String ACTION_SHOW="com.kanishka.pwa.KFE_OVERLAY_SHOW";
  static final String ACTION_UPDATE="com.kanishka.pwa.KFE_OVERLAY_UPDATE";
  static final String ACTION_HIDE="com.kanishka.pwa.KFE_OVERLAY_HIDE";
  static final String ACTION_MINIMIZE="com.kanishka.pwa.KFE_OVERLAY_MINIMIZE";
  static final String ACTION_FARE_SAVED="com.kanishka.pwa.KFE_OVERLAY_FARE_SAVED";
  static final String ACTION_CANCEL_SAVED="com.kanishka.pwa.KFE_OVERLAY_CANCEL_SAVED";
  static final String EXTRA_STATE="state";
  private static final String CHANNEL_ID="kfe_overlay";
  private static final int NOTIFICATION_ID=4201;
  private static final String LAST_STATE_KEY="lastOverlayState";
  private static final int BAR_DP=82;
  private static final int COLLAPSED_TOTAL_DP=158;
  private static final int BUBBLE_DP=58;
  private static final int MINIMIZE_SWIPE_DP=48;

  private WindowManager windowManager;
  private FrameLayout overlayRoot;
  private SwipeOverlayView overlay;
  private WindowManager.LayoutParams params;
  private String actionStage="GO_TO_PICKUP";
  private EditText formInput;
  private EditText tollInput;
  private EditText parkingInput;
  private String theme="light";
  private String target="—", rides="0", liveKm="0.0 km", revenue="₹0", pendingTripId="", pendingFareTripId="", cancellationRevenue="₹0";
  private long tripStartAt=0L;
  private int targetProgress=0;
  private boolean minimized=false;
  private String formMode=null;
  private String formValue="";
  private String tollValue="";
  private String parkingValue="";
  private String activeAmountField="fare";
  private String cancelReason="";
  private boolean formSubmitting=false;
  private String awaitingEventId="";
  private String awaitingStage="";
  private String awaitingTripId="";
  private LinearLayout formPanel;
  private android.os.Handler foregroundHandler;
  private final Runnable foregroundCheck=new Runnable(){
    @Override public void run(){
      hideIfKfeActivityForeground();
      if(foregroundHandler!=null) foregroundHandler.postDelayed(this,500L);
    }
  };

  static void updateLiveKm(String value){
    KfeOverlayService current=instance;
    if(current==null)return;
    current.liveKm=value==null?"0.0 km":value;
    if(current.overlay!=null)current.overlay.postInvalidate();
  }

  static String resolveFareActionTripId(String pendingFareTripId, String currentTripId){
    if(pendingFareTripId!=null&&!pendingFareTripId.isEmpty())return pendingFareTripId;
    return currentTripId==null?"":currentTripId;
  }

  public static void prepare(Context context){Intent i=new Intent(context,KfeOverlayService.class);i.setAction(ACTION_PREPARE);ContextCompat.startForegroundService(context,i);}
  public static void show(Context context,String state){Intent i=new Intent(context,KfeOverlayService.class);i.setAction(ACTION_SHOW);i.putExtra(EXTRA_STATE,state==null?"{}":state);context.startService(i);}
  public static void update(Context context,String state){Intent i=new Intent(context,KfeOverlayService.class);i.setAction(ACTION_UPDATE);i.putExtra(EXTRA_STATE,state==null?"{}":state);context.startService(i);}
  public static void hide(Context context){Intent i=new Intent(context,KfeOverlayService.class);i.setAction(ACTION_HIDE);context.startService(i);}

  @Override public void onCreate(){super.onCreate();instance=this;
    android.content.SharedPreferences saved=getSharedPreferences("kfe_overlay",MODE_PRIVATE);
    actionStage=saved.getString("actionStage","GO_TO_PICKUP");
    minimized=saved.getBoolean("minimized",false);
    pendingTripId=saved.getString("pendingTripId","");
    pendingFareTripId=saved.getString("pendingFareTripId","");
    awaitingEventId=saved.getString("awaitingEventId","");
    awaitingStage=saved.getString("awaitingStage","");
    awaitingTripId=saved.getString("awaitingTripId","");
    if(!awaitingEventId.isEmpty() && KfeNativeEventStore.get(this).isAcknowledged(awaitingEventId)){
      onEventAcknowledged(awaitingEventId,awaitingStage,awaitingTripId);
    }
    createChannel();startForeground(NOTIFICATION_ID,buildNotification());foregroundHandler=new android.os.Handler(getMainLooper());foregroundHandler.post(foregroundCheck);
  }
  @Override public int onStartCommand(Intent intent,int flags,int startId){
    if(intent==null){
      if(Settings.canDrawOverlays(this)){
        String saved=getSharedPreferences("kfe_overlay",MODE_PRIVATE).getString(LAST_STATE_KEY,"");
        if(!saved.isEmpty()){ensureOverlay();applyState(saved);}
      }
      return START_STICKY;
    }
    String action=intent.getAction();
    if(ACTION_HIDE.equals(action)){removeOverlay();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();return START_NOT_STICKY;}
    if(ACTION_MINIMIZE.equals(action)){minimizeToBubble();return START_STICKY;}
    if(ACTION_FARE_SAVED.equals(action)){onFareSaved();return START_NOT_STICKY;}
    if(ACTION_CANCEL_SAVED.equals(action)){onCancelSaved();return START_NOT_STICKY;}
    if(!Settings.canDrawOverlays(this))return START_NOT_STICKY;
    if(ACTION_SHOW.equals(action)||ACTION_UPDATE.equals(action)){ensureOverlay();applyState(intent.getStringExtra(EXTRA_STATE));}
    return START_STICKY;
  }

  private void ensureOverlay(){
    if(overlay!=null)return;
    windowManager=(WindowManager)getSystemService(WINDOW_SERVICE);
    params=new WindowManager.LayoutParams(WindowManager.LayoutParams.MATCH_PARENT,dp(COLLAPSED_TOTAL_DP),WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,PixelFormat.TRANSLUCENT);
    params.gravity=Gravity.TOP|Gravity.START;
    android.content.SharedPreferences saved=getSharedPreferences("kfe_overlay",MODE_PRIVATE);
    minimized=saved.getBoolean("minimized",false);
    int screenWidth=getResources().getDisplayMetrics().widthPixels;
    params.width=minimized?dp(BUBBLE_DP):WindowManager.LayoutParams.MATCH_PARENT;
    params.height=minimized?dp(BUBBLE_DP):dp(COLLAPSED_TOTAL_DP);
    int savedX=saved.getInt("x",0);
    params.x=minimized?Math.max(0,Math.min(Math.max(0,screenWidth-dp(BUBBLE_DP)),savedX)):0;
    params.y=saved.getInt("y",dp(120));
    if(minimized) params.y=Math.max(0,Math.min(Math.max(0,windowManager.getDefaultDisplay().getHeight()-dp(BUBBLE_DP)),params.y));
    overlayRoot=new FrameLayout(this);
    overlay=new SwipeOverlayView(this);
    overlayRoot.addView(overlay,new FrameLayout.LayoutParams(-1,-1));
    windowManager.addView(overlayRoot,params);
  }

  private void applyState(String raw){
    if(overlay==null)return;
    if(raw!=null&&!raw.isEmpty())getSharedPreferences("kfe_overlay",MODE_PRIVATE).edit().putString(LAST_STATE_KEY,raw).apply();
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
      cancellationRevenue=root.optString("cancellationRevenue","₹0");
      tripStartAt=root.optLong("tripStartAt",0L);
      String previousActionStage=actionStage;
      String nextActionStage=root.optString("overlayAction",actionStage);
      if(awaitingEventId.isEmpty()) actionStage=nextActionStage;
      if(!actionStage.equals(previousActionStage) && !"ENTER_FARE".equals(actionStage)) animateRetract();
      if(awaitingEventId.isEmpty()){
        pendingTripId=root.optString("overlayTripId","");
        if(pendingTripId.isEmpty()&&trip!=null)pendingTripId=trip.optString("id","");
      }
      if(awaitingEventId.isEmpty()) pendingFareTripId=root.optString("pendingFareId","");
      if(formMode!=null){
        if((("ENTER_FARE".equals(actionStage)||"END_RIDE".equals(actionStage))&&!"FARE".equals(formMode))||("CANCEL_RIDE".equals(actionStage)&&!"CANCEL".equals(formMode)))closeForm();
      }
      if(formMode==null && "ENTER_FARE".equals(actionStage)) openFareForm();
      overlay.invalidate();
    }catch(Exception ignored){ overlay.invalidate(); }
  }

  private void onCancelSaved(){formSubmitting=false;closeForm();actionStage="GO_TO_PICKUP";pendingTripId="";pendingFareTripId="";tripStartAt=0L;awaitingEventId="";awaitingStage="";awaitingTripId="";persistNativeWorkflow();KfeRideNotificationsPlugin.cancelNotification(this);if(overlay!=null)overlay.invalidate();}

  private void onFareSaved(){
    formSubmitting=false;
    closeForm();
    actionStage="GO_TO_PICKUP";
    pendingTripId="";
    pendingFareTripId="";
    tripStartAt=0L;
    persistNativeWorkflow();
    KfeRideNotificationsPlugin.cancelNotification(this);
    animateRetract();
    if(overlay!=null) overlay.invalidate();
  }

  private void animateRetract(){
    if(overlay!=null) overlay.animateProgressToZero();
  }

  private void triggerAction(){
    // Keep the visible native action on the current canonical stage until the
    // PWA acknowledges the durable event. This prevents native/PWA divergence
    // when the WebView is slow, unavailable, or rejects the action.
    if("GO_TO_PICKUP".equals(actionStage)){
      if(!awaitingEventId.isEmpty()) return;
      if(pendingTripId.isEmpty()) pendingTripId=java.util.UUID.randomUUID().toString();
      String eventId=KfeRideNotificationsPlugin.recordPendingAction(this,"GO_TO_PICKUP",pendingTripId,"");
      beginAwaiting(eventId,"GO_TO_PICKUP",pendingTripId); persistNativeWorkflow(); animateRetract(); overlay.invalidate();
      KfeRideNotificationsPlugin.emitAction("GO_TO_PICKUP",pendingTripId,"",eventId); return;
    }
    if("START_RIDE".equals(actionStage)){
      if(!awaitingEventId.isEmpty() || pendingTripId.isEmpty()) return;
      String eventId=KfeRideNotificationsPlugin.recordPendingAction(this,"START_RIDE",pendingTripId,"");
      beginAwaiting(eventId,"START_RIDE",pendingTripId); persistNativeWorkflow(); animateRetract(); overlay.invalidate();
      KfeRideNotificationsPlugin.emitAction("START_RIDE",pendingTripId,"",eventId); return;
    }
    if("END_RIDE".equals(actionStage)){
      if(!awaitingEventId.isEmpty() || pendingTripId.isEmpty()) return;
      String eventId=KfeRideNotificationsPlugin.recordPendingAction(this,"END_RIDE",pendingTripId,"");
      beginAwaiting(eventId,"END_RIDE",pendingTripId); persistNativeWorkflow(); animateRetract(); overlay.invalidate();
      KfeRideNotificationsPlugin.emitAction("END_RIDE",pendingTripId,"",eventId);
    }
  }

  private void beginAwaiting(String eventId,String stage,String tripId){ awaitingEventId=eventId==null?"":eventId; awaitingStage=stage==null?"":stage; awaitingTripId=tripId==null?"":tripId; }

  static void acknowledgeFromPwa(Context context,String eventId,String stage,String tripId){
    KfeOverlayService current=instance;
    if(current==null)return;
    if(android.os.Looper.myLooper()==current.getMainLooper()){
      current.onEventAcknowledged(eventId,stage,tripId);
      return;
    }
    current.getMainHandler().post(()->current.onEventAcknowledged(eventId,stage,tripId));
  }

  private android.os.Handler getMainHandler(){
    if(foregroundHandler==null) foregroundHandler=new android.os.Handler(getMainLooper());
    return foregroundHandler;
  }

  private void onEventAcknowledged(String eventId,String stage,String tripId){
    if(eventId==null || !eventId.equals(awaitingEventId)) return;
    awaitingEventId=""; awaitingStage=""; awaitingTripId="";
    if("GO_TO_PICKUP".equals(stage)){ actionStage="START_RIDE"; pendingFareTripId=""; persistNativeWorkflow(); animateRetract(); if(overlay!=null)overlay.invalidate(); return; }
    if("START_RIDE".equals(stage)){ actionStage="END_RIDE"; persistNativeWorkflow(); animateRetract(); if(overlay!=null)overlay.invalidate(); return; }
    if("END_RIDE".equals(stage)){ pendingFareTripId=tripId; pendingTripId=tripId; actionStage="ENTER_FARE"; persistNativeWorkflow(); KfeNativeGpsService.stop(this,tripId); if(overlay!=null)openFareForm(); if(overlay!=null)overlay.invalidate(); return; }
    if("ENTER_FARE".equals(stage) || "CANCEL_RIDE".equals(stage)){ closeForm(); actionStage="GO_TO_PICKUP"; pendingTripId=""; pendingFareTripId=""; tripStartAt=0L; persistNativeWorkflow(); animateRetract(); if(overlay!=null)overlay.invalidate(); }
  }

  private void persistNativeWorkflow(){
    android.content.SharedPreferences prefs=getSharedPreferences("kfe_overlay",MODE_PRIVATE);
    android.content.SharedPreferences.Editor editor=prefs.edit()
      .putString("actionStage",actionStage)
      .putString("pendingTripId",pendingTripId)
      .putString("pendingFareTripId",pendingFareTripId)
      .putString("awaitingEventId",awaitingEventId)
      .putString("awaitingStage",awaitingStage)
      .putString("awaitingTripId",awaitingTripId);
    String raw=prefs.getString(LAST_STATE_KEY,"");
    if(!raw.isEmpty()){
      try{
        JSONObject state=new JSONObject(raw);
        state.put("overlayAction",actionStage);
        state.put("overlayTripId",pendingTripId);
        state.put("pendingFareId",pendingFareTripId);
        editor.putString(LAST_STATE_KEY,state.toString());
      }catch(Exception ignored){}
    }
    editor.apply();
  }

  private void hideIfKfeActivityForeground(){
    // When the PWA is foreground, keep the native surface alive as a bubble.
    // This preserves the active native workflow and avoids recreating an
    // expanded MATCH_PARENT window at a stale horizontal offset.
    if(MainActivity.isResumed && overlay!=null && !formModeIsOpen()) minimizeToBubble();
  }

  private boolean formModeIsOpen(){ return formMode!=null; }

  private void minimizeToBubble(){
    if(overlayRoot==null || params==null) return;
    if(minimized && params.width==dp(BUBBLE_DP) && params.height==dp(BUBBLE_DP)) return;
    minimized=true;
    int screenWidth=getResources().getDisplayMetrics().widthPixels;
    params.width=dp(BUBBLE_DP);
    params.height=dp(BUBBLE_DP);
    params.x=Math.max(0,Math.min(Math.max(0,screenWidth-dp(BUBBLE_DP)),params.x));
    params.y=Math.max(0,Math.min(Math.max(0,windowManager.getDefaultDisplay().getHeight()-dp(BUBBLE_DP)),params.y));
    getSharedPreferences("kfe_overlay",MODE_PRIVATE).edit().putBoolean("minimized",true).putInt("x",params.x).putInt("y",params.y).apply();
    if(windowManager!=null) windowManager.updateViewLayout(overlayRoot,params);
    if(overlay!=null) overlay.invalidate();
  }

  private void expandFromBubble(){
    if(overlayRoot==null || params==null) return;
    minimized=false;
    params.width=WindowManager.LayoutParams.MATCH_PARENT;
    params.height=dp(COLLAPSED_TOTAL_DP);
    params.x=0;
    getSharedPreferences("kfe_overlay",MODE_PRIVATE).edit().putBoolean("minimized",false).putInt("x",0).apply();
    if(windowManager!=null) windowManager.updateViewLayout(overlayRoot,params);
    if(overlay!=null) overlay.invalidate();
  }

  private void openFareForm(){openNumericForm("FARE","TRIP DETAILS","Enter trip fare, toll and parking");}
  private void openCancelForm(){cancelReason="";openNumericForm("CANCEL","CANCEL RIDE","Select reason and enter cancellation fee");}

  private void openNumericForm(String mode,String title,String hint){
    if(formMode!=null)return;
    formMode=mode;formValue="";tollValue="";parkingValue="";activeAmountField="fare";formSubmitting=false;
    params.flags=WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL|WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;
    params.softInputMode=WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE|WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE;
    params.height="FARE".equals(mode)?dp(420):dp(310);
    if(windowManager!=null)windowManager.updateViewLayout(overlayRoot,params);

    formPanel=new LinearLayout(this);formPanel.setOrientation(LinearLayout.VERTICAL);formPanel.setPadding(dp(14),dp(8),dp(14),dp(8));
    formPanel.setBackground(new ColorDrawable(dark()?Color.rgb(22,29,37):Color.WHITE));
    formPanel.setElevation(dp(8));
    TextView titleView=new TextView(this);titleView.setText(title);titleView.setTextSize(15);titleView.setTextColor(textColor());titleView.setGravity(Gravity.CENTER);
    formPanel.addView(titleView,new LinearLayout.LayoutParams(-1,dp(30)));
    TextView hintView=new TextView(this);hintView.setText(hint);hintView.setTextSize(10);hintView.setTextColor(mutedColor());hintView.setGravity(Gravity.CENTER);
    formPanel.addView(hintView,new LinearLayout.LayoutParams(-1,dp(18)));

    if("CANCEL".equals(mode)){
      final LinearLayout reasons=new LinearLayout(this); reasons.setOrientation(LinearLayout.HORIZONTAL); reasons.setGravity(Gravity.CENTER);
      String[] choices={"CUSTOMER","DRIVER"};
      for(String choice:choices){
        final String selectedChoice=choice;
        final Button reason=new Button(this);
        reason.setText(choice.equals("CUSTOMER")?"Customer cancellation":"Driver cancellation");
        reason.setTextSize(9); reason.setAllCaps(false);
        reason.setOnClickListener(v->{ cancelReason=selectedChoice; for(int i=0;i<reasons.getChildCount();i++) reasons.getChildAt(i).setAlpha(0.55f); reason.setAlpha(1f); });
        reasons.addView(reason,new LinearLayout.LayoutParams(0,dp(40),1));
      }
      formPanel.addView(reasons,new LinearLayout.LayoutParams(-1,dp(44)));
      formInput=numericInput("Cancellation fee","fare",android.view.inputmethod.EditorInfo.IME_ACTION_DONE);
      formPanel.addView(formInput,new LinearLayout.LayoutParams(-1,dp(48)));
    }else{
      formInput=numericInput("Trip fare","fare",android.view.inputmethod.EditorInfo.IME_ACTION_NEXT);
      tollInput=numericInput("Toll","toll",android.view.inputmethod.EditorInfo.IME_ACTION_NEXT);
      parkingInput=numericInput("Parking","parking",android.view.inputmethod.EditorInfo.IME_ACTION_DONE);
      formPanel.addView(formInput,new LinearLayout.LayoutParams(-1,dp(48)));
      formPanel.addView(tollInput,new LinearLayout.LayoutParams(-1,dp(48)));
      formPanel.addView(parkingInput,new LinearLayout.LayoutParams(-1,dp(48)));
    }

    LinearLayout actions=new LinearLayout(this);actions.setGravity(Gravity.CENTER);
    Button cancel=keyButton("BACK");cancel.setTextSize(11);cancel.setOnClickListener(v->closeForm());
    Button ok=keyButton("OKAY");ok.setTextSize(11);ok.setOnClickListener(v->submitNumericForm());
    actions.addView(cancel,new LinearLayout.LayoutParams(dp(105),dp(42)));actions.addView(ok,new LinearLayout.LayoutParams(dp(105),dp(42)));
    formPanel.addView(actions,new LinearLayout.LayoutParams(-1,dp(44)));
    overlayRoot.addView(formPanel,new FrameLayout.LayoutParams(-1,"CANCEL".equals(mode)?dp(310):dp(420),Gravity.TOP));

    EditText first=formInput;
    first.postDelayed(()->{first.requestFocus();InputMethodManager imm=(InputMethodManager)getSystemService(Context.INPUT_METHOD_SERVICE);if(imm!=null)imm.showSoftInput(first,InputMethodManager.SHOW_IMPLICIT);},180);
  }

  private EditText numericInput(String hint,String field,int imeAction){
    EditText input=new EditText(this);
    input.setHint(hint);
    input.setTextSize(16);
    input.setTextColor(textColor());
    input.setHintTextColor(mutedColor());
    input.setSingleLine(true);
    input.setInputType(android.text.InputType.TYPE_CLASS_NUMBER|android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL);
    input.setImeOptions(imeAction);
    input.setPadding(dp(12),0,dp(12),0);
    input.setSelectAllOnFocus(false);
    input.setOnFocusChangeListener((v,hasFocus)->{if(hasFocus)activeAmountField=field;});
    input.setOnEditorActionListener((v,id,event)->{
      if(id==android.view.inputmethod.EditorInfo.IME_ACTION_DONE){submitNumericForm();return true;}
      return false;
    });
    return input;
  }

  private LinearLayout overlayAmountField(String label,String field){
    LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);row.setPadding(dp(6),0,dp(6),0);
    TextView l=new TextView(this);l.setText(label);l.setTextSize(10);l.setTextColor(mutedColor());
    TextView value=new TextView(this);value.setTag("amount_"+field);value.setText("₹0");value.setTextSize(16);value.setTypeface(android.graphics.Typeface.DEFAULT,android.graphics.Typeface.BOLD);value.setTextColor(actionColor());value.setGravity(Gravity.CENTER);
    value.setOnClickListener(v->{activeAmountField=field;updateFormValue();});
    row.addView(l,new LinearLayout.LayoutParams(0,dp(32),1));row.addView(value,new LinearLayout.LayoutParams(dp(120),dp(36)));
    return row;
  }

  private Button keyButton(String label){
    Button b=new Button(this);b.setText(label);b.setTextSize(20);b.setAllCaps(false);
    b.setOnClickListener(v->{
      String current;
      if("fare".equals(activeAmountField)) current=formValue; else if("toll".equals(activeAmountField)) current=tollValue; else current=parkingValue;
      if("C".contentEquals(b.getText())) current="";
      else if("⌫".contentEquals(b.getText())) { if(current.length()>0) current=current.substring(0,current.length()-1); }
      else if(!"CANCEL".contentEquals(b.getText())&&! "OK".contentEquals(b.getText())&&! "OK — SAVE FARE".contentEquals(b.getText())&&! "BACK".contentEquals(b.getText())&&current.length()<9) current+=b.getText().toString();
      if("fare".equals(activeAmountField)) formValue=current; else if("toll".equals(activeAmountField)) tollValue=current; else parkingValue=current;
      updateFormValue();
    });return b;
  }
  private void hideUnderlyingKeyboard(){
    try{ InputMethodManager imm=(InputMethodManager)getSystemService(INPUT_METHOD_SERVICE); if(imm!=null) imm.hideSoftInputFromWindow(overlayRoot!=null?overlayRoot.getWindowToken():null,0); }catch(Exception ignored){}
  }
  private void updateFormValue(){
    if(formPanel==null)return;
    TextView v=formPanel.findViewWithTag("value");if(v!=null)v.setText("₹"+(formValue.isEmpty()?"0":formValue));
    TextView t=formPanel.findViewWithTag("amount_toll");if(t!=null)t.setText("₹"+(tollValue.isEmpty()?"0":tollValue));
    TextView p=formPanel.findViewWithTag("amount_parking");if(p!=null)p.setText("₹"+(parkingValue.isEmpty()?"0":parkingValue));
  }
  private void submitNumericForm(){
    if(formInput!=null)formValue=formInput.getText().toString().trim();
    if(tollInput!=null)tollValue=tollInput.getText().toString().trim();
    if(parkingInput!=null)parkingValue=parkingInput.getText().toString().trim();
    String actionTripId="FARE".equals(formMode)?resolveFareActionTripId(pendingFareTripId,pendingTripId):pendingTripId;
    if(formSubmitting||!awaitingEventId.isEmpty()||actionTripId.isEmpty())return;
    double amount;
    try{if(formValue.isEmpty())return;amount=Double.parseDouble(formValue);}catch(Exception e){return;}
    if(amount<0)return;formSubmitting=true;
    if("FARE".equals(formMode)){
      try {
        JSONObject payload=new JSONObject();
        payload.put("fare",amount);
        payload.put("toll",tollValue.isEmpty()?0:Double.parseDouble(tollValue));
        payload.put("parking",parkingValue.isEmpty()?0:Double.parseDouble(parkingValue));
        String eventId=KfeRideNotificationsPlugin.recordPendingAction(this,"ENTER_FARE",actionTripId,payload.toString());
        beginAwaiting(eventId,"ENTER_FARE",actionTripId);
        persistNativeWorkflow();
        KfeRideNotificationsPlugin.emitAction("ENTER_FARE",actionTripId,payload.toString(),eventId);
      } catch(Exception ignored){ formSubmitting=false; }
      return;
    }else if("CANCEL".equals(formMode)){
      if(cancelReason.isEmpty()||formValue.isEmpty()){formSubmitting=false;return;}
      try{
        JSONObject input=new JSONObject();
        input.put("revenue",amount);
        input.put("reason",cancelReason);
        String eventId=KfeRideNotificationsPlugin.recordPendingAction(this,"CANCEL_RIDE",pendingTripId,input.toString());
        beginAwaiting(eventId,"CANCEL_RIDE",pendingTripId);
        persistNativeWorkflow();
        KfeRideNotificationsPlugin.emitAction("CANCEL_RIDE",pendingTripId,input.toString(),eventId);
      }catch(Exception ignored){formSubmitting=false;return;}
      return;
    }
  }

  private void closeForm(){
    if(formPanel!=null&&overlayRoot!=null)overlayRoot.removeView(formPanel);
    formPanel=null;formMode=null;formValue="";tollValue="";parkingValue="";formSubmitting=false;formInput=null;tollInput=null;parkingInput=null;
    if(params!=null){params.height=dp(COLLAPSED_TOTAL_DP);params.flags=WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;params.softInputMode=WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING;if(windowManager!=null&&overlayRoot!=null)windowManager.updateViewLayout(overlayRoot,params);}
    if(overlay!=null)overlay.invalidate();
  }

  private int textColor(){return dark()?Color.rgb(235,240,245):Color.rgb(23,32,42);}
  private int mutedColor(){return dark()?Color.rgb(170,180,191):Color.rgb(91,102,115);}
  private int actionColor(){if("END_RIDE".equals(actionStage))return dark()?Color.rgb(255,110,110):Color.rgb(198,40,40);if("START_RIDE".equals(actionStage))return dark()?Color.rgb(70,205,120):Color.rgb(22,128,60);
    if("CANCELLED".equals(actionStage)||"CANCEL_RIDE".equals(actionStage))return dark()?Color.rgb(255,190,80):Color.rgb(190,120,0);
    return dark()?Color.rgb(95,150,245):Color.rgb(37,99,235);}
  private int targetColor(){if(targetProgress>=100)return dark()?Color.rgb(80,220,130):Color.rgb(20,145,75);if(targetProgress>=70)return dark()?Color.rgb(255,205,90):Color.rgb(190,125,0);return actionColor();}
  private boolean dark(){return "dark".equals(theme)||"night".equals(theme)||"dusk".equals(theme);}
  private void removeOverlay(){closeForm();if(windowManager!=null&&overlayRoot!=null){try{windowManager.removeView(overlayRoot);}catch(Exception ignored){}}overlayRoot=null;overlay=null;}
  @Override public void onDestroy(){removeOverlay();if(instance==this)instance=null;super.onDestroy();}
  @Override public IBinder onBind(Intent intent){return null;}
  private Notification buildNotification(){return new NotificationCompat.Builder(this,CHANNEL_ID).setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("KFE overlay ready").setContentText("Driver overlay is ready for use above other apps.").setOngoing(true).setCategory(NotificationCompat.CATEGORY_SERVICE).build();}
  private void createChannel(){if(android.os.Build.VERSION.SDK_INT>=android.os.Build.VERSION_CODES.O){NotificationManager m=(NotificationManager)getSystemService(Context.NOTIFICATION_SERVICE);if(m!=null)m.createNotificationChannel(new NotificationChannel(CHANNEL_ID,"KFE Overlay",NotificationManager.IMPORTANCE_LOW));}}
  private int dp(int v){return (int)(v*getResources().getDisplayMetrics().density+0.5f);}
  private float dpf(float v){return v*getResources().getDisplayMetrics().density;}

  private class SwipeOverlayView extends View{
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);private final RectF rect=new RectF();
    private float downX,downY,lastX,lastY;private boolean tracking,moving,swipeLocked,swipeEligible;private float progress;
    private String formatTripTime(){
      if(tripStartAt<=0) return "00:00:00";
      long elapsed=Math.max(0L,System.currentTimeMillis()-tripStartAt)/1000L;
      long h=elapsed/3600L,m=(elapsed%3600L)/60L,s=elapsed%60L;
      return String.format(java.util.Locale.US,"%02d:%02d:%02d",h,m,s);
    }
    SwipeOverlayView(Context c){super(c);setLayerType(View.LAYER_TYPE_SOFTWARE,null);}
    private int surface(){return dark()?Color.rgb(22,29,37):Color.WHITE;}
    @Override protected void onDraw(Canvas c){
      super.onDraw(c);
      int w=getWidth(),a=actionColor();
      if(minimized){
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.argb(235,Color.red(surface()),Color.green(surface()),Color.blue(surface())));
        c.drawCircle(dp(BUBBLE_DP)/2f,dp(BUBBLE_DP)/2f,dp(29),paint);
        paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(dp(1));
        paint.setColor(Color.argb(65,Color.red(textColor()),Color.green(textColor()),Color.blue(textColor())));
        c.drawCircle(dp(BUBBLE_DP)/2f,dp(BUBBLE_DP)/2f,dpf(28.5f),paint);
        text(18,a,true);center(c,"K",dp(BUBBLE_DP)/2f,dp(39));return;
      }
      int barTop=dp(8),barH=dp(132);
      paint.setStyle(Paint.Style.FILL);
      paint.setShadowLayer(dp(7),0,dp(3),Color.argb(60,0,0,0));
      paint.setColor(Color.argb(dark()?225:235,Color.red(surface()),Color.green(surface()),Color.blue(surface())));
      rect.set(8,barTop,w-8,barTop+barH);c.drawRoundRect(rect,dp(22),dp(22),paint);paint.clearShadowLayer();
      paint.setColor(Color.argb(55,Color.red(a),Color.green(a),Color.blue(a)));
      rect.set(8,barTop,(w-8)*progress+8,barTop+barH);c.drawRoundRect(rect,dp(22),dp(22),paint);
      // Target, Live KM, Trip Time and Revenue are the persistent live overlay metrics.
      float[] cols={.14f,.38f,.62f,.86f};
      String[] labels={"TARGET","LIVE KM","TRIP TIME","REVENUE"};
      String[] values={target,liveKm,formatTripTime(),revenue};
      for(int i=0;i<4;i++){text(9,mutedColor(),true);center(c,labels[i],w*cols[i],barTop+dp(23));text(15,i==0?targetColor():(i==1?a:textColor()),true);center(c,values[i],w*cols[i],barTop+dp(44));}
      if("END_RIDE".equals(actionStage)||"START_RIDE".equals(actionStage)) postInvalidateDelayed(1000);
      if("CANCELLED".equals(actionStage)){
        text(11,a,true);center(c,"CANCELLED · "+cancellationRevenue,w*.50f,barTop+dp(77));
        text(10,mutedColor(),false);center(c,"Same trip · cancellation recorded",w*.50f,barTop+dp(95));
      }else{
        String stateLabel="";if("START_RIDE".equals(actionStage))stateLabel="START RIDE";if("END_RIDE".equals(actionStage))stateLabel="END RIDE";if("ENTER_FARE".equals(actionStage))stateLabel="ENTER FARE";
        if(!stateLabel.isEmpty()){
          text(11,mutedColor(),true);String prefix="SWIPE TO ";float total=measureAction(prefix,11)+dp(4)+measureAction(stateLabel,11);float startX=w/2f-total/2f;
          c.drawText(prefix,startX,barTop+dp(79),paint);text(11,a,true);c.drawText(stateLabel,startX+measureAction(prefix,11)+dp(4),barTop+dp(79),paint);
        }
      }
      int thumbW=dp(58),pad=dp(8);float tx=pad+(w-pad*2-thumbW)*progress;
      paint.setColor(a);rect.set(tx,barTop+dp(100),tx+thumbW,barTop+dp(124));c.drawRoundRect(rect,dp(12),dp(12),paint);
      if("START_RIDE".equals(actionStage)){
        paint.setStyle(Paint.Style.FILL);paint.setColor(Color.argb(235,dark()?95:245,dark()?45:245,dark()?45:245));
        rect.set(w-dp(112),barTop+dp(61),w-dp(12),barTop+dp(94));c.drawRoundRect(rect,dp(12),dp(12),paint);
        text(9,Color.WHITE,true);center(c,"RIDE CANCELLATION",w-dp(62),barTop+dp(83));
      }
    }
    private void text(float size,int color,boolean bold){paint.setStyle(Paint.Style.FILL);paint.setColor(color);paint.setTextSize(dp((int)size));paint.setTypeface(android.graphics.Typeface.create("sans-serif",bold?android.graphics.Typeface.BOLD:android.graphics.Typeface.NORMAL));}
    private void center(Canvas c,String s,float x,float y){c.drawText(s,x-paint.measureText(s)/2f,y,paint);}
    private float measureAction(String s,float size){paint.setTextSize(dp((int)size));return paint.measureText(s);}
    private ValueAnimator retractAnimator;

    void animateProgressToZero(){
      if(retractAnimator!=null) retractAnimator.cancel();
      float from=progress;
      if(from<=0.001f){progress=0f;invalidate();return;}
      retractAnimator=ValueAnimator.ofFloat(from,0f);
      retractAnimator.setDuration(220L);
      retractAnimator.addUpdateListener(v->{progress=(Float)v.getAnimatedValue();invalidate();});
      retractAnimator.addListener(new android.animation.AnimatorListenerAdapter(){
        @Override public void onAnimationEnd(android.animation.Animator animation){progress=0f;invalidate();}
        @Override public void onAnimationCancel(android.animation.Animator animation){progress=0f;invalidate();}
      });
      retractAnimator.start();
    }

    @Override public boolean onTouchEvent(MotionEvent e){
      switch(e.getActionMasked()){
        case MotionEvent.ACTION_DOWN:{
          downX=e.getRawX();downY=e.getRawY();lastX=downX;lastY=downY;tracking=true;moving=false;
          float localX=e.getX(),localY=e.getY();
          swipeEligible=!minimized&&localY>=dp(100)&&localY<=dp(132)&&localX<=dp(74);
          swipeLocked=swipeEligible;progress=0;return true;}
        case MotionEvent.ACTION_MOVE:{
          float dx=e.getRawX()-downX,dy=e.getRawY()-downY;
          if(swipeEligible){
            float maxTravel=Math.max(1,getWidth()-dp(16)-dp(58));
            progress=Math.min(1f,Math.max(0f,dx)/maxTravel);
            invalidate();return true;
          }
          if(!moving&&Math.hypot(dx,dy)>dp(10)) moving=true;
          if(moving){
            int screenWidth=getResources().getDisplayMetrics().widthPixels;
            if(minimized){
              params.x=Math.max(0,Math.min(Math.max(0,screenWidth-dp(BUBBLE_DP)),(int)e.getRawX()-dp(BUBBLE_DP)/2));
              int screenHeight=windowManager.getDefaultDisplay().getHeight();
              params.y=Math.max(0,Math.min(Math.max(0,screenHeight-dp(BUBBLE_DP)),(int)e.getRawY()-dp(BUBBLE_DP)/2));
              lastY=e.getRawY();lastX=e.getRawX();
              if(windowManager!=null)windowManager.updateViewLayout(overlayRoot,params);
              getSharedPreferences("kfe_overlay",MODE_PRIVATE).edit().putInt("x",params.x).putInt("y",params.y).apply();
              invalidate();return true;
            }
            int proposedY=(int)(params.y+e.getRawY()-lastY);
            if(proposedY<=0||e.getRawY()<=dp(2)){
              minimized=true;params.width=dp(BUBBLE_DP);params.height=dp(BUBBLE_DP);
              params.x=e.getRawX()<screenWidth/2f?0:Math.max(0,screenWidth-dp(BUBBLE_DP));
              params.y=Math.max(0,(int)e.getRawY()-dp(BUBBLE_DP)/2);
              getSharedPreferences("kfe_overlay",MODE_PRIVATE).edit().putBoolean("minimized",true).putInt("x",params.x).putInt("y",params.y).apply();
              if(windowManager!=null)windowManager.updateViewLayout(overlayRoot,params);invalidate();return true;
            }
            int maxY=Math.max(0,windowManager.getDefaultDisplay().getHeight()-getHeight());params.y=Math.max(0,Math.min(maxY,proposedY));
            lastY=e.getRawY();lastX=e.getRawX();if(windowManager!=null)windowManager.updateViewLayout(overlayRoot,params);getSharedPreferences("kfe_overlay",MODE_PRIVATE).edit().putInt("x",params.x).putInt("y",params.y).apply();
          }
          return true;}
        case MotionEvent.ACTION_UP:{
          float fx=e.getRawX()-downX,fy=e.getRawY()-downY;tracking=false;
          if(minimized&&moving){
            int screenWidth=getResources().getDisplayMetrics().widthPixels;
            params.x=downX<screenWidth/2f?0:Math.max(0,screenWidth-dp(BUBBLE_DP));
            getSharedPreferences("kfe_overlay",MODE_PRIVATE).edit().putInt("x",params.x).putInt("y",params.y).apply();
            if(windowManager!=null)windowManager.updateViewLayout(overlayRoot,params);return true;
          }
          if(minimized&&!moving&&Math.abs(fx)<dp(16)&&Math.abs(fy)<dp(16)){expandFromBubble();return true;}
          if(!minimized&&!moving&&awaitingEventId.isEmpty()&&"START_RIDE".equals(actionStage)&&downX>getWidth()-dp(120)&&downY>=dp(60)&&downY<=dp(110)){openCancelForm();return true;}
          float maxTravel=Math.max(1,getWidth()-dp(16)-dp(58));
          if(!minimized&&!moving&&swipeEligible&&swipeLocked&&fx>=maxTravel*.70f){progress=1;invalidate();triggerAction();swipeLocked=false;swipeEligible=false;return true;}
          progress=0;invalidate();return true;}
        case MotionEvent.ACTION_CANCEL:tracking=false;moving=false;swipeLocked=false;swipeEligible=false;animateRetract();return true;
      }return true;
    }
  }
}
