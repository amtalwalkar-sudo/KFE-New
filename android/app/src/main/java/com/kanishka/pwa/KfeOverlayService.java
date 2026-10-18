package com.kanishka.pwa;

import android.animation.ValueAnimator;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
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
import android.util.Log;
import android.provider.Settings;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.inputmethod.InputMethodManager;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Toast;
import android.widget.Button;
import android.widget.CheckBox;
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

  interface LifecycleFaultInjector { void afterBoundary(String boundary); }
  static volatile LifecycleFaultInjector lifecycleFaultInjectorForTests;

  private WindowManager windowManager;
  private FrameLayout overlayRoot;
  private SwipeOverlayView overlay;
  private WindowManager.LayoutParams params;
  private String actionStage="GO_TO_PICKUP";
  private EditText formInput;
  private EditText tollInput;
  private EditText parkingInput;
  private CheckBox tollTreatmentInput;
  private CheckBox parkingTreatmentInput;
  private Button tollToggle;
  private Button parkingToggle;
  private boolean tollExpanded=false;
  private boolean parkingExpanded=false;
  private String theme="dark";
  private String target="—", rides="0", liveKm="0.0 km", revenue="₹0", pendingTripId="", pendingFareTripId="", cancellationRevenue="₹0";
  private String deadKm="—", gpsStatus="GPS status unavailable";
  private long tripStartAt=0L;
  private long phaseStartAt=0L;
  private String phaseLabel="TRIP TIME";
  private String defaultOperator="";
  private int swipeCommitThresholdPercent=70, swipeReturnDurationMs=220;
  private int swipePickupColor=Color.rgb(120,162,255), swipeStartColor=Color.rgb(98,209,138), swipeEndColor=Color.rgb(255,133,133);
  private int targetProgress=0;
  private boolean minimized=false;
  private String formMode=null;
  private String formValue="";
  private String tollValue="";
  private String parkingValue="";
  private String activeAmountField="fare";
  private String cancelReason="";
  private boolean formSubmitting=false;
  private boolean cancelFormPwaSynchronized=false;
  private boolean acknowledgedEventNeedsRecovery=false;
  private String awaitingEventId="";
  private String awaitingStage="";
  private String awaitingTripId="";
  private long lastPendingRecoveryLogAt=0L;
  private LinearLayout formPanel;
  private android.os.Handler foregroundHandler;
  private final Runnable foregroundCheck=new Runnable(){
    @Override public void run(){
      hideIfKfeActivityForeground();
      if(!awaitingEventId.isEmpty() && System.currentTimeMillis()-lastPendingRecoveryLogAt>=15000L){
        lastPendingRecoveryLogAt=System.currentTimeMillis();
        Log.w("KFE-SWIPE","pending-action recovery required event="+shortEventId(awaitingEventId)+" stage="+awaitingStage+" trip="+shortEventId(awaitingTripId)+" action remains locked; durable queue replay/ack required");
        if(overlay!=null)overlay.postInvalidate();
      }
      if(foregroundHandler!=null) foregroundHandler.postDelayed(this,500L);
    }
  };

  static void updateLiveKm(String value){
    KfeOverlayService current=instance;
    if(current==null)return;
    current.liveKm=value==null?"0.0 km":value;
    if(current.overlay!=null)current.overlay.postInvalidate();
  }

  static void updateDeadKm(String value){
    KfeOverlayService current=instance;
    if(current==null)return;
    current.deadKm=value==null?"—":value;
    current.getSharedPreferences("kfe_overlay",MODE_PRIVATE).edit().putString("deadKm",current.deadKm).apply();
    if(current.overlay!=null)current.overlay.postInvalidate();
  }

  static String resolveFareActionTripId(String pendingFareTripId, String currentTripId){
    if(pendingFareTripId!=null&&!pendingFareTripId.isEmpty())return pendingFareTripId;
    return currentTripId==null?"":currentTripId;
  }

  static String gpsEventForAction(String stage){
    if("GO_TO_PICKUP".equals(stage))return "DEAD_MOVEMENT_TRACE";
    if("START_RIDE".equals(stage))return "PASSENGER_RIDE_TRACE";
    return "";
  }

  static String resolveMovementLabel(String stage){
    if("GO_TO_PICKUP".equals(stage)||"START_RIDE".equals(stage))return "DEAD KM";
    if("END_RIDE".equals(stage))return "BUSINESS KM";
    return "LIVE KM";
  }

  static String resolveMovementValue(String stage, String deadMovementKm, String businessKm){
    // START_RIDE is the pickup phase (the next swipe starts the passenger leg).
    // Select by the displayed phase, not by whichever collector updated last.
    if("GO_TO_PICKUP".equals(stage)||"START_RIDE".equals(stage))
      return deadMovementKm==null?"—":deadMovementKm;
    return businessKm==null?"0.0 km":businessKm;
  }

  static String resolveActionLabel(String stage){
    if("GO_TO_PICKUP".equals(stage))return "GO TO PICKUP";
    if("START_RIDE".equals(stage))return "START RIDE";
    if("END_RIDE".equals(stage))return "END RIDE";
    return "";
  }

  public static void prepare(Context context){Intent i=new Intent(context,KfeOverlayService.class);i.setAction(ACTION_PREPARE);ContextCompat.startForegroundService(context,i);}
  public static void show(Context context,String state){Intent i=new Intent(context,KfeOverlayService.class);i.setAction(ACTION_SHOW);i.putExtra(EXTRA_STATE,state==null?"{}":state);ContextCompat.startForegroundService(context,i);}
  public static void update(Context context,String state){Intent i=new Intent(context,KfeOverlayService.class);i.setAction(ACTION_UPDATE);i.putExtra(EXTRA_STATE,state==null?"{}":state);ContextCompat.startForegroundService(context,i);}
  public static void hide(Context context){Intent i=new Intent(context,KfeOverlayService.class);i.setAction(ACTION_HIDE);context.startService(i);}
  public static boolean isResumableState(String raw){
    if(raw==null||raw.trim().isEmpty())return false;
    try{
      JSONObject state=new JSONObject(raw);
      JSONObject shift=state.optJSONObject("shift");
      return shift!=null&&!shift.optString("id","").trim().isEmpty();
    }catch(Exception ignored){return false;}
  }
  static boolean hasPersistedOverlayState(Context context){
    String raw=context.getSharedPreferences("kfe_overlay",MODE_PRIVATE).getString(LAST_STATE_KEY,"");
    return isResumableState(raw);
  }
  static void clearPersistedOverlayState(Context context){
    context.getSharedPreferences("kfe_overlay",MODE_PRIVATE).edit().remove(LAST_STATE_KEY).apply();
  }
  public static void resumePersisted(Context context){
    // Boot recovery must not resurrect an ended shift from a stale snapshot,
    // or start a foreground overlay service when no active shift was persisted.
    if(!Settings.canDrawOverlays(context)||!hasPersistedOverlayState(context))return;
    Intent i=new Intent(context,KfeOverlayService.class);
    i.setAction("com.kanishka.pwa.KFE_OVERLAY_RESUME");
    ContextCompat.startForegroundService(context,i);
  }

  @Override public void onCreate(){super.onCreate();instance=this;
    restoreNativeWorkflowCheckpoint();
    createChannel();startForeground(NOTIFICATION_ID,buildNotification());foregroundHandler=new android.os.Handler(getMainLooper());foregroundHandler.post(foregroundCheck);
    // Pending native events remain durable across process death. Do not force the
    // main activity to the foreground; the PWA replays them when it next runs.
  }
  // Shared by normal service startup and instrumentation recovery tests so the
  // test exercises the same persisted checkpoint restoration as process restart.
  void restoreNativeWorkflowCheckpoint(){
    android.content.SharedPreferences saved=getSharedPreferences("kfe_overlay",MODE_PRIVATE);
    actionStage=saved.getString("actionStage","GO_TO_PICKUP");
    minimized=saved.getBoolean("minimized",false);
    pendingTripId=saved.getString("pendingTripId","");
    pendingFareTripId=saved.getString("pendingFareTripId","");
    tripStartAt=saved.getLong("tripStartAt",0L);
    phaseStartAt=saved.getLong("phaseStartAt",0L);
    phaseLabel=saved.getString("phaseLabel","TRIP TIME");
    deadKm=saved.getString("deadKm","—");
    awaitingEventId=saved.getString("awaitingEventId","");
    awaitingStage=saved.getString("awaitingStage","");
    awaitingTripId=saved.getString("awaitingTripId","");
    if(!awaitingEventId.isEmpty() && KfeNativeEventStore.get(this).isAcknowledged(awaitingEventId)){
      // The overlay root is not attached until onStartCommand. Defer UI work
      // until applyState so a recovered acknowledgement cannot touch null views.
      acknowledgedEventNeedsRecovery=true;
    }
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
    // An explicit restart may arrive with an Intent whose action is null. Restore
    // the last valid shift snapshot so the overlay and any persisted form draft
    // are reattached instead of leaving the foreground service invisible.
    if(action==null){
      if(Settings.canDrawOverlays(this)){
        String saved=getSharedPreferences("kfe_overlay",MODE_PRIVATE).getString(LAST_STATE_KEY,"");
        if(!saved.isEmpty()){ensureOverlay();applyState(saved);}
      }
      return START_STICKY;
    }
    if ("com.kanishka.pwa.KFE_OVERLAY_RESUME".equals(action)) {
      if (!Settings.canDrawOverlays(this)) return START_NOT_STICKY;
      String saved=getSharedPreferences("kfe_overlay",MODE_PRIVATE).getString(LAST_STATE_KEY,"");
      if (!saved.isEmpty()) { ensureOverlay(); applyState(saved); }
      return START_STICKY;
    }
    if(ACTION_HIDE.equals(action)){clearPersistedOverlayState(this);removeOverlay();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();return START_NOT_STICKY;}
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
      if(shift==null||shift.optString("id","").isEmpty()){
        clearPersistedOverlayState(this);
        removeOverlay();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
        return;
      }
      theme="dark";
      target=root.optString("target","—");
      targetProgress=Math.max(0,Math.min(100,root.optInt("targetProgress",0)));
      rides=root.optString("rides","0");
      liveKm=root.optString("liveKm","0.0 km");
      defaultOperator=root.optString("defaultOperator",defaultOperator);
      JSONObject swipeConfig=root.optJSONObject("swipeConfig");
      if(swipeConfig!=null){ swipeCommitThresholdPercent=Math.max(50,Math.min(95,swipeConfig.optInt("commitThresholdPercent",70))); swipeReturnDurationMs=Math.max(80,Math.min(500,swipeConfig.optInt("returnDurationMs",220))); try{swipePickupColor=Color.parseColor(swipeConfig.optString("pickupColor","#78A2FF"));swipeStartColor=Color.parseColor(swipeConfig.optString("startColor","#62D18A"));swipeEndColor=Color.parseColor(swipeConfig.optString("endColor","#FF8585"));}catch(Exception ignored){} }
      deadKm=root.optString("deadKm",root.optString("deadMovementKm","—"));
      gpsStatus=root.optString("gpsStatus",root.optBoolean("gpsTracking",false)?"GPS active":"GPS status unavailable");
      revenue=root.optString("revenue","₹0");
      cancellationRevenue=root.optString("cancellationRevenue","₹0");
      String incomingTripId=root.optString("overlayTripId",trip==null?"":trip.optString("id",""));
      android.content.SharedPreferences durable=getSharedPreferences("kfe_overlay",MODE_PRIVATE);
      String durableStage=durable.getString("actionStage","GO_TO_PICKUP");
      String durableTripId=durable.getString("pendingTripId","");
      String durableTimerTripId=durable.getString("tripTimerTripId","");
      long durableTripStartAt=durable.getLong("tripStartAt",0L);
      long incomingPhaseStartAt=root.optLong("phaseStartAt",phaseStartAt);
      String incomingPhaseLabel=root.optString("phaseLabel",phaseLabel);
      long durablePhaseStartAt=durable.getLong("phaseStartAt",0L);
      String durablePhaseLabel=durable.getString("phaseLabel",phaseLabel);
      // Prefer a durable native lifecycle checkpoint over a stale PWA snapshot.
      // This preserves the trip ID across process death between separate stores.
      boolean preserveDurableTrip=awaitingEventId.isEmpty()&&!durableTripId.isEmpty()
        &&("GO_TO_PICKUP".equals(durableStage)||"START_RIDE".equals(durableStage)
          ||"END_RIDE".equals(durableStage)||"ENTER_FARE".equals(durableStage));
      boolean preserveDurablePhaseTimer=preserveDurableTrip&&durablePhaseStartAt>0L
        &&("START_RIDE".equals(durableStage)||"END_RIDE".equals(durableStage)||"ENTER_FARE".equals(durableStage));
      phaseStartAt=preserveDurablePhaseTimer?durablePhaseStartAt:incomingPhaseStartAt;
      phaseLabel=preserveDurablePhaseTimer?durablePhaseLabel:incomingPhaseLabel;
      String previousActionStage=actionStage;
      String nextActionStage=root.optString("overlayAction",actionStage);
      if(preserveDurableTrip){
        actionStage=durableStage;
        pendingTripId=durableTripId;
        if(("END_RIDE".equals(durableStage)||"START_RIDE".equals(durableStage))&&durableTripStartAt>0L)
          tripStartAt=durableTripStartAt;
        else tripStartAt=root.optLong("tripStartAt",0L);
      }else{
        tripStartAt=root.optLong("tripStartAt",0L);
        if(awaitingEventId.isEmpty()) actionStage=nextActionStage;
        if(awaitingEventId.isEmpty()){
          pendingTripId=incomingTripId;
          if(pendingTripId.isEmpty()&&trip!=null)pendingTripId=trip.optString("id","");
        }
        if("END_RIDE".equals(actionStage)&&tripStartAt<=0L&&durableTripId.equals(pendingTripId)
          &&durableTimerTripId.equals(pendingTripId))tripStartAt=durableTripStartAt;
      }
      if(!actionStage.equals(previousActionStage) && !"ENTER_FARE".equals(actionStage)) animateRetract();
      if(awaitingEventId.isEmpty()&&!preserveDurableTrip) pendingFareTripId=root.optString("pendingFareId","");
      else if(preserveDurableTrip&&"ENTER_FARE".equals(durableStage)) pendingFareTripId=durableTripId;
      if(formMode!=null){
        if((("ENTER_FARE".equals(actionStage)||"END_RIDE".equals(actionStage))&&!"FARE".equals(formMode))||("CANCEL_RIDE".equals(actionStage)&&!"CANCEL".equals(formMode)))closeForm();
      }
      restorePersistedFormIfNeeded();
      if(root.optBoolean("cancelOpen",false))cancelFormPwaSynchronized=true;
      if(!minimized&&formMode==null&&"ENTER_FARE".equals(actionStage)){openFareForm();applyFareDraft(root.optJSONObject("fareDraft"));}
      if(!minimized&&formMode==null&&"START_RIDE".equals(actionStage)&&root.optBoolean("cancelOpen",false)){openCancelForm();applyCancelDraft(root.optJSONObject("cancelDraft"));}
      if("CANCEL".equals(formMode)&&"START_RIDE".equals(actionStage)&&cancelFormPwaSynchronized&&!root.optBoolean("cancelOpen",false)&&!"CANCEL_RIDE".equals(awaitingStage)){closeForm();cancelFormPwaSynchronized=false;}
      if(acknowledgedEventNeedsRecovery){acknowledgedEventNeedsRecovery=false;onEventAcknowledged(awaitingEventId,awaitingStage,awaitingTripId);}
      overlay.invalidate();
    }catch(Exception ignored){ overlay.invalidate(); }
  }

  private void persistNativeForm(){
    getSharedPreferences("kfe_overlay",MODE_PRIVATE).edit()
      .putString("formMode",formMode==null?"":formMode)
      .putString("formValue",formValue).putString("tollValue",tollValue).putString("parkingValue",parkingValue)
      .putString("cancelReason",cancelReason).putBoolean("cancelFormPwaSynchronized",cancelFormPwaSynchronized).putBoolean("tollExpanded",tollExpanded).putBoolean("parkingExpanded",parkingExpanded)
      .putBoolean("tollExcluded",tollTreatmentInput!=null&&tollTreatmentInput.isChecked())
      .putBoolean("parkingExcluded",parkingTreatmentInput!=null&&parkingTreatmentInput.isChecked()).apply();
  }

  private void applyFareDraft(JSONObject draft){
    if(draft==null)return;
    formValue=draft.optString("fare","");tollValue=draft.optString("tripToll","");parkingValue=draft.optString("tripParking","");
    tollExpanded=!tollValue.isEmpty()||"EXCLUDED".equals(draft.optString("tripTollTreatment","INCLUDED"));
    parkingExpanded=!parkingValue.isEmpty()||"EXCLUDED".equals(draft.optString("tripParkingTreatment","INCLUDED"));
    if(formInput!=null)formInput.setText(formValue);
    if(tollInput!=null){tollInput.setText(tollValue);tollInput.setVisibility(tollExpanded?View.VISIBLE:View.GONE);}
    if(parkingInput!=null){parkingInput.setText(parkingValue);parkingInput.setVisibility(parkingExpanded?View.VISIBLE:View.GONE);}
    if(tollTreatmentInput!=null){tollTreatmentInput.setChecked("EXCLUDED".equals(draft.optString("tripTollTreatment","INCLUDED")));tollTreatmentInput.setVisibility(tollExpanded?View.VISIBLE:View.GONE);}
    if(parkingTreatmentInput!=null){parkingTreatmentInput.setChecked("EXCLUDED".equals(draft.optString("tripParkingTreatment","INCLUDED")));parkingTreatmentInput.setVisibility(parkingExpanded?View.VISIBLE:View.GONE);}
    if(tollToggle!=null)tollToggle.setText(tollExpanded?"− Toll":"+ Toll");
    if(parkingToggle!=null)parkingToggle.setText(parkingExpanded?"− Parking":"+ Parking");
    persistNativeForm();
  }

  private void applyCancelDraft(JSONObject draft){
    if(draft==null)return;
    cancelReason=draft.optString("cancelReason","");formValue=draft.optString("cancelFare","");
    if(formInput!=null)formInput.setText(formValue);
    if(formPanel!=null&&formPanel.getChildCount()>2){
      android.view.ViewGroup reasons=(android.view.ViewGroup)formPanel.getChildAt(2);
      for(int i=0;i<reasons.getChildCount();i++){View child=reasons.getChildAt(i);String label=String.valueOf(((Button)child).getText());child.setAlpha((cancelReason.equals("PASSENGER")&&label.contains("Passenger"))||(cancelReason.equals("DRIVER")&&label.contains("Driver"))?1f:0.55f);}
    }
    persistNativeForm();
  }

  private void restorePersistedFormIfNeeded(){
    if(formMode!=null||minimized)return;
    android.content.SharedPreferences saved=getSharedPreferences("kfe_overlay",MODE_PRIVATE);
    String mode=saved.getString("formMode","");
    String savedFare=saved.getString("formValue","");
    String savedToll=saved.getString("tollValue","");
    String savedParking=saved.getString("parkingValue","");
    String savedReason=saved.getString("cancelReason","");
    cancelFormPwaSynchronized=saved.getBoolean("cancelFormPwaSynchronized",false);
    boolean savedTollExpanded=saved.getBoolean("tollExpanded",false);
    boolean savedParkingExpanded=saved.getBoolean("parkingExpanded",false);
    boolean savedTollExcluded=saved.getBoolean("tollExcluded",false);
    boolean savedParkingExcluded=saved.getBoolean("parkingExcluded",false);
    if("FARE".equals(mode)&&"ENTER_FARE".equals(actionStage))openFareForm();
    else if("CANCEL".equals(mode)&&"START_RIDE".equals(actionStage))openCancelForm();
    else return;
    formValue=savedFare;tollValue=savedToll;parkingValue=savedParking;cancelReason=savedReason;
    tollExpanded=savedTollExpanded;parkingExpanded=savedParkingExpanded;
    if(formInput!=null)formInput.setText(formValue);
    if(tollInput!=null){tollInput.setText(tollValue);tollInput.setVisibility(tollExpanded?View.VISIBLE:View.GONE);}
    if(parkingInput!=null){parkingInput.setText(parkingValue);parkingInput.setVisibility(parkingExpanded?View.VISIBLE:View.GONE);}
    if(tollTreatmentInput!=null){tollTreatmentInput.setChecked(savedTollExcluded);tollTreatmentInput.setVisibility(tollExpanded?View.VISIBLE:View.GONE);}
    if(parkingTreatmentInput!=null){parkingTreatmentInput.setChecked(savedParkingExcluded);parkingTreatmentInput.setVisibility(parkingExpanded?View.VISIBLE:View.GONE);}
    if(tollToggle!=null)tollToggle.setText(tollExpanded?"− Toll":"+ Toll");
    if(parkingToggle!=null)parkingToggle.setText(parkingExpanded?"− Parking":"+ Parking");
    if("CANCEL".equals(mode)&&formPanel!=null&&formPanel.getChildCount()>2){
      android.view.ViewGroup reasons=(android.view.ViewGroup)formPanel.getChildAt(2);
      for(int i=0;i<reasons.getChildCount();i++){View child=reasons.getChildAt(i);String label=String.valueOf(((Button)child).getText());child.setAlpha((cancelReason.equals("PASSENGER")&&label.contains("Passenger"))||(cancelReason.equals("DRIVER")&&label.contains("Driver"))?1f:0.55f);}
    }
    persistNativeForm();
  }

  private void onCancelSaved(){formSubmitting=false;closeForm();KfeNativeGpsService.stop(this,pendingTripId);actionStage="GO_TO_PICKUP";pendingTripId="";pendingFareTripId="";tripStartAt=0L;phaseStartAt=System.currentTimeMillis();phaseLabel="READY TIME";awaitingEventId="";awaitingStage="";awaitingTripId="";persistNativeWorkflow();if(overlay!=null)overlay.invalidate();}

  private void onFareSaved(){
    formSubmitting=false;
    closeForm();
    actionStage="GO_TO_PICKUP";
    pendingTripId="";
    pendingFareTripId="";
    tripStartAt=0L;
    phaseStartAt=System.currentTimeMillis(); phaseLabel="READY TIME";
    persistNativeWorkflow();
    
    animateRetract();
    if(overlay!=null) overlay.invalidate();
  }

  private void animateRetract(){
    if(overlay!=null) overlay.animateProgressToZero();
  }

  private void requestPwaForm(String stage){
    if(!awaitingEventId.isEmpty()||pendingTripId.isEmpty())return;
    String eventId=KfeNativeWorkActionsPlugin.recordPendingAction(this,stage,pendingTripId,"");
    persistNativeWorkflow();
    // Keep the open-form hint durable, but do not reserve the single in-flight
    // state-changing action slot; cancellation submission is a separate event.
    KfeNativeWorkActionsPlugin.emitAction(stage,pendingTripId,"",eventId);
    openCancelForm();
  }

  private void triggerAction(){
    // The SQLite queue is the durable hand-off. Advance the native cockpit
    // immediately after the action is committed to that queue so a suspended
    // WebView cannot leave the overlay stuck on "WAITING FOR APP". When Work
    // resumes, it replays these events in creation order and persists each
    // canonical business transition using the same event IDs.
    if(!awaitingEventId.isEmpty()) return;
    if("GO_TO_PICKUP".equals(actionStage)){
      if(pendingTripId.isEmpty()) pendingTripId=java.util.UUID.randomUUID().toString();
      // Persist the generated trip ID before writing either durable store. If
      // killed at any later boundary, a retry resumes this same logical trip.
      String eventId;
      try { eventId=persistLifecycleAction("GO_TO_PICKUP","GOING_TO_PICKUP",false); }
      catch(RuntimeException failure){Log.e("KFE-CANONICAL","GO_TO_PICKUP lifecycle persistence interrupted; retry is safe",failure);Toast.makeText(this,"Trip action is queued for recovery. Keep this trip open and retry when storage is available.",Toast.LENGTH_LONG).show();return;}
      phaseStartAt=System.currentTimeMillis(); phaseLabel="PICKUP TIME";
      actionStage="START_RIDE"; pendingFareTripId="";
      awaitingEventId=""; awaitingStage=""; awaitingTripId="";
      persistNativeWorkflow(); KfeNativeGpsService.start(this,pendingTripId,gpsEventForAction("GO_TO_PICKUP"),"TRIP"); animateRetract(); overlay.invalidate();
      Log.i("KFE-SWIPE","durably queued GO_TO_PICKUP; native stage advanced to START_RIDE event="+shortEventId(eventId));
      KfeNativeWorkActionsPlugin.emitAction("GO_TO_PICKUP",pendingTripId,"",eventId); return;
    }
    if("START_RIDE".equals(actionStage)){
      if(pendingTripId.isEmpty()) return;
      // Preserve the original start instant across retries after process death.
      if(tripStartAt<=0L) tripStartAt=System.currentTimeMillis();
      String eventId;
      try { eventId=persistLifecycleAction("START_RIDE","RIDE_STARTED",true); }
      catch(RuntimeException failure){Log.e("KFE-CANONICAL","START_RIDE lifecycle persistence interrupted; retry is safe",failure);Toast.makeText(this,"Trip action is queued for recovery. Keep this trip open and retry when storage is available.",Toast.LENGTH_LONG).show();return;}
      actionStage="END_RIDE"; phaseStartAt=tripStartAt; phaseLabel="TRIP TIME";
      getSharedPreferences("kfe_overlay",MODE_PRIVATE).edit()
        .putLong("tripStartAt",tripStartAt).putString("tripTimerTripId",pendingTripId).commit();
      awaitingEventId=""; awaitingStage=""; awaitingTripId="";
      persistNativeWorkflow(); KfeNativeGpsService.start(this,pendingTripId,gpsEventForAction("START_RIDE"),"TRIP"); animateRetract(); overlay.invalidate();
      Log.i("KFE-SWIPE","durably queued START_RIDE; native stage advanced to END_RIDE event="+shortEventId(eventId));
      KfeNativeWorkActionsPlugin.emitAction("START_RIDE",pendingTripId,"",eventId); return;
    }
    if("END_RIDE".equals(actionStage)){
      if(pendingTripId.isEmpty()) return;
      String eventId;
      try { eventId=persistLifecycleAction("END_RIDE","COMPLETED",false); }
      catch(RuntimeException failure){Log.e("KFE-CANONICAL","END_RIDE lifecycle persistence interrupted; retry is safe",failure);Toast.makeText(this,"Trip action is queued for recovery. Keep this trip open and retry when storage is available.",Toast.LENGTH_LONG).show();return;}
      actionStage="ENTER_FARE"; pendingFareTripId=pendingTripId; tripStartAt=0L; phaseStartAt=System.currentTimeMillis(); phaseLabel="FARE ENTRY TIME";
      getSharedPreferences("kfe_overlay",MODE_PRIVATE).edit().remove("tripStartAt").remove("tripTimerTripId").commit();
      awaitingEventId=""; awaitingStage=""; awaitingTripId="";
      persistNativeWorkflow(); KfeNativeGpsService.stop(this,pendingTripId);
      if(!minimized && !"FARE".equals(formMode)) openFareForm();
      animateRetract(); if(overlay!=null)overlay.invalidate();
      Log.i("KFE-SWIPE","durably queued END_RIDE; native stage advanced to ENTER_FARE event="+shortEventId(eventId));
      KfeNativeWorkActionsPlugin.emitAction("END_RIDE",pendingTripId,"",eventId);
    }
  }

  // This is the same ordered persistence sequence used by all three native swipe
  // transitions. The optional package-private injector lets instrumentation tests
  // interrupt after each durable boundary and retry from persisted preferences.
  private String persistLifecycleAction(String eventStage,String canonicalStage,boolean rideStarted){
    if(!persistNativeWorkflow())throw new IllegalStateException("Native lifecycle checkpoint could not be committed.");
    injectLifecycleFault("AFTER_CHECKPOINT");
    String eventId=KfeNativeWorkActionsPlugin.recordPendingAction(this,eventStage,pendingTripId,"");
    injectLifecycleFault("AFTER_OUTBOX");
    if(!persistCanonicalTripStage(canonicalStage,rideStarted,eventId))throw new IllegalStateException("Canonical lifecycle write was not committed.");
    injectLifecycleFault("AFTER_CANONICAL");
    return eventId;
  }
  private void injectLifecycleFault(String boundary){
    LifecycleFaultInjector injector=lifecycleFaultInjectorForTests;
    if(injector!=null)injector.afterBoundary(boundary);
  }

  private static String shortEventId(String id){ return id==null||id.isEmpty()?"none":id.substring(0,Math.min(8,id.length())); }
  private void beginAwaiting(String eventId,String stage,String tripId){
    awaitingEventId=eventId==null?"":eventId; awaitingStage=stage==null?"":stage; awaitingTripId=tripId==null?"":tripId;
    Log.i("KFE-SWIPE","dispatch stage="+awaitingStage+" event="+shortEventId(awaitingEventId)+" trip="+shortEventId(awaitingTripId));
  }

  static void acknowledgeFromPwa(Context context,String eventId,String stage,String tripId){
    KfeOverlayService current=instance;
    if(current==null)return;
    if("OPEN_CANCEL_FORM".equals(stage)){current.cancelFormPwaSynchronized=true;current.persistNativeForm();return;}
    if("CLOSE_CANCEL_FORM".equals(stage)){current.cancelFormPwaSynchronized=false;if("CANCEL".equals(current.formMode))current.closeForm();return;}
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
    if(!KfePendingActionState.matchesAwaitingEvent(awaitingEventId,eventId)){
      Log.w("KFE-SWIPE","ack ignored event="+shortEventId(eventId)+" awaiting="+shortEventId(awaitingEventId)+" stage="+stage);
      return;
    }
    Log.i("KFE-SWIPE","acknowledged event="+shortEventId(eventId)+" stage="+stage+" trip="+shortEventId(tripId));
    awaitingEventId=""; awaitingStage=""; awaitingTripId="";
    if("GO_TO_PICKUP".equals(stage)){ actionStage="START_RIDE"; pendingFareTripId=""; Log.i("KFE-SWIPE","stage transition GO_TO_PICKUP -> START_RIDE"); persistNativeWorkflow(); KfeNativeGpsService.start(this,pendingTripId,gpsEventForAction("GO_TO_PICKUP"),"TRIP"); animateRetract(); if(overlay!=null)overlay.invalidate(); return; }
    if("START_RIDE".equals(stage)){ actionStage="END_RIDE"; Log.i("KFE-SWIPE","stage transition START_RIDE -> END_RIDE"); persistNativeWorkflow(); KfeNativeGpsService.start(this,pendingTripId,gpsEventForAction("START_RIDE"),"TRIP"); animateRetract(); if(overlay!=null)overlay.invalidate(); return; }
    if("END_RIDE".equals(stage)){ pendingFareTripId=tripId; pendingTripId=tripId; actionStage="ENTER_FARE"; Log.i("KFE-SWIPE","stage transition END_RIDE -> ENTER_FARE"); persistNativeWorkflow(); KfeNativeGpsService.stop(this,tripId); if(!minimized&&!"FARE".equals(formMode)){if("FARE".equals(getSharedPreferences("kfe_overlay",MODE_PRIVATE).getString("formMode","")))restorePersistedFormIfNeeded();else openFareForm();} if(overlay!=null)overlay.invalidate(); return; }
    if("OPEN_CANCEL_FORM".equals(stage)){ persistNativeWorkflow(); if(overlay!=null)overlay.invalidate(); return; }
    if("ENTER_FARE".equals(stage) || "CANCEL_RIDE".equals(stage)){ Log.i("KFE-SWIPE","stage transition "+stage+" -> GO_TO_PICKUP"); closeForm(); if("CANCEL_RIDE".equals(stage)){cancelFormPwaSynchronized=false;KfeNativeGpsService.stop(this,tripId);} actionStage="GO_TO_PICKUP"; pendingTripId=""; pendingFareTripId=""; tripStartAt=0L; phaseStartAt=System.currentTimeMillis(); phaseLabel="READY TIME"; persistNativeWorkflow(); animateRetract(); if(overlay!=null)overlay.invalidate(); }
  }

  private boolean persistNativeWorkflow(){
    android.content.SharedPreferences prefs=getSharedPreferences("kfe_overlay",MODE_PRIVATE);
    android.content.SharedPreferences.Editor editor=prefs.edit()
      .putString("actionStage",actionStage)
      .putString("pendingTripId",pendingTripId)
      .putString("pendingFareTripId",pendingFareTripId)
      .putString("awaitingEventId",awaitingEventId)
      .putString("awaitingStage",awaitingStage)
      .putString("awaitingTripId",awaitingTripId)
      .putLong("tripStartAt",tripStartAt)
      .putLong("phaseStartAt",phaseStartAt)
      .putString("phaseLabel",phaseLabel);
    if("END_RIDE".equals(actionStage)&&!pendingTripId.isEmpty()&&tripStartAt>0L)
      editor.putString("tripTimerTripId",pendingTripId);
    else editor.remove("tripTimerTripId");
    String raw=prefs.getString(LAST_STATE_KEY,"");
    if(!raw.isEmpty()){
      try{
        JSONObject state=new JSONObject(raw);
        state.put("overlayAction",actionStage);
        state.put("overlayTripId",pendingTripId);
        state.put("pendingFareId",pendingFareTripId);
        state.put("phaseStartAt",phaseStartAt); state.put("phaseLabel",phaseLabel);
        editor.putString(LAST_STATE_KEY,state.toString());
      }catch(Exception ignored){}
    }
    // This is the recovery checkpoint for lifecycle writes. apply() may defer
    // the disk write until after process death; commit() makes the checkpoint
    // durable before the next SQLite database is mutated.
    boolean committed=editor.commit();
    if(!committed) Log.e("KFE-CANONICAL","Could not durably persist native workflow checkpoint");
    return committed;
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

  private void openFormForCurrentState(){
    android.content.SharedPreferences saved=getSharedPreferences("kfe_overlay",MODE_PRIVATE);
    JSONObject state=null;
    try{state=new JSONObject(saved.getString(LAST_STATE_KEY,"{}"));}catch(Exception ignored){}
    if("ENTER_FARE".equals(actionStage)){
      if("FARE".equals(saved.getString("formMode","")))restorePersistedFormIfNeeded();
      if(formMode==null){openFareForm();applyFareDraft(state==null?null:state.optJSONObject("fareDraft"));}
    }else if("START_RIDE".equals(actionStage)&&cancelFormPwaSynchronized){
      if("CANCEL".equals(saved.getString("formMode","")))restorePersistedFormIfNeeded();
      if(formMode==null){openCancelForm();applyCancelDraft(state==null?null:state.optJSONObject("cancelDraft"));}
    }
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

  private void openFareForm(){openNumericForm("FARE","ENTER FARE","Enter fare; toll and parking are optional");}
  private void openCancelForm(){if(!"CANCEL".equals(formMode)){cancelReason="";openNumericForm("CANCEL","CANCELLATION","Select reason; fee is optional");}}

  private void openNumericForm(String mode,String title,String hint){
    if(formMode!=null)return;
    formMode=mode;formValue="";tollValue="";parkingValue="";activeAmountField="fare";formSubmitting=false;tollExpanded=false;parkingExpanded=false;tollTreatmentInput=null;parkingTreatmentInput=null;tollToggle=null;parkingToggle=null;persistNativeForm();
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
      String[] choices={"PASSENGER","DRIVER"};
      for(String choice:choices){
        final String selectedChoice=choice;
        final Button reason=new Button(this);
        reason.setText(choice.equals("PASSENGER")?"Passenger cancellation":"Driver cancellation");
        reason.setTextSize(9); reason.setAllCaps(false);
        reason.setOnClickListener(v->{ cancelReason=selectedChoice; for(int i=0;i<reasons.getChildCount();i++) reasons.getChildAt(i).setAlpha(0.55f); reason.setAlpha(1f); persistNativeForm(); });
        reasons.addView(reason,new LinearLayout.LayoutParams(0,dp(40),1));
      }
      formPanel.addView(reasons,new LinearLayout.LayoutParams(-1,dp(44)));
      formInput=numericInput("Cancellation fee (optional)","fare",android.view.inputmethod.EditorInfo.IME_ACTION_DONE);
      formPanel.addView(formInput,new LinearLayout.LayoutParams(-1,dp(48)));
    }else{
      formInput=numericInput("Trip fare (optional — Skip)","fare",android.view.inputmethod.EditorInfo.IME_ACTION_NEXT);
      tollInput=numericInput("Toll (optional)","toll",android.view.inputmethod.EditorInfo.IME_ACTION_NEXT);
      parkingInput=numericInput("Parking (optional)","parking",android.view.inputmethod.EditorInfo.IME_ACTION_DONE);
      formPanel.addView(formInput,new LinearLayout.LayoutParams(-1,dp(48)));
      LinearLayout optionalActions=new LinearLayout(this);optionalActions.setGravity(Gravity.CENTER);
      tollToggle=new Button(this);tollToggle.setText("+ Toll");tollToggle.setAllCaps(false);tollToggle.setTextSize(11);
      parkingToggle=new Button(this);parkingToggle.setText("+ Parking");parkingToggle.setAllCaps(false);parkingToggle.setTextSize(11);
      optionalActions.addView(tollToggle,new LinearLayout.LayoutParams(0,dp(38),1));optionalActions.addView(parkingToggle,new LinearLayout.LayoutParams(0,dp(38),1));
      formPanel.addView(optionalActions,new LinearLayout.LayoutParams(-1,dp(40)));
      tollTreatmentInput=new CheckBox(this);tollTreatmentInput.setText("Toll paid separately");tollTreatmentInput.setTextColor(textColor());tollTreatmentInput.setTextSize(11);
      parkingTreatmentInput=new CheckBox(this);parkingTreatmentInput.setText("Parking paid separately");parkingTreatmentInput.setTextColor(textColor());parkingTreatmentInput.setTextSize(11);
      tollInput.setVisibility(View.GONE);tollTreatmentInput.setVisibility(View.GONE);parkingInput.setVisibility(View.GONE);parkingTreatmentInput.setVisibility(View.GONE);
      formPanel.addView(tollInput,new LinearLayout.LayoutParams(-1,dp(44)));formPanel.addView(tollTreatmentInput,new LinearLayout.LayoutParams(-1,dp(32)));
      formPanel.addView(parkingInput,new LinearLayout.LayoutParams(-1,dp(44)));formPanel.addView(parkingTreatmentInput,new LinearLayout.LayoutParams(-1,dp(32)));
      tollToggle.setOnClickListener(v->{tollExpanded=!tollExpanded;tollInput.setVisibility(tollExpanded?View.VISIBLE:View.GONE);tollTreatmentInput.setVisibility(tollExpanded?View.VISIBLE:View.GONE);tollToggle.setText(tollExpanded?"− Toll":"+ Toll");persistNativeForm();resizeForm();});
      parkingToggle.setOnClickListener(v->{parkingExpanded=!parkingExpanded;parkingInput.setVisibility(parkingExpanded?View.VISIBLE:View.GONE);parkingTreatmentInput.setVisibility(parkingExpanded?View.VISIBLE:View.GONE);parkingToggle.setText(parkingExpanded?"− Parking":"+ Parking");persistNativeForm();resizeForm();});
    }

    LinearLayout actions=new LinearLayout(this);actions.setGravity(Gravity.CENTER);
    if("CANCEL".equals(mode)){
      Button back=new Button(this);back.setText("Back");back.setAllCaps(false);back.setTextSize(11);back.setOnClickListener(v->{
        if(!pendingTripId.isEmpty()){String eventId=KfeNativeWorkActionsPlugin.recordPendingAction(this,"CLOSE_CANCEL_FORM",pendingTripId,"");KfeNativeWorkActionsPlugin.emitAction("CLOSE_CANCEL_FORM",pendingTripId,"",eventId);}
        closeForm();
      });
      actions.addView(back,new LinearLayout.LayoutParams(0,dp(42),1));
    }
    if("FARE".equals(mode)){
      Button skip=new Button(this);skip.setText("Skip");skip.setAllCaps(false);skip.setTextSize(11);skip.setOnClickListener(v->{formValue="";if(formInput!=null)formInput.setText("");submitNumericForm();});
      actions.addView(skip,new LinearLayout.LayoutParams(0,dp(42),1));
    }
    Button ok=new Button(this);ok.setText("CANCEL".equals(mode)?"Confirm cancellation":"Save trip");ok.setAllCaps(false);ok.setTextSize(11);ok.setOnClickListener(v->submitNumericForm());
    actions.addView(ok,new LinearLayout.LayoutParams(0,dp(42),1));
    formPanel.addView(actions,new LinearLayout.LayoutParams(-1,dp(44)));
    overlayRoot.addView(formPanel,new FrameLayout.LayoutParams(-1,"CANCEL".equals(mode)?dp(310):dp(420),Gravity.TOP));

    EditText first=formInput;
    first.postDelayed(()->{first.requestFocus();InputMethodManager imm=(InputMethodManager)getSystemService(Context.INPUT_METHOD_SERVICE);if(imm!=null)imm.showSoftInput(first,InputMethodManager.SHOW_IMPLICIT);},180);
  }

  private void resizeForm(){if(formPanel!=null){formPanel.requestLayout();if(overlayRoot!=null)overlayRoot.requestLayout();}}

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
    input.addTextChangedListener(new TextWatcher(){
      @Override public void beforeTextChanged(CharSequence text,int start,int count,int after){}
      @Override public void onTextChanged(CharSequence text,int start,int before,int count){
        String value=text==null?"":text.toString();
        if("fare".equals(field))formValue=value;else if("toll".equals(field))tollValue=value;else if("parking".equals(field))parkingValue=value;
        persistNativeForm();
      }
      @Override public void afterTextChanged(Editable editable){}
    });
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
    if(!formValue.isEmpty()){
      try{if(!Double.isFinite(Double.parseDouble(formValue))||Double.parseDouble(formValue)<0)return;}catch(Exception e){return;}
    }
    if(!tollValue.isEmpty()){
      try{if(!Double.isFinite(Double.parseDouble(tollValue))||Double.parseDouble(tollValue)<0)return;}catch(Exception e){return;}
    }
    if(!parkingValue.isEmpty()){
      try{if(!Double.isFinite(Double.parseDouble(parkingValue))||Double.parseDouble(parkingValue)<0)return;}catch(Exception e){return;}
    }
    if("CANCEL".equals(formMode)&&cancelReason.isEmpty())return;
    formSubmitting=true;
    if("FARE".equals(formMode)){
      try {
        JSONObject payload=new JSONObject();
        payload.put("fare",formValue);
        payload.put("toll",tollValue);
        payload.put("parking",parkingValue);
        payload.put("tollTreatment",tollTreatmentInput!=null&&tollTreatmentInput.isChecked()?"EXCLUDED":"INCLUDED");
        payload.put("parkingTreatment",parkingTreatmentInput!=null&&parkingTreatmentInput.isChecked()?"EXCLUDED":"INCLUDED");
        // Commit the business record before reporting success to the overlay.
        // The deterministic operation ID makes process-death/retry safe; the
        // separate native event remains queued so the PWA's IndexedDB read model
        // catches up when its WebView next runs.
        String eventId=KfeNativeWorkActionsPlugin.recordPendingAction(this,"ENTER_FARE",actionTripId,payload.toString());
        persistCanonicalTripForm("FARE",actionTripId,payload,eventId);
        KfeNativeWorkActionsPlugin.emitAction("ENTER_FARE",actionTripId,payload.toString(),eventId);
        finishNativeFormCommit();
      } catch(Exception error){
        Log.e("KFE-SWIPE","canonical fare commit failed; keeping form available",error);
        formSubmitting=false;
      }
      return;
    }else if("CANCEL".equals(formMode)){
      try{
        JSONObject input=new JSONObject();
        input.put("revenue",formValue);
        input.put("reason",cancelReason);
        String eventId=KfeNativeWorkActionsPlugin.recordPendingAction(this,"CANCEL_RIDE",pendingTripId,input.toString());
        persistCanonicalTripForm("CANCEL",pendingTripId,input,eventId);
        KfeNativeWorkActionsPlugin.emitAction("CANCEL_RIDE",pendingTripId,input.toString(),eventId);
        finishNativeFormCommit();
      }catch(Exception error){
        Log.e("KFE-SWIPE","canonical cancellation commit failed; keeping form available",error);
        formSubmitting=false;
      }
      return;
    }
  }

  
  private boolean persistCanonicalTripStage(String stage, boolean rideStarted, String eventId){
    try{
      JSONObject root=new JSONObject(getSharedPreferences("kfe_overlay",MODE_PRIVATE).getString(LAST_STATE_KEY,"{}"));
      JSONObject shift=root.optJSONObject("shift");
      if(shift==null||shift.optString("id","").isEmpty()||pendingTripId.isEmpty())return false;
      KfeCanonicalWorkStore store=KfeCanonicalWorkStore.get(this);
      // The native event row is the durable identity for this lifecycle action.
      // Reuse its creation time so a retry after commit/lost acknowledgement
      // recreates the exact same canonical payload and operation ID.
      String eventTimestamp=java.time.Instant.ofEpochMilli(
          KfeNativeEventStore.get(this).createdAtMillis(eventId)).toString();
      JSONObject found=store.getRecord("TRIP",pendingTripId);
      JSONObject trip=found.optJSONObject("record");
      if(trip==null){
        JSONObject snapshotTrip=root.optJSONObject("trip");
        trip=snapshotTrip!=null&&pendingTripId.equals(snapshotTrip.optString("id",""))
          ?new JSONObject(snapshotTrip.toString()):new JSONObject();
      }
      trip.put("id",pendingTripId); trip.put("shiftId",shift.optString("id"));
      if(!defaultOperator.isEmpty()&&!trip.has("operator"))trip.put("operator",defaultOperator);
      trip.put("status","COMPLETED".equals(stage)?"COMPLETED":"ACTIVE");
      trip.put("tripStage","COMPLETED".equals(stage)?"COMPLETED":stage);
      if(!trip.has("createdAt"))trip.put("createdAt",eventTimestamp);
      if(rideStarted){
        trip.put("tripStartAt",new java.util.Date(tripStartAt).toInstant().toString());
        if(!trip.has("rideStartLocation"))trip.put("rideStartLocationStatus","MISSING");
        trip.put("rideStartLocationEventAt",new java.util.Date(tripStartAt).toInstant().toString());
      }
      if("COMPLETED".equals(stage)){
        if(!trip.has("tripEndAt")||trip.isNull("tripEndAt")||trip.optString("tripEndAt","").isEmpty())trip.put("tripEndAt",eventTimestamp);
        trip.put("tripEndLocationStatus",trip.has("tripEndLocation")&&!trip.isNull("tripEndLocation")?"CAPTURED":"MISSING");
      }
      trip.put("updatedAt",eventTimestamp);
      KfeCanonicalWorkStore.Outcome outcome=store.putRecord("native-trip-stage-"+eventId,"TRIP",trip);
      if(!outcome.accepted)throw new IllegalStateException("Canonical trip lifecycle stage was not acknowledged.");
      return true;
    }catch(Exception error){Log.e("KFE-CANONICAL","Could not persist native trip stage",error);return false;}
  }
  private void refreshCanonicalRevenue(String shiftId,String sourceTripId,String sourceUpdatedAt) throws Exception {
    if(shiftId==null||shiftId.isEmpty())throw new IllegalArgumentException("Shift ID is required for revenue projection.");
    org.json.JSONArray records=KfeCanonicalWorkStore.get(this).listRecords("TRIP",1000).optJSONArray("records");
    double total=0d;
    if(records!=null)for(int i=0;i<records.length();i++){
      JSONObject trip=records.optJSONObject(i); if(trip==null||!shiftId.equals(trip.optString("shiftId","")))continue;
      if("COMPLETED".equals(trip.optString("status"))&&!trip.optBoolean("fareDetailsSkipped",false)){
        Object v=trip.opt("revenue");if(v instanceof Number&&((Number)v).doubleValue()>=0d)total+=((Number)v).doubleValue();
      }else if("CANCELLED".equals(trip.optString("status"))){
        Object v=trip.has("cancelledRevenue")&&!trip.isNull("cancelledRevenue")?trip.opt("cancelledRevenue"):trip.opt("revenue");
        if(v instanceof Number&&((Number)v).doubleValue()>=0d)total+=((Number)v).doubleValue();
      }
    }
    KfeCanonicalWorkStore store=KfeCanonicalWorkStore.get(this);
    JSONObject foundShift=store.getRecord("SHIFT",shiftId);
    JSONObject shift=foundShift.optJSONObject("record");
    if(shift==null)throw new IllegalStateException("Canonical shift is missing; revenue projection was not acknowledged.");
    shift.put("revenue",total);shift.put("liveFareRevenue",total);shift.put("revenueSource","TRIP_FARES");
    String updatedAt=new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",java.util.Locale.US){{
      setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
    }}.format(new java.util.Date());
    shift.put("updatedAt",updatedAt);
    String revision=(sourceUpdatedAt==null?"":sourceUpdatedAt).replaceAll("[^A-Za-z0-9]","");
    KfeCanonicalWorkStore.Outcome outcome=store.putRecord("native-shift-revenue-"+shiftId+"-"+sourceTripId+"-"+revision,"SHIFT",shift);
    if(!outcome.accepted)throw new IllegalStateException("Canonical shift revenue projection was not acknowledged.");
    revenue="₹"+String.format(java.util.Locale.US,"%.0f",total);if(overlay!=null)overlay.postInvalidate();
  }

  private void persistCanonicalTripForm(String mode,String tripId,JSONObject input,String eventId) throws Exception {
    if(tripId==null||tripId.trim().isEmpty())throw new IllegalArgumentException("Trip ID is required.");
    JSONObject trip=null;
    KfeCanonicalWorkStore canonical=KfeCanonicalWorkStore.get(this);
    JSONObject found=canonical.getRecord("TRIP",tripId);
    if(found.optBoolean("found",false))trip=found.optJSONObject("record");
    String raw=getSharedPreferences("kfe_overlay",MODE_PRIVATE).getString(LAST_STATE_KEY,"");
    if(!raw.isEmpty()){
      JSONObject root=new JSONObject(raw);
      JSONObject candidate=root.optJSONObject("trip");
      if(candidate!=null&&tripId.equals(candidate.optString("id",""))){
        if(trip==null)trip=new JSONObject(candidate.toString());
        else {
          // The native canonical record wins on every field it already owns.
          // The persisted PWA snapshot may be stale (for example after a lost
          // bridge acknowledgement), so it may only fill fields absent from
          // the canonical record; it must never roll canonical values backward.
          java.util.Iterator<String> keys=candidate.keys();
          while(keys.hasNext()){
            String key=keys.next();
            if(!trip.has(key)&&!candidate.isNull(key))trip.put(key,candidate.get(key));
          }
        }
      }
    }
    if(trip==null)throw new IllegalStateException("The last known trip record is unavailable; form was not marked saved.");
    if(eventId==null||eventId.trim().isEmpty())throw new IllegalArgumentException("Durable form event ID is required.");
    String operationId="native-form-"+mode+"-"+eventId;
    long eventTimestamp=KfeNativeEventStore.get(this).createdAtMillis(eventId);
    String now=new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",java.util.Locale.US){{
      setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
    }}.format(new java.util.Date(eventTimestamp));
    if("FARE".equals(mode)){
      trip.put("status","COMPLETED");
      if(!input.optString("fare","").trim().isEmpty())trip.put("revenue",Double.parseDouble(input.optString("fare")));
      else trip.put("revenue",JSONObject.NULL);
      trip.put("fareDetailsSkipped",input.optString("fare","").trim().isEmpty());
      trip.put("revenueAuthority","SUPPORTING_ONLY");
      trip.put("toll",input.optString("toll","").trim().isEmpty()?0d:Double.parseDouble(input.optString("toll")));
      trip.put("parking",input.optString("parking","").trim().isEmpty()?0d:Double.parseDouble(input.optString("parking")));
      trip.put("tollTreatment",input.optString("tollTreatment","INCLUDED"));
      trip.put("parkingTreatment",input.optString("parkingTreatment","INCLUDED"));
    }else if("CANCEL".equals(mode)){
      trip.put("status","CANCELLED");
      trip.put("cancelReason",input.optString("reason",""));
      String revenueValue=input.optString("revenue","");
      trip.put("cancelledRevenue",revenueValue.trim().isEmpty()?JSONObject.NULL:Double.parseDouble(revenueValue));
    }else throw new IllegalArgumentException("Unsupported native form mode.");
    if(trip.isNull("tripEndAt")||trip.optString("tripEndAt","").isEmpty())trip.put("tripEndAt",now);
    trip.put("updatedAt",now);
    KfeCanonicalWorkStore.Outcome outcome=canonical.putRecord(operationId,"TRIP",trip);
    if(!outcome.accepted)throw new IllegalStateException("Canonical trip form was not accepted.");
    refreshCanonicalRevenue(trip.optString("shiftId",""),tripId,trip.optString("updatedAt",""));
  }

  private void finishNativeFormCommit(){
    formSubmitting=false;
    if("CANCEL".equals(formMode))KfeNativeGpsService.stop(this,pendingTripId);
    closeForm();
    actionStage="GO_TO_PICKUP";
    pendingTripId="";
    pendingFareTripId="";
    tripStartAt=0L;
    phaseStartAt=System.currentTimeMillis(); phaseLabel="READY TIME";
    awaitingEventId="";awaitingStage="";awaitingTripId="";
    persistNativeWorkflow();
    animateRetract();
    if(overlay!=null)overlay.invalidate();
  }

  private void closeForm(){closeForm(true);}
  private void closeForm(boolean clearDraft){
    if(formPanel!=null&&overlayRoot!=null)overlayRoot.removeView(formPanel);
    formPanel=null;formMode=null;formValue="";tollValue="";parkingValue="";formSubmitting=false;formInput=null;tollInput=null;parkingInput=null;tollTreatmentInput=null;parkingTreatmentInput=null;tollToggle=null;parkingToggle=null;if(clearDraft)getSharedPreferences("kfe_overlay",MODE_PRIVATE).edit().remove("formMode").remove("formValue").remove("tollValue").remove("parkingValue").remove("cancelReason").remove("cancelFormPwaSynchronized").remove("tollExpanded").remove("parkingExpanded").remove("tollExcluded").remove("parkingExcluded").apply();
    if(params!=null){params.height=dp(COLLAPSED_TOTAL_DP);params.flags=WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;params.softInputMode=WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING;if(windowManager!=null&&overlayRoot!=null)windowManager.updateViewLayout(overlayRoot,params);}
    if(overlay!=null)overlay.invalidate();
  }

  private int textColor(){return dark()?Color.rgb(232,237,242):Color.rgb(23,32,42);}
  private int mutedColor(){return dark()?Color.rgb(184,194,205):Color.rgb(91,102,115);}
  private int actionColor(){if("END_RIDE".equals(actionStage))return swipeEndColor;if("START_RIDE".equals(actionStage))return swipeStartColor;
    if("CANCELLED".equals(actionStage)||"CANCEL_RIDE".equals(actionStage))return dark()?Color.rgb(255,190,80):Color.rgb(190,120,0);
    return swipePickupColor;}
  private String formatPhaseTime(){long start=phaseStartAt;if("END_RIDE".equals(actionStage)&&tripStartAt>0L)start=tripStartAt;if(start<=0L)return "00:00:00";long elapsed=Math.max(0L,System.currentTimeMillis()-start)/1000L;long h=elapsed/3600L,m=(elapsed%3600L)/60L,s=elapsed%60L;return String.format(java.util.Locale.US,"%02d:%02d:%02d",h,m,s);}
  private int targetColor(){if(targetProgress>=100)return dark()?Color.rgb(80,220,130):Color.rgb(20,145,75);if(targetProgress>=70)return dark()?Color.rgb(255,205,90):Color.rgb(190,125,0);return actionColor();}
  // KFE is dark-only: ignore stale persisted theme values so white action text can never land on a white overlay surface.
  private boolean dark(){return true;}
  private void removeOverlay(){removeOverlay(false);}
  private void removeOverlay(boolean preserveFormDraft){closeForm(!preserveFormDraft);if(windowManager!=null&&overlayRoot!=null){try{windowManager.removeView(overlayRoot);}catch(Exception ignored){}}overlayRoot=null;overlay=null;}
  @Override public void onDestroy(){if(foregroundHandler!=null)foregroundHandler.removeCallbacks(foregroundCheck);removeOverlay(true);if(instance==this)instance=null;super.onDestroy();}
  @Override public IBinder onBind(Intent intent){return null;}
  private Notification buildNotification(){
    // This notice exists for the Android foreground-service lifecycle only.
    // Keep it quiet and independent of Work stage, GPS readings, and dead KM.
    String title="KFE background service";
    String text="KFE driver controls are active in the background.";
    Intent openApp=new Intent(this,MainActivity.class);
    openApp.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
    int pendingFlags=PendingIntent.FLAG_UPDATE_CURRENT;
    if(android.os.Build.VERSION.SDK_INT>=android.os.Build.VERSION_CODES.M) pendingFlags|=PendingIntent.FLAG_IMMUTABLE;
    PendingIntent contentIntent=PendingIntent.getActivity(this,4202,openApp,pendingFlags);
    return new NotificationCompat.Builder(this,CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle(title)
      .setContentText(text)
      .setContentIntent(contentIntent)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .build();
  }
  private void createChannel(){if(android.os.Build.VERSION.SDK_INT>=android.os.Build.VERSION_CODES.O){NotificationManager m=(NotificationManager)getSystemService(Context.NOTIFICATION_SERVICE);if(m!=null)m.createNotificationChannel(new NotificationChannel(CHANNEL_ID,"KFE Overlay",NotificationManager.IMPORTANCE_LOW));}}
  private int dp(int v){return (int)(v*getResources().getDisplayMetrics().density+0.5f);}
  private float dpf(float v){return v*getResources().getDisplayMetrics().density;}

  private class SwipeOverlayView extends View{
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);private final RectF rect=new RectF();
    private float downX,downY,downLocalX,downLocalY,lastX,lastY;private boolean tracking,moving,swipeLocked,swipeEligible,swipeMoved;private float progress,downProgress;
    private String formatTripTime(){
      if(tripStartAt<=0) return "00:00:00";
      long elapsed=Math.max(0L,System.currentTimeMillis()-tripStartAt)/1000L;
      long h=elapsed/3600L,m=(elapsed%3600L)/60L,s=elapsed%60L;
      return String.format(java.util.Locale.US,"%02d:%02d:%02d",h,m,s);
    }
    SwipeOverlayView(Context c){super(c);setClickable(true);setLayerType(View.LAYER_TYPE_SOFTWARE,null);}
    private int surface(){return dark()?Color.rgb(23,30,38):Color.WHITE;}
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
      // Target, live distance, trip timer and revenue remain the compact primary metrics.
      float[] cols={.14f,.38f,.62f,.86f};
      String[] labels={"TARGET",resolveMovementLabel(actionStage),phaseLabel,"REVENUE"};
      String movementValue=resolveMovementValue(actionStage,deadKm,liveKm);
      String[] values={target,movementValue,formatPhaseTime(),revenue};
      for(int i=0;i<4;i++){text(9,mutedColor(),true);center(c,labels[i],w*cols[i],barTop+dp(23));text(15,i==0?targetColor():(i==1?a:textColor()),true);center(c,values[i],w*cols[i],barTop+dp(44));}
      if("END_RIDE".equals(actionStage)||"START_RIDE".equals(actionStage)||phaseStartAt>0L) postInvalidateDelayed(1000);
      boolean gpsActive=KfeNativeGpsService.isAnyPersistedTracking(KfeOverlayService.this);
      text(9,gpsActive?(dark()?Color.rgb(98,209,138):Color.rgb(22,128,60)):mutedColor(),true);
      center(c,gpsActive?"GPS ●":"GPS ○",w*.20f,barTop+dp(62));
      if("CANCELLED".equals(actionStage)){
        text(11,a,true);center(c,"CANCELLED · "+cancellationRevenue,w*.50f,barTop+dp(77));
        text(10,mutedColor(),false);center(c,"Same trip · cancellation recorded",w*.50f,barTop+dp(95));
      }else{
        String stateLabel=resolveActionLabel(actionStage);
        if("ENTER_FARE".equals(actionStage)){
          text(11,a,true);center(c,"FARE REQUIRED · TAP TO OPEN",w*.50f,barTop+dp(79));
        }else if(!stateLabel.isEmpty()){
          String pendingLabel=awaitingEventId.isEmpty()?"":"WAITING FOR APP · "+shortEventId(awaitingEventId);
          String prefix=awaitingEventId.isEmpty()?"SWIPE TO ":"";String shown=awaitingEventId.isEmpty()?stateLabel:pendingLabel;
          text(11,mutedColor(),true);float total=measureAction(prefix,11)+dp(4)+measureAction(shown,11);float startX=w/2f-total/2f;
          if(!prefix.isEmpty())c.drawText(prefix,startX,barTop+dp(79),paint);text(11,awaitingEventId.isEmpty()?a:Color.rgb(255,190,80),true);c.drawText(shown,startX+measureAction(prefix,11)+dp(4),barTop+dp(79),paint);
        }
      }
      if(!"ENTER_FARE".equals(actionStage)){
        int thumbW=dp(58),pad=dp(8);float tx=pad+(w-pad*2-thumbW)*progress;
        paint.setStyle(Paint.Style.FILL);paint.setColor(a);rect.set(tx,barTop+dp(100),tx+thumbW,barTop+dp(124));c.drawRoundRect(rect,dp(12),dp(12),paint);
        // Visual-only affordance: dark high-contrast chevron on the semantic-colour thumb.
        text(22,Color.rgb(16,21,27),true);center(c,"›",tx+thumbW/2f,barTop+dp(119));
      }
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
      retractAnimator.setDuration(swipeReturnDurationMs);
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
          downX=e.getRawX();downY=e.getRawY();downLocalX=e.getX();downLocalY=e.getY();lastX=downX;lastY=downY;tracking=true;moving=false;downProgress=progress;
          float localX=e.getX(),localY=e.getY();
          // The touch lane spans the complete handle track. A partially displaced
          // thumb must remain recoverable instead of becoming impossible to grab.
          swipeLocked=!minimized&&localY>=dp(96)&&localY<=dp(140);
          swipeEligible=swipeLocked&&awaitingEventId.isEmpty()&&
            ("GO_TO_PICKUP".equals(actionStage)||"START_RIDE".equals(actionStage)||"END_RIDE".equals(actionStage));
          swipeMoved=false;
          Log.d("KFE-SWIPE","down stage="+actionStage+" x="+downLocalX+" y="+downLocalY+" eligible="+swipeEligible+" pending="+shortEventId(awaitingEventId));
          return true;}
        case MotionEvent.ACTION_MOVE:{
          float dx=e.getX()-downLocalX,dy=e.getRawY()-downY;
          if(swipeLocked){
            if(swipeEligible){
              float maxTravel=Math.max(1,getWidth()-dp(16)-dp(58));
              progress=KfeSwipeGesture.progress(downProgress*maxTravel+dx,maxTravel);
              swipeMoved=KfeSwipeGesture.hasMovedRight(dx,dp(8));
              Log.d("KFE-SWIPE","move stage="+actionStage+" startX="+downLocalX+" x="+e.getX()+" dx="+dx+" progress="+progress+" movedRight="+swipeMoved+" pending="+shortEventId(awaitingEventId));
              invalidate();
            }
            return true;
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
          float fx=e.getX()-downLocalX,fy=e.getRawY()-downY;tracking=false;
          if(minimized&&moving){
            int screenWidth=getResources().getDisplayMetrics().widthPixels;
            params.x=downX<screenWidth/2f?0:Math.max(0,screenWidth-dp(BUBBLE_DP));
            getSharedPreferences("kfe_overlay",MODE_PRIVATE).edit().putInt("x",params.x).putInt("y",params.y).apply();
            if(windowManager!=null)windowManager.updateViewLayout(overlayRoot,params);return true;
          }
          if(minimized&&!moving&&Math.abs(fx)<dp(16)&&Math.abs(fy)<dp(16)){
            expandFromBubble();
            openFormForCurrentState();
            return true;
          }
          if(!minimized&&!moving&&awaitingEventId.isEmpty()&&"START_RIDE".equals(actionStage)&&downLocalX>getWidth()-dp(120)&&downLocalY>=dp(60)&&downLocalY<=dp(110)){requestPwaForm("OPEN_CANCEL_FORM");return true;}
          if(!minimized&&!moving&&"ENTER_FARE".equals(actionStage)&&downLocalY>=dp(58)&&downLocalY<=dp(96)){if(!"FARE".equals(formMode))openFareForm();return true;}
          float maxTravel=Math.max(1,getWidth()-dp(16)-dp(58));
          if(swipeLocked){
            float finalProgress=KfeSwipeGesture.progress(downProgress*maxTravel+fx,maxTravel);
            boolean commit=swipeEligible&&KfeSwipeGesture.hasMovedRight(fx,dp(8))&&finalProgress>=swipeCommitThresholdPercent/100f;
            progress=finalProgress;
            Log.i("KFE-SWIPE","release stage="+actionStage+" startX="+downLocalX+" x="+e.getX()+" dx="+fx+" progress="+finalProgress+" threshold="+(swipeCommitThresholdPercent/100f)+" eligible="+swipeEligible+" pending="+shortEventId(awaitingEventId)+" commit="+commit);
            if(commit){
              progress=1;invalidate();triggerAction();
            }else{
              animateRetract();
            }
            tracking=false;moving=false;swipeLocked=false;swipeEligible=false;swipeMoved=false;return true;
          }
          progress=0;invalidate();tracking=false;moving=false;return true;}
        case MotionEvent.ACTION_CANCEL:tracking=false;moving=false;swipeLocked=false;swipeEligible=false;swipeMoved=false;animateRetract();return true;
      }return true;
    }
  }
}