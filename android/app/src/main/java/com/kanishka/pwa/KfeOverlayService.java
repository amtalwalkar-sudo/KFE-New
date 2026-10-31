package com.kanishka.pwa;

import android.animation.ValueAnimator;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.os.Looper;
import android.os.CancellationSignal;
import android.location.LocationManager;
import android.location.LocationListener;
import android.location.Location;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.drawable.ColorDrawable;
import android.graphics.PixelFormat;
import android.os.IBinder;
import android.os.Build;
import android.os.Handler;
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
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;
import org.json.JSONArray;
import java.util.concurrent.atomic.AtomicBoolean;

public class KfeOverlayService extends Service {
  static volatile KfeOverlayService instance;
  static final String ACTION_PREPARE="com.kanishka.pwa.KFE_OVERLAY_PREPARE";
  static final String ACTION_SHOW="com.kanishka.pwa.KFE_OVERLAY_SHOW";
  static final String ACTION_UPDATE="com.kanishka.pwa.KFE_OVERLAY_UPDATE";
  static final String ACTION_HIDE="com.kanishka.pwa.KFE_OVERLAY_HIDE";
  static final String ACTION_MINIMIZE="com.kanishka.pwa.KFE_OVERLAY_MINIMIZE";
  static final String ACTION_FARE_SAVED="com.kanishka.pwa.KFE_OVERLAY_FARE_SAVED";
  static final String ACTION_CANCEL_SAVED="com.kanishka.pwa.KFE_OVERLAY_CANCEL_SAVED";
  static final String ACTION_RETRY_PENDING_GPS="com.kanishka.pwa.KFE_RETRY_PENDING_GPS";
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
  private Button tollToggle;
  private Button parkingToggle;
  private boolean tollExpanded=false;
  private boolean parkingExpanded=false;
  private String theme="dark";
  private String rides="0", revenue="₹0", pendingTripId="", pendingFareTripId="", cancellationRevenue="₹0";
  private long tripStartAt=0L;
  private long phaseStartAt=0L;
  private String phaseLabel="TRIP TIME";
  private String defaultOperator="";
  private int swipeCommitThresholdPercent=70, swipeReturnDurationMs=220;
  private int swipePickupColor=Color.rgb(120,162,255), swipeStartColor=Color.rgb(98,209,138), swipeEndColor=Color.rgb(255,133,133);
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
  private LinearLayout formPanel;
  private LinearLayout cancelReasonPanel;
  private android.os.Handler foregroundHandler;
  private final java.util.Set<String> gpsCaptureInFlight=java.util.Collections.synchronizedSet(new java.util.HashSet<>());
  private final Runnable pendingGpsRetry=()->retryPendingEventLocations();

  static String resolveFareActionTripId(String pendingFareTripId, String currentTripId){
    if(pendingFareTripId!=null&&!pendingFareTripId.isEmpty())return pendingFareTripId;
    return currentTripId==null?"":currentTripId;
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
  static void retryPendingLocations(Context context){Intent i=new Intent(context,KfeOverlayService.class);i.setAction(ACTION_RETRY_PENDING_GPS);ContextCompat.startForegroundService(context,i);}
  static int pendingEventLocationCount(Context context){return new KfeGpsEventJournal(context).count();}
  static boolean queueEventLocationCapture(Context context,String tripId,String eventType){
    return queueEventLocationCapture(context,"TRIP",tripId,eventType,"");
  }
  static boolean queueEventLocationCapture(Context context,String entityType,String entityId,String eventType,String eventAt){
    if(entityType==null||entityType.trim().isEmpty()||entityId==null||entityId.trim().isEmpty()||!KfeGpsEventPolicy.supports(entityType,eventType))return false;
    try{
      if(!new KfeGpsEventJournal(context).enqueue(entityType,entityId,eventType,eventAt))throw new IllegalStateException("Pending GPS event journal was not committed.");
      boolean fine=ContextCompat.checkSelfPermission(context,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED;
      boolean background=Build.VERSION.SDK_INT<Build.VERSION_CODES.Q||ContextCompat.checkSelfPermission(context,Manifest.permission.ACCESS_BACKGROUND_LOCATION)==PackageManager.PERMISSION_GRANTED;
      if(fine&&background)retryPendingLocations(context);
      else Log.i("KFE-GPS","Event "+KfeGpsEventPolicy.key(entityType,entityId,eventType)+" durably queued; background capture is disabled until required permissions are granted.");
      return true;
    }catch(Exception error){Log.e("KFE-GPS","Could not queue PWA event GPS capture.",error);return false;}
  }
  
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
  private static boolean isCanonicalActiveShiftState(Context context,String raw) throws Exception {
    if(!isResumableState(raw))return false;
    JSONObject state=new JSONObject(raw);
    JSONObject shift=state.optJSONObject("shift");
    String shiftId=shift==null?"":shift.optString("id","");
    if(shiftId.isEmpty())return false;
    JSONObject result=KfeCanonicalWorkStore.get(context).getRecord("SHIFT",shiftId);
    JSONObject record=result.optJSONObject("record");
    return result.optBoolean("found",false)&&record!=null&&"ACTIVE".equals(record.optString("status",""));
  }
  private boolean restorePersistedOverlayIfCanonicalShiftActive(){
    String saved=getSharedPreferences("kfe_overlay",MODE_PRIVATE).getString(LAST_STATE_KEY,"");
    if(saved.isEmpty())return false;
    try{
      if(!isCanonicalActiveShiftState(this,saved)){
        clearPersistedOverlayState(this);
        return false;
      }
      ensureOverlay();
      applyState(saved);
      return true;
    }catch(Exception error){
      // Unknown canonical state is not proof that a shift is active. Keep the
      // durable snapshot/checkpoint for recovery, but do not show a stale overlay.
      Log.e("KFE-OVERLAY","Cannot verify canonical shift before overlay restore.",error);
      return false;
    }
  }
  public static void resumePersisted(Context context){
    // Boot/activity recovery must not resurrect an ended shift from a stale
    // presentation snapshot. SQLite remains authoritative for shift status.
    if(!Settings.canDrawOverlays(context)||!hasPersistedOverlayState(context))return;
    String saved=context.getSharedPreferences("kfe_overlay",MODE_PRIVATE).getString(LAST_STATE_KEY,"");
    try{
      if(!isCanonicalActiveShiftState(context,saved)){
        clearPersistedOverlayState(context);
        context.stopService(new Intent(context,KfeOverlayService.class));
        return;
      }
    }catch(Exception error){
      // Preserve the snapshot for recovery, but fail closed on visibility until
      // canonical shift status can be verified.
      android.util.Log.e("KFE-OVERLAY","Cannot verify canonical shift before persisted resume.",error);
      context.stopService(new Intent(context,KfeOverlayService.class));
      return;
    }
    Intent i=new Intent(context,KfeOverlayService.class);
    i.setAction("com.kanishka.pwa.KFE_OVERLAY_RESUME");
    ContextCompat.startForegroundService(context,i);
  }

  @Override public void onCreate(){super.onCreate();instance=this;
    restoreNativeWorkflowCheckpoint();
    createChannel();startOverlayForeground(false);foregroundHandler=new android.os.Handler(getMainLooper());
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
    awaitingEventId=saved.getString("awaitingEventId","");
    awaitingStage=saved.getString("awaitingStage","");
    awaitingTripId=saved.getString("awaitingTripId","");
    if(!awaitingEventId.isEmpty()){
      Log.w("KFE-SWIPE","pending-action recovery required event="+shortEventId(awaitingEventId)+" stage="+awaitingStage+" trip="+shortEventId(awaitingTripId)+" action remains locked; durable queue replay/ack required");
      if(KfeNativeEventStore.get(this).isAcknowledged(awaitingEventId)){
        // The overlay root is not attached until onStartCommand. Defer UI work
        // until applyState so a recovered acknowledgement cannot touch null views.
        acknowledgedEventNeedsRecovery=true;
      }
    }
  }

  @Override public int onStartCommand(Intent intent,int flags,int startId){
    if(intent==null){
      if(hasPendingEventLocations() && hasBackgroundLocationPermission()){retryPendingEventLocations();return START_STICKY;}
      if(Settings.canDrawOverlays(this)&&restorePersistedOverlayIfCanonicalShiftActive())return START_STICKY;
      removeOverlay(true);stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();return START_NOT_STICKY;
    }
    String action=intent.getAction();
    if(ACTION_RETRY_PENDING_GPS.equals(action)){
      if(!hasPendingEventLocations() || !hasBackgroundLocationPermission()){stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();return START_NOT_STICKY;}
      retryPendingEventLocations();return START_STICKY;
    }
    // An explicit restart may arrive with an Intent whose action is null. Restore
    // the last valid shift snapshot so the overlay and any persisted form draft
    // are reattached instead of leaving the foreground service invisible.
    if(action==null){
      if(Settings.canDrawOverlays(this)&&restorePersistedOverlayIfCanonicalShiftActive())return START_STICKY;
      removeOverlay(true);stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();return START_NOT_STICKY;
    }
    if ("com.kanishka.pwa.KFE_OVERLAY_RESUME".equals(action)) {
      if (!Settings.canDrawOverlays(this)) return START_NOT_STICKY;
      if(restorePersistedOverlayIfCanonicalShiftActive())return START_STICKY;
      removeOverlay(true);stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();return START_NOT_STICKY;
    }
    if(ACTION_HIDE.equals(action)){clearPersistedOverlayState(this);removeOverlay();if(hasPendingEventLocations()&&hasBackgroundLocationPermission()){retryPendingEventLocations();return START_STICKY;}stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();return START_NOT_STICKY;}
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
        if(hasPendingEventLocations()&&hasBackgroundLocationPermission()){
          retryPendingEventLocations();
          return;
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
        return;
      }
      theme="dark";
      rides=root.optString("rides","0");
      defaultOperator=root.optString("defaultOperator",defaultOperator);
      JSONObject swipeConfig=root.optJSONObject("swipeConfig");
      if(swipeConfig!=null){ swipeCommitThresholdPercent=Math.max(50,Math.min(95,swipeConfig.optInt("commitThresholdPercent",70))); swipeReturnDurationMs=Math.max(80,Math.min(500,swipeConfig.optInt("returnDurationMs",220))); try{swipePickupColor=Color.parseColor(swipeConfig.optString("pickupColor","#78A2FF"));swipeStartColor=Color.parseColor(swipeConfig.optString("startColor","#62D18A"));swipeEndColor=Color.parseColor(swipeConfig.optString("endColor","#FF8585"));}catch(Exception ignored){} }
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
      hideIfKfeActivityForeground();
    }catch(Exception ignored){ overlay.invalidate(); }
  }

  private void persistNativeForm(){
    KfeNativeTripFormDraftStore.save(getSharedPreferences("kfe_overlay",MODE_PRIVATE),
        new KfeNativeTripFormDraftStore.Draft(formMode,formValue,tollValue,parkingValue,cancelReason,
            cancelFormPwaSynchronized,tollExpanded,parkingExpanded));
  }

  private void applyFareDraft(JSONObject draft){
    if(draft==null)return;
    formValue=draft.optString("fare","");tollValue=draft.optString("tripToll","");parkingValue=draft.optString("tripParking","");
    tollExpanded=!tollValue.isEmpty();
    parkingExpanded=!parkingValue.isEmpty();
    if(formInput!=null)formInput.setText(formValue);
    if(tollInput!=null){tollInput.setText(tollValue);tollInput.setVisibility(tollExpanded?View.VISIBLE:View.GONE);}
    if(parkingInput!=null){parkingInput.setText(parkingValue);parkingInput.setVisibility(parkingExpanded?View.VISIBLE:View.GONE);}
    if(tollToggle!=null)tollToggle.setText(tollExpanded?"− Toll":"+ Toll");
    if(parkingToggle!=null)parkingToggle.setText(parkingExpanded?"− Parking":"+ Parking");
    persistNativeForm();
  }

  private void applyCancelDraft(JSONObject draft){
    if(draft==null)return;
    cancelReason=draft.optString("cancelReason","");formValue=draft.optString("cancelFare","");
    if(formInput!=null)formInput.setText(formValue);
    restoreCancelReasonSelection();
    persistNativeForm();
  }

  private void restoreCancelReasonSelection(){
    LinearLayout reasons=cancelReasonPanel;
    if(reasons==null)return;
    for(int i=0;i<reasons.getChildCount();i++){
      View child=reasons.getChildAt(i);
      if(!(child instanceof Button))continue;
      String label=String.valueOf(((Button)child).getText());
      boolean selected=("PASSENGER".equals(cancelReason)&&label.contains("Passenger"))
          ||("DRIVER".equals(cancelReason)&&label.contains("Driver"));
      child.setAlpha(selected?1f:0.55f);
    }
  }

  private void restorePersistedFormIfNeeded(){
    if(formMode!=null||minimized)return;
    android.content.SharedPreferences saved=getSharedPreferences("kfe_overlay",MODE_PRIVATE);
    KfeNativeTripFormDraftStore.Draft draft=KfeNativeTripFormDraftStore.load(saved);
    String mode=draft.mode;
    String savedFare=draft.fare;
    String savedToll=draft.toll;
    String savedParking=draft.parking;
    String savedReason=draft.reason;
    cancelFormPwaSynchronized=draft.cancelFormPwaSynchronized;
    boolean savedTollExpanded=draft.tollExpanded;
    boolean savedParkingExpanded=draft.parkingExpanded;
    if("FARE".equals(mode)&&"ENTER_FARE".equals(actionStage))openFareForm();
    else if("CANCEL".equals(mode)&&"START_RIDE".equals(actionStage))openCancelForm();
    else return;
    formValue=savedFare;tollValue=savedToll;parkingValue=savedParking;cancelReason=savedReason;
    tollExpanded=savedTollExpanded;parkingExpanded=savedParkingExpanded;
    if(formInput!=null)formInput.setText(formValue);
    if(tollInput!=null){tollInput.setText(tollValue);tollInput.setVisibility(tollExpanded?View.VISIBLE:View.GONE);}
    if(parkingInput!=null){parkingInput.setText(parkingValue);parkingInput.setVisibility(parkingExpanded?View.VISIBLE:View.GONE);}
    if(tollToggle!=null)tollToggle.setText(tollExpanded?"− Toll":"+ Toll");
    if(parkingToggle!=null)parkingToggle.setText(parkingExpanded?"− Parking":"+ Parking");
    if("CANCEL".equals(mode))restoreCancelReasonSelection();
    persistNativeForm();
  }

  private void onCancelSaved(){formSubmitting=false;closeForm();captureOneShotEventLocation(pendingTripId, "TRIP_CANCELLED");actionStage="GO_TO_PICKUP";pendingTripId="";pendingFareTripId="";tripStartAt=0L;phaseStartAt=System.currentTimeMillis();phaseLabel="READY TIME";awaitingEventId="";awaitingStage="";awaitingTripId="";persistNativeWorkflow();if(overlay!=null)overlay.invalidate();}

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
    // SQLite is the durable hand-off and native trip state is committed before
    // dispatch. Advance the overlay only after that canonical write succeeds so a
    // suspended WebView cannot block offline trip execution. When Work resumes it
    // reconciles an already-committed trip state and acknowledges this same event;
    // it only runs the legacy action handler if the native commit never completed.
    if(!awaitingEventId.isEmpty()) return;
    if("GO_TO_PICKUP".equals(actionStage)){
      if(pendingTripId.isEmpty()) pendingTripId=java.util.UUID.randomUUID().toString();
      // Persist the generated trip ID before writing either durable store. If
      // killed at any later boundary, a retry resumes this same logical trip.
      String eventId;
      try { eventId=persistLifecycleAction("GO_TO_PICKUP","GOING_TO_PICKUP",false); }
      catch(RuntimeException failure){Log.e("KFE-CANONICAL","GO_TO_PICKUP lifecycle persistence interrupted; retry is safe",failure);Toast.makeText(this,"Trip action is queued for recovery. Keep this trip open and retry when storage is available.",Toast.LENGTH_LONG).show();return;}
      captureOneShotEventLocation(pendingTripId, "PICKUP_START");
      phaseStartAt=System.currentTimeMillis(); phaseLabel="PICKUP TIME";
      actionStage="START_RIDE"; pendingFareTripId="";
      awaitingEventId=""; awaitingStage=""; awaitingTripId="";
      persistNativeWorkflow();  animateRetract(); overlay.invalidate();
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
      
      captureOneShotEventLocation(pendingTripId, "TRIP_START");
      actionStage="END_RIDE"; phaseStartAt=tripStartAt; phaseLabel="TRIP TIME";
      getSharedPreferences("kfe_overlay",MODE_PRIVATE).edit()
        .putLong("tripStartAt",tripStartAt).putString("tripTimerTripId",pendingTripId).commit();
      awaitingEventId=""; awaitingStage=""; awaitingTripId="";
      persistNativeWorkflow();  animateRetract(); overlay.invalidate();
      Log.i("KFE-SWIPE","durably queued START_RIDE; native stage advanced to END_RIDE event="+shortEventId(eventId));
      KfeNativeWorkActionsPlugin.emitAction("START_RIDE",pendingTripId,"",eventId); return;
    }
    if("END_RIDE".equals(actionStage)){
      if(pendingTripId.isEmpty()) return;
      String eventId;
      try { eventId=persistLifecycleAction("END_RIDE","COMPLETED",false); }
      catch(RuntimeException failure){Log.e("KFE-CANONICAL","END_RIDE lifecycle persistence interrupted; retry is safe",failure);Toast.makeText(this,"Trip action is queued for recovery. Keep this trip open and retry when storage is available.",Toast.LENGTH_LONG).show();return;}
      captureOneShotEventLocation(pendingTripId, "TRIP_END");
      actionStage="ENTER_FARE"; pendingFareTripId=pendingTripId; tripStartAt=0L; phaseStartAt=System.currentTimeMillis(); phaseLabel="FARE ENTRY TIME";
      getSharedPreferences("kfe_overlay",MODE_PRIVATE).edit().remove("tripStartAt").remove("tripTimerTripId").commit();
      awaitingEventId=""; awaitingStage=""; awaitingTripId="";
      persistNativeWorkflow(); 
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
    JSONObject savedState;
    try{
      savedState=new JSONObject(getSharedPreferences("kfe_overlay",MODE_PRIVATE).getString(LAST_STATE_KEY,"{}"));
      JSONObject savedShift=savedState.optJSONObject("shift");
      if(savedShift==null||!isCanonicalShiftActive(KfeCanonicalWorkStore.get(this),savedShift.optString("id","")))
        throw new IllegalStateException("The canonical shift is no longer active.");
    }catch(RuntimeException error){throw error;}
    catch(Exception error){throw new IllegalStateException("Could not verify canonical shift ownership.",error);}
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
    if("GO_TO_PICKUP".equals(stage)){ actionStage="START_RIDE"; pendingFareTripId=""; Log.i("KFE-SWIPE","stage transition GO_TO_PICKUP -> START_RIDE"); persistNativeWorkflow();  animateRetract(); if(overlay!=null)overlay.invalidate(); return; }
    if("START_RIDE".equals(stage)){ actionStage="END_RIDE"; Log.i("KFE-SWIPE","stage transition START_RIDE -> END_RIDE"); persistNativeWorkflow();  animateRetract(); if(overlay!=null)overlay.invalidate(); return; }
    if("END_RIDE".equals(stage)){ pendingFareTripId=tripId; pendingTripId=tripId; actionStage="ENTER_FARE"; Log.i("KFE-SWIPE","stage transition END_RIDE -> ENTER_FARE"); persistNativeWorkflow();  if(!minimized&&!"FARE".equals(formMode)){if("FARE".equals(getSharedPreferences("kfe_overlay",MODE_PRIVATE).getString("formMode","")))restorePersistedFormIfNeeded();else openFareForm();} if(overlay!=null)overlay.invalidate(); return; }
    if("OPEN_CANCEL_FORM".equals(stage)){ persistNativeWorkflow(); if(overlay!=null)overlay.invalidate(); return; }
    if("ENTER_FARE".equals(stage) || "CANCEL_RIDE".equals(stage)){ Log.i("KFE-SWIPE","stage transition "+stage+" -> GO_TO_PICKUP"); closeForm(); if("CANCEL_RIDE".equals(stage)){cancelFormPwaSynchronized=false;} actionStage="GO_TO_PICKUP"; pendingTripId=""; pendingFareTripId=""; tripStartAt=0L; phaseStartAt=System.currentTimeMillis(); phaseLabel="READY TIME"; persistNativeWorkflow(); animateRetract(); if(overlay!=null)overlay.invalidate(); }
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

  public static void onPwaActivityResumed(){
    KfeOverlayService service=instance;
    if(service!=null&&service.foregroundHandler!=null){
      service.foregroundHandler.post(service::hideIfKfeActivityForeground);
    }
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
    formMode=mode;formValue="";tollValue="";parkingValue="";activeAmountField="fare";formSubmitting=false;tollExpanded=false;parkingExpanded=false;tollToggle=null;parkingToggle=null;persistNativeForm();
    params.flags=WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL|WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;
    params.softInputMode=WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE|WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE;
    params.height="FARE".equals(mode)?dp(420):dp(310);
    if(windowManager!=null)windowManager.updateViewLayout(overlayRoot,params);

    cancelReasonPanel=null;
    formPanel=new LinearLayout(this);formPanel.setOrientation(LinearLayout.VERTICAL);formPanel.setPadding(dp(14),dp(8),dp(14),dp(8));
    formPanel.setBackground(new ColorDrawable(dark()?Color.rgb(22,29,37):Color.WHITE));
    formPanel.setElevation(dp(8));
    TextView titleView=new TextView(this);titleView.setText(title);titleView.setTextSize(15);titleView.setTextColor(textColor());titleView.setGravity(Gravity.CENTER);
    formPanel.addView(titleView,new LinearLayout.LayoutParams(-1,dp(30)));
    TextView hintView=new TextView(this);hintView.setText(hint);hintView.setTextSize(10);hintView.setTextColor(mutedColor());hintView.setGravity(Gravity.CENTER);
    formPanel.addView(hintView,new LinearLayout.LayoutParams(-1,dp(18)));

    if("CANCEL".equals(mode)){
      final LinearLayout reasons=new LinearLayout(this); reasons.setOrientation(LinearLayout.HORIZONTAL); reasons.setGravity(Gravity.CENTER);
      cancelReasonPanel=reasons;
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
      tollToggle.setOnClickListener(v->{tollExpanded=!tollExpanded;tollInput.setVisibility(tollExpanded?View.VISIBLE:View.GONE);tollToggle.setText(tollExpanded?"− Toll":"+ Toll");persistNativeForm();resizeForm();});
      parkingToggle.setOnClickListener(v->{parkingExpanded=!parkingExpanded;parkingInput.setVisibility(parkingExpanded?View.VISIBLE:View.GONE);parkingToggle.setText(parkingExpanded?"− Parking":"+ Parking");persistNativeForm();resizeForm();});
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
    // Validation is a domain rule, not part of the overlay presentation.
    if(!KfeNativeTripFormRules.isValidOptionalAmount(formValue)
        ||!KfeNativeTripFormRules.isValidOptionalAmount(tollValue)
        ||!KfeNativeTripFormRules.isValidOptionalAmount(parkingValue))return;
    if("CANCEL".equals(formMode)&&!KfeNativeTripFormRules.isValidCancellationReason(cancelReason))return;
    try{
      JSONObject canonicalTripResult=KfeCanonicalWorkStore.get(this).getRecord("TRIP",actionTripId);
      JSONObject canonicalTrip=canonicalTripResult.optJSONObject("record");
      if(!canonicalTripResult.optBoolean("found",false)||canonicalTrip==null
          ||!isCanonicalShiftActive(KfeCanonicalWorkStore.get(this),canonicalTrip.optString("shiftId",""))){
        Toast.makeText(this,"This shift has ended. Reopen Work to refresh the overlay.",Toast.LENGTH_LONG).show();
        return;
      }
    }catch(Exception error){
      Log.e("KFE-CANONICAL","Could not verify active shift before native form submission.",error);
      Toast.makeText(this,"Could not verify the active shift. Nothing was saved; retry after Work refreshes.",Toast.LENGTH_LONG).show();
      return;
    }
    formSubmitting=true;
    if("FARE".equals(formMode)){
      try {
        JSONObject payload=KfeNativeTripFormRules.buildFarePayload(formValue,tollValue,parkingValue);
        // Commit the business record before reporting success to the overlay.
        // The deterministic operation ID makes process-death/retry safe; the
        // separate native event remains queued so the PWA's IndexedDB read model
        // catches up when its WebView next runs.
        String eventId=KfeNativeWorkActionsPlugin.recordPendingAction(this,"ENTER_FARE",actionTripId,payload.toString());
        LifecycleFaultInjector formInjector=lifecycleFaultInjectorForTests;
        if(formInjector!=null)formInjector.afterBoundary("AFTER_FARE_OUTBOX");
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
        JSONObject input=KfeNativeTripFormRules.buildCancellationPayload(formValue,cancelReason);
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

  
  // Shift start/end are PWA-owned. A stale overlay snapshot must never authorize
  // a new native trip transition after the canonical shift has ended.
  private boolean isCanonicalShiftActive(KfeCanonicalWorkStore store,String shiftId) throws Exception {
    if(shiftId==null||shiftId.trim().isEmpty())return false;
    JSONObject found=store.getRecord("SHIFT",shiftId);
    JSONObject canonicalShift=found.optJSONObject("record");
    return found.optBoolean("found",false)&&canonicalShift!=null
      &&"ACTIVE".equals(canonicalShift.optString("status",""));
  }

  private void startOverlayForeground(boolean locationActive){
    if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.UPSIDE_DOWN_CAKE){
      int types=ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE;
      if(locationActive)types|=ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION;
      startForeground(NOTIFICATION_ID,buildNotification(),types);
    }else if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.Q){
      startForeground(NOTIFICATION_ID,buildNotification(),locationActive?ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION:0);
    }else{
      startForeground(NOTIFICATION_ID,buildNotification());
    }
  }

  private boolean activateOneShotLocationForeground(){
    try{startOverlayForeground(true);return true;}
    catch(Exception error){Log.w("KFE-GPS","Could not activate the location foreground type for a one-shot trip fix.",error);return false;}
  }

  private void restoreOverlayForegroundType(){
    try{startOverlayForeground(false);}
    catch(Exception error){Log.w("KFE-GPS","Could not restore the normal overlay foreground type after a one-shot fix.",error);}
  }

  // Each event is journaled in app-private storage before a location request.
  // The original event identity survives timeout, process death, and retry.
  
  private KfeGpsEventJournal gpsJournal(){return new KfeGpsEventJournal(this);}
  private boolean enqueuePendingEventLocation(String entityId,String eventType){return enqueuePendingEventLocation("TRIP",entityId,eventType,"");}
  private boolean enqueuePendingEventLocation(String entityType,String entityId,String eventType,String eventAt){
    boolean saved=gpsJournal().enqueue(entityType,entityId,eventType,eventAt);
    if(saved)Log.i("KFE-GPS","Durably queued event location "+KfeGpsEventPolicy.key(entityType,entityId,eventType));
    else Log.e("KFE-GPS","Could not durably queue event GPS capture.");
    return saved;
  }
  private void removePendingEventLocation(String entityId,String eventType){removePendingEventLocation("TRIP",entityId,eventType);}
  private void removePendingEventLocation(String entityType,String entityId,String eventType){
    if(!gpsJournal().remove(entityType,entityId,eventType))Log.e("KFE-GPS","Could not update pending GPS event journal.");
  }
  private boolean hasPendingEventLocations(){return gpsJournal().hasPending();}
  private boolean hasBackgroundLocationPermission(){
    if(ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED)return false;
    return Build.VERSION.SDK_INT<Build.VERSION_CODES.Q || ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_BACKGROUND_LOCATION)==PackageManager.PERMISSION_GRANTED;
  }
  private void scheduleNextPendingGpsSoon(){
    if(!hasPendingEventLocations()||!hasBackgroundLocationPermission())return;
    Handler handler=foregroundHandler!=null?foregroundHandler:new Handler(Looper.getMainLooper());
    handler.removeCallbacks(pendingGpsRetry);
    handler.postDelayed(pendingGpsRetry,1000L);
  }
  private void schedulePendingGpsRetry(){
    if(!hasPendingEventLocations()||!hasBackgroundLocationPermission())return;
    long now=System.currentTimeMillis();
    JSONObject earliest=gpsJournal().earliestPending(gpsCaptureInFlight,now);
    if(earliest==null)return;
    long next=earliest.optLong("nextAttemptAt",0L);
    if(next<=0L)next=now;
    Handler handler=foregroundHandler!=null?foregroundHandler:new Handler(Looper.getMainLooper());
    handler.removeCallbacks(pendingGpsRetry);
    handler.postDelayed(pendingGpsRetry,Math.max(1000L,next-now));
  }
  private void recordPendingGpsFailure(String tripId,String eventType){recordPendingGpsFailure("TRIP",tripId,eventType);}
  private void recordPendingGpsFailure(String entityType,String entityId,String eventType){
    if(!gpsJournal().recordFailure(entityType,entityId,eventType,System.currentTimeMillis()))
      Log.e("KFE-GPS","Could not persist GPS retry backoff; event remains queued.");
  }
  private void retryPendingEventLocations(){
    if(!hasPendingEventLocations())return;
    // Permission is a hard gate: never start a background location request until
    // both precise and background location permissions are granted.
    if(!hasBackgroundLocationPermission())return;
    try{
      long now=System.currentTimeMillis();
      JSONObject earliest=gpsJournal().earliestPending(gpsCaptureInFlight,now);
      JSONObject selected=earliest!=null&&earliest.optLong("nextAttemptAt",0L)<=now?earliest:null;
      if(selected!=null){
        String entityType=selected.optString("entityType","TRIP");
        String entityId=selected.optString("entityId",selected.optString("tripId",""));
        String eventType=selected.optString("eventType",""),eventAt=selected.optString("eventAt","");
        if(!entityId.isEmpty()&&!eventType.isEmpty()){captureOneShotEventLocation(entityType,entityId,eventType,eventAt);return;}
      }
      if(earliest!=null)schedulePendingGpsRetry();
    }catch(Exception error){Log.e("KFE-GPS","Pending event location retry failed.",error);}
  }
  private void finishPendingGpsAttempt(String tripId,String eventType,boolean saved){finishPendingGpsAttempt("TRIP",tripId,eventType,saved);}
  private void finishPendingGpsAttempt(String entityType,String entityId,String eventType,boolean saved){
    gpsCaptureInFlight.remove(KfeGpsEventPolicy.key(entityType,entityId,eventType));
    if(saved){
      removePendingEventLocation(entityType,entityId,eventType);
      if(hasPendingEventLocations())scheduleNextPendingGpsSoon();
      else if(overlay==null&&!hasPersistedOverlayState(this)){
        stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();
      }
    }else{
      recordPendingGpsFailure(entityType,entityId,eventType);
      schedulePendingGpsRetry();
    }
  }

  // A high-accuracy one-shot request is retried until the first valid fix is
  // durably written. It is not a movement trace and does not use the network.
  private void captureOneShotEventLocation(String tripId,String eventType){captureOneShotEventLocation("TRIP",tripId,eventType,"");}
  private void captureOneShotEventLocation(String entityType,String entityId,String eventType,String eventAt){
    if(entityId==null||entityId.trim().isEmpty()||!KfeGpsEventPolicy.supports(entityType,eventType))return;
    if(!enqueuePendingEventLocation(entityType,entityId,eventType,eventAt))return;
    String snapshotId=KfeGpsEventPolicy.snapshotId(entityType,entityId,eventType);
    try{
      JSONObject existing=KfeCanonicalWorkStore.get(this).getRecord("GPS_SNAPSHOT",snapshotId);
      JSONObject snapshot=existing.optJSONObject("record");
      if(existing.optBoolean("found",false)&&isValidPersistedEventGpsSnapshot(snapshot)){finishPendingGpsAttempt(entityType,entityId,eventType,true);return;}
    }catch(Exception error){Log.w("KFE-GPS","Unable to check prior event-location snapshot",error);}
    try{
      JSONObject canonicalRecord=KfeCanonicalWorkStore.get(this).getRecord(entityType,entityId);
      if(!canonicalRecord.optBoolean("found",false)||canonicalRecord.optJSONObject("record")==null){
        removePendingEventLocation(entityType,entityId,eventType);scheduleNextPendingGpsSoon();
        if("TRIP".equals(entityType))Log.w("KFE-GPS","Discarded pending GPS request for missing trip "+entityId+"; no orphan snapshot will be written.");
        else Log.w("KFE-GPS","Discarded pending GPS request for missing "+entityType+" record "+entityId+"; no orphan snapshot will be written.");
        return;
      }
    }catch(Exception error){
      Log.w("KFE-GPS","Canonical "+entityType+" record could not be verified; pending GPS request remains queued.",error);
      recordPendingGpsFailure(entityType,entityId,eventType);schedulePendingGpsRetry();return;
    }
    if(!hasBackgroundLocationPermission()){
      Log.w("KFE-GPS","Background "+eventType+" GPS capture is pending; required precise/background permissions are not granted. No location request was started.");return;
    }
    String key=KfeGpsEventPolicy.key(entityType,entityId,eventType);
    if(!gpsCaptureInFlight.add(key))return;
    LocationManager manager=(LocationManager)getSystemService(Context.LOCATION_SERVICE);
    if(manager==null){finishPendingGpsAttempt(entityType,entityId,eventType,false);return;}
    boolean providerAvailable=false;
    try{
      providerAvailable=manager.isProviderEnabled(LocationManager.GPS_PROVIDER)
        || manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
    }catch(Exception error){Log.w("KFE-GPS","Unable to inspect location providers.",error);}
    if(!providerAvailable){Log.w("KFE-GPS","No location provider is enabled; event remains durably pending.");finishPendingGpsAttempt(entityType,entityId,eventType,false);return;}
    if(!activateOneShotLocationForeground()){finishPendingGpsAttempt(entityType,entityId,eventType,false);return;}
    Handler handler=new Handler(Looper.getMainLooper());
    AtomicBoolean finished=new AtomicBoolean(false);
    final LocationListener[] listener=new LocationListener[1];
    Runnable stop=()->{
      if(!finished.compareAndSet(false,true))return;
      try{manager.removeUpdates(listener[0]);}catch(Exception ignored){}
      restoreOverlayForegroundType();
      Log.w("KFE-GPS","No acceptable event GPS fix within 30 seconds; durable request remains pending.");
      finishPendingGpsAttempt(entityType,entityId,eventType,false);
    };
    listener[0]=new LocationListener(){
      @Override public void onLocationChanged(Location location){
        if(finished.get()||location==null)return;
        long fixTime=location.getTime();
        float accuracy=location.hasAccuracy()?location.getAccuracy():Float.NaN;
        boolean timestampValid=isEventGpsFixAtOrAfter(eventAt,fixTime);
        boolean coordinatesValid=Double.isFinite(location.getLatitude())&&Math.abs(location.getLatitude())<=90d
          &&Double.isFinite(location.getLongitude())&&Math.abs(location.getLongitude())<=180d;
        boolean accuracyValid=!Float.isNaN(accuracy)&&!Float.isInfinite(accuracy)&&accuracy>=0f;
        if(!timestampValid||!coordinatesValid||!accuracyValid)return;
        // A fix at 75m or better is accepted immediately. Less accurate fixes
        // remain candidates while the provider continues its 3-second updates.
        if(accuracy>75f)return;
        if(!finished.compareAndSet(false,true))return;
        handler.removeCallbacks(stop);
        try{manager.removeUpdates(this);}catch(Exception ignored){}
        boolean saved=persistOneShotEventLocation(entityType,entityId,eventType,eventAt,location);
        restoreOverlayForegroundType();
        finishPendingGpsAttempt(entityType,entityId,eventType,saved);
      }
      @Override public void onProviderEnabled(String provider){}
      @Override public void onProviderDisabled(String provider){}
      @SuppressWarnings("deprecation") @Override public void onStatusChanged(String provider,int status,android.os.Bundle extras){}
    };
    handler.postDelayed(stop,30000L);
    boolean requested=false;
    for(String provider:new String[]{LocationManager.GPS_PROVIDER,LocationManager.NETWORK_PROVIDER}){
      try{
        if(manager.isProviderEnabled(provider)){
          manager.requestLocationUpdates(provider,3000L,0f,listener[0],Looper.getMainLooper());
          requested=true;
        }
      }catch(Exception error){Log.w("KFE-GPS","Could not request "+provider+" event location updates.",error);}
    }
    if(!requested&&finished.compareAndSet(false,true)){
      handler.removeCallbacks(stop);restoreOverlayForegroundType();finishPendingGpsAttempt(entityType,entityId,eventType,false);
    }
  }

  static boolean isValidPersistedEventGpsSnapshot(JSONObject snapshot){
    if(snapshot==null)return false;
    double latitude=snapshot.optDouble("latitude",Double.NaN);
    double longitude=snapshot.optDouble("longitude",Double.NaN);
    String capturedAt=snapshot.optString("capturedAt","");
    Object rawEventAt=snapshot.opt("eventAt");
    String eventAt=rawEventAt==null||rawEventAt==JSONObject.NULL?"":String.valueOf(rawEventAt);
    if(!Double.isFinite(latitude)||Math.abs(latitude)>90d
      ||!Double.isFinite(longitude)||Math.abs(longitude)>180d
      ||capturedAt.trim().isEmpty()||"null".equalsIgnoreCase(capturedAt.trim()))return false;
    try{return isEventGpsFixAtOrAfter(eventAt,java.time.Instant.parse(capturedAt).toEpochMilli());}
    catch(Exception error){return false;}
  }

  static boolean isEventGpsFixAtOrAfter(String eventAt,long fixTime){
    if(fixTime<=0L)return false;
    if(eventAt==null||eventAt.trim().isEmpty())return false;
    try{return fixTime>=java.time.Instant.parse(eventAt.trim()).toEpochMilli();}
    catch(Exception error){return false;}
  }

  private boolean persistOneShotEventLocation(String tripId,String eventType,Location location){return persistOneShotEventLocation("TRIP",tripId,eventType,"",location);}
  private boolean persistOneShotEventLocation(String entityType,String entityId,String eventType,String suppliedEventAt,Location location){
    try{
      if(location==null)return false;
      long fixTime=location.getTime();
      if(fixTime<=0L){Log.w("KFE-GPS","Event GPS snapshot skipped: GPS fix has no valid provider timestamp.");return false;}
      if(!location.hasAccuracy()||Float.isNaN(location.getAccuracy())||Float.isInfinite(location.getAccuracy())||location.getAccuracy()<0f||location.getAccuracy()>75f){Log.w("KFE-GPS","Event GPS snapshot skipped: provider accuracy is missing or worse than 75 metres.");return false;}
      String snapshotId=KfeGpsEventPolicy.snapshotId(entityType,entityId,eventType),now=java.time.Instant.now().toString();
      JSONObject parentResult=KfeCanonicalWorkStore.get(this).getRecord(entityType,entityId),parent=parentResult.optJSONObject("record");
      String eventAt=suppliedEventAt==null?"":suppliedEventAt;
      if(eventAt.isEmpty()&&parent!=null){
        if("TRIP".equals(entityType)){if("TRIP_START".equals(eventType))eventAt=parent.optString("tripStartAt","");else if("PICKUP_START".equals(eventType))eventAt=parent.optString("createdAt",parent.optString("tripStartAt",""));else eventAt=parent.optString("tripEndAt","");}
        else if("SHIFT".equals(entityType))eventAt="SHIFT_START".equals(eventType)?parent.optString("shiftStartAt",""):parent.optString("shiftEndAt","");
      }
      // Android may return a cached GPS fix. Never attach a pre-event fix to
      // this ride boundary; leave the durable request pending for a later fix.
      if(!isEventGpsFixAtOrAfter(eventAt,fixTime)){
        Log.w("KFE-GPS","Event GPS snapshot skipped: provider fix predates or cannot be compared with the ride event.");
        return false;
      }
      JSONObject snapshot=new JSONObject();snapshot.put("id",snapshotId);snapshot.put("entityType",entityType);snapshot.put("entityId",entityId);
      snapshot.put("eventType",eventType);snapshot.put("eventAt",eventAt.isEmpty()?JSONObject.NULL:eventAt);
      snapshot.put("latitude",location.getLatitude());snapshot.put("longitude",location.getLongitude());
      snapshot.put("accuracy",location.hasAccuracy()?location.getAccuracy():JSONObject.NULL);snapshot.put("capturedAt",java.time.Instant.ofEpochMilli(fixTime).toString());
      snapshot.put("placeName",JSONObject.NULL);snapshot.put("createdAt",now);snapshot.put("updatedAt",now);
      String operationId="native-gps-snapshot-"+entityType+"-"+entityId+"-"+eventType+"-"+fixTime;
      KfeCanonicalWorkStore.Outcome outcome=KfeCanonicalWorkStore.get(this).putRecord(operationId,"GPS_SNAPSHOT",snapshot);
      if(!outcome.accepted)throw new IllegalStateException("Native event GPS snapshot was not accepted.");
      JSONObject saved=outcome.result.optJSONObject("record");String savedAt=saved==null?"":saved.optString("capturedAt","");
      Log.i("KFE-GPS","Durably saved event GPS snapshot "+entityType+"/"+entityId+"/"+eventType+" at "+savedAt);return true;
    }catch(Exception error){Log.w("KFE-GPS","Unable to persist event GPS snapshot for "+entityType+"/"+entityId,error);return false;}
  }

  private void refreshRideCountForShift(KfeCanonicalWorkStore store,String shiftId){
    if(store==null||shiftId==null||shiftId.trim().isEmpty())return;
    try{
      int count=0,offset=0;
      long totalCount=0L;
      do{
        JSONObject page=store.listRecords("TRIP",500,offset);
        org.json.JSONArray records=page.optJSONArray("records");
        if(records==null)break;
        totalCount=page.optLong("totalCount",records.length());
        for(int index=0;index<records.length();index++){
          JSONObject trip=records.optJSONObject(index);
          if(trip==null||!shiftId.equals(trip.optString("shiftId","")))continue;
          if(!trip.optString("deletedAt","").trim().isEmpty()||trip.optBoolean("deleted",false))continue;
          count++;
        }
        if(records.length()==0)break;
        offset+=records.length();
      }while(offset<totalCount);
      rides=String.valueOf(count);
    }catch(Exception error){Log.w("KFE-OVERLAY","Unable to refresh native ride count from canonical SQLite.",error);}
  }

  private boolean persistCanonicalTripStage(String stage, boolean rideStarted, String eventId){
    try{
      JSONObject root=new JSONObject(getSharedPreferences("kfe_overlay",MODE_PRIVATE).getString(LAST_STATE_KEY,"{}"));
      JSONObject shift=root.optJSONObject("shift");
      if(shift==null||shift.optString("id","").isEmpty()||pendingTripId.isEmpty())return false;
      KfeCanonicalWorkStore store=KfeCanonicalWorkStore.get(this);
      if(!isCanonicalShiftActive(store,shift.optString("id",""))){
        Log.w("KFE-CANONICAL","Refusing native trip transition because canonical shift is not active.");
        return false;
      }
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
      }
      if("COMPLETED".equals(stage)){
        if(!trip.has("tripEndAt")||trip.isNull("tripEndAt")||trip.optString("tripEndAt","").isEmpty())trip.put("tripEndAt",eventTimestamp);
      }
      trip.put("updatedAt",eventTimestamp);
      // If the canonical write committed but its acknowledgement was lost, a retry
      // may reconstruct the same lifecycle transition from the already-updated row.
      // Recognize only the exact event timestamp + target stage/status as committed.
      JSONObject latest=store.getRecord("TRIP",pendingTripId);
      JSONObject latestTrip=latest.optJSONObject("record");
      if(latest.optBoolean("found",false)&&latestTrip!=null
          &&stage.equals(latestTrip.optString("tripStage",""))
          &&("COMPLETED".equals(stage)?"COMPLETED":"ACTIVE").equals(latestTrip.optString("status",""))
          &&eventTimestamp.equals(latestTrip.optString("updatedAt",""))){
        refreshRideCountForShift(store,shift.optString("id",""));
        return true;
      }
      KfeCanonicalWorkStore.Outcome outcome=store.putRecord("native-trip-stage-"+eventId,"TRIP",trip);
      if(!outcome.accepted)throw new IllegalStateException("Canonical trip lifecycle stage was not acknowledged.");
      refreshRideCountForShift(store,shift.optString("id",""));
      return true;
    }catch(Exception error){Log.e("KFE-CANONICAL","Could not persist native trip stage",error);return false;}
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
    // The overlay can remain visible after a stale PWA snapshot. Re-check the
    // canonical shift before committing fare/cancellation so shift end wins.
    if(!isCanonicalShiftActive(canonical,trip.optString("shiftId","")))
      throw new IllegalStateException("The canonical shift is no longer active; trip form was not committed.");
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
      trip.remove("revenueAuthority");
      trip.put("toll",input.optString("toll","").trim().isEmpty()?0d:Double.parseDouble(input.optString("toll")));
      trip.put("parking",input.optString("parking","").trim().isEmpty()?0d:Double.parseDouble(input.optString("parking")));
    }else if("CANCEL".equals(mode)){
      trip.put("status","CANCELLED");
      trip.put("cancelReason",input.optString("reason",""));
      String revenueValue=input.optString("revenue","");
      trip.put("cancelledRevenue",revenueValue.trim().isEmpty()?0d:Double.parseDouble(revenueValue));
    }else throw new IllegalArgumentException("Unsupported native form mode.");
    if(trip.isNull("tripEndAt")||trip.optString("tripEndAt","").isEmpty())trip.put("tripEndAt",now);
    trip.put("updatedAt",now);
    KfeCanonicalWorkStore.Outcome outcome=canonical.commitTripForm(operationId,mode,trip);
    if(!outcome.accepted)throw new IllegalStateException("Canonical trip form was not accepted.");
    // The trip and derived Shift.revenue are committed in the same SQLite transaction.
    revenue="₹"+String.format(java.util.Locale.US,"%.0f",outcome.result.optDouble("revenue",0d));
    refreshRideCountForShift(canonical,trip.optString("shiftId",""));
    if(overlay!=null)overlay.postInvalidate();
  }

  private void finishNativeFormCommit(){
    formSubmitting=false;
    // Close both form types after the canonical SQLite transaction succeeds.
    // Leaving FARE attached swallows the next trip's cancellation tap.
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
    formPanel=null;cancelReasonPanel=null;formMode=null;formValue="";tollValue="";parkingValue="";formSubmitting=false;formInput=null;tollInput=null;parkingInput=null;tollToggle=null;parkingToggle=null;if(clearDraft)KfeNativeTripFormDraftStore.clear(getSharedPreferences("kfe_overlay",MODE_PRIVATE));
    if(params!=null){params.height=dp(COLLAPSED_TOTAL_DP);params.flags=WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;params.softInputMode=WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING;if(windowManager!=null&&overlayRoot!=null)windowManager.updateViewLayout(overlayRoot,params);}
    if(overlay!=null)overlay.invalidate();
  }

  private int textColor(){return dark()?Color.rgb(232,237,242):Color.rgb(23,32,42);}
  private int mutedColor(){return dark()?Color.rgb(184,194,205):Color.rgb(91,102,115);}
  private int actionColor(){if("END_RIDE".equals(actionStage))return swipeEndColor;if("START_RIDE".equals(actionStage))return swipeStartColor;
    if("CANCELLED".equals(actionStage)||"CANCEL_RIDE".equals(actionStage))return dark()?Color.rgb(255,190,80):Color.rgb(190,120,0);
    return swipePickupColor;}
  private String formatPhaseTime(){long start=phaseStartAt;if("END_RIDE".equals(actionStage)&&tripStartAt>0L)start=tripStartAt;if(start<=0L)return "00:00:00";long elapsed=Math.max(0L,System.currentTimeMillis()-start)/1000L;long h=elapsed/3600L,m=(elapsed%3600L)/60L,s=elapsed%60L;return String.format(java.util.Locale.US,"%02d:%02d:%02d",h,m,s);}
  // KFE is dark-only: ignore stale persisted theme values so white action text can never land on a white overlay surface.
  private boolean dark(){return true;}
  private void removeOverlay(){removeOverlay(false);}
  private void removeOverlay(boolean preserveFormDraft){closeForm(!preserveFormDraft);if(windowManager!=null&&overlayRoot!=null){try{windowManager.removeView(overlayRoot);}catch(Exception ignored){}}overlayRoot=null;overlay=null;}
  @Override public void onDestroy(){if(foregroundHandler!=null)foregroundHandler.removeCallbacks(pendingGpsRetry);removeOverlay(true);if(instance==this)instance=null;super.onDestroy();}
  @Override public IBinder onBind(Intent intent){return null;}
  private Notification buildNotification(){
    // This notice exists for the Android foreground-service lifecycle only.
    // Keep it quiet and independent of Work stage and kilometre accounting.
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
      // Trip lifecycle transitions do not require location access.
      float[] cols={.18f,.50f,.82f};
      String[] labels={"RIDES",phaseLabel,"REVENUE"};
      String[] values={rides,formatPhaseTime(),revenue};
      for(int i=0;i<3;i++){text(9,mutedColor(),true);center(c,labels[i],w*cols[i],barTop+dp(23));text(15,textColor(),true);center(c,values[i],w*cols[i],barTop+dp(44));}
      if("END_RIDE".equals(actionStage)||"START_RIDE".equals(actionStage)||phaseStartAt>0L) postInvalidateDelayed(1000);
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