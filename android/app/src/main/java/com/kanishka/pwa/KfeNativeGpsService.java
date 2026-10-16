package com.kanishka.pwa;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.Build;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class KfeNativeGpsService extends Service {
  public static final String ACTION_START = "com.kanishka.pwa.NATIVE_GPS_START";
  public static final String ACTION_STOP = "com.kanishka.pwa.NATIVE_GPS_STOP";
  public static final String EXTRA_TRIP_ID = "tripId";
  private static final String PREFS = "kfe_native_gps";
  private static final String ACTIVE_TRIP = "activeTripId";
  private static final String ACTIVE_EVENT = "activeEventType";
  private static final String ACTIVE_ENTITY = "activeEntityType";
  private static final String ACTIVE_READY = "activeCollectorReady";
  private static final String CHANNEL_ID = "kfe_native_gps";
  private static final int NOTIFICATION_ID = 7110;
  // Process-local truth prevents stale SharedPreferences from claiming GPS is live after process death.
  private static volatile KfeNativeGpsService liveInstance;

  private FusedLocationProviderClient fused;
  private LocationCallback callback;
  private String tripId;
  private String eventType = "PASSENGER_RIDE_TRACE";
  private String entityType = "TRIP";
  private File traceFile;
  private Location lastPassengerLocation;
  private double passengerDistanceMeters = 0d;
  private PowerManager.WakeLock locationWakeLock;
  private final Set<String> seenKeys = new HashSet<>();
  private final List<Location> filteredDistanceLocations = new ArrayList<>();
  private static final long MAX_CONTIGUOUS_GAP_MS = 120000L;
  private static final float MAX_ACCURACY_FOR_DISTANCE_METERS = 80f;
  private static final float MAX_REASONABLE_SPEED_KMH = 180f;

  public static void start(Context context, String tripId, String eventType, String entityType) {
    // Never call startForegroundService unless the runtime location grant is
    // present; Android requires a started service to promote immediately.
    if (tripId == null || tripId.trim().isEmpty() || !hasLocationPermission(context)) return;
    Intent intent = new Intent(context, KfeNativeGpsService.class);
    intent.setAction(ACTION_START);
    intent.putExtra(EXTRA_TRIP_ID, tripId);
    intent.putExtra("eventType", eventType == null ? "PASSENGER_RIDE_TRACE" : eventType);
    intent.putExtra("entityType", "SHIFT".equals(entityType) ? "SHIFT" : "TRIP");
    androidx.core.content.ContextCompat.startForegroundService(context, intent);
  }

  public static void resumePersisted(Context context) {
    // Keep the decision durable so a failed boot recovery can be distinguished
    // from a receiver-delivery problem in instrumentation and field diagnostics.
    android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String persisted = prefs.getString(ACTIVE_TRIP, "");
    if (persisted == null || persisted.trim().isEmpty()) {
      recordResumeDecision(prefs, "SKIPPED_NO_ACTIVE_TRIP", null);
      return;
    }
    if (!hasLocationPermission(context)) {
      recordResumeDecision(prefs, "SKIPPED_NO_LOCATION_PERMISSION", null);
      return;
    }
    if (!hasBackgroundLocationPermission(context)) {
      recordResumeDecision(prefs, "SKIPPED_NO_BACKGROUND_LOCATION_PERMISSION", null);
      return;
    }
    recordResumeDecision(prefs, "START_REQUESTED", null);
    Intent intent = new Intent(context, KfeNativeGpsService.class);
    intent.setAction("com.kanishka.pwa.NATIVE_GPS_RESUME");
    try {
      androidx.core.content.ContextCompat.startForegroundService(context, intent);
    } catch (RuntimeException error) {
      recordResumeDecision(prefs, "START_REQUEST_FAILED", error.getClass().getSimpleName() + ": " + error.getMessage());
      throw error;
    }
  }

  private static void recordResumeDecision(android.content.SharedPreferences prefs, String decision, String error) {
    android.content.SharedPreferences.Editor edit = prefs.edit()
        .putString("lastResumeDecision", decision)
        .putLong("lastResumeAt", System.currentTimeMillis());
    if (error == null) edit.remove("lastResumeError");
    else edit.putString("lastResumeError", error);
    edit.commit();
    Log.i("KfeNativeGpsService", "Persisted GPS resume decision=" + decision + (error == null ? "" : " error=" + error));
  }

  public static void stop(Context context, String tripId) {
    Intent intent = new Intent(context, KfeNativeGpsService.class);
    intent.setAction(ACTION_STOP);
    intent.putExtra(EXTRA_TRIP_ID, tripId == null ? "" : tripId);
    context.startService(intent);
  }

  @Override public void onCreate() {
    super.onCreate();
    liveInstance = this;
    createChannel();
    // startForegroundService() has a strict promotion deadline. Promote the
    // service immediately on creation so lifecycle recovery cannot time out
    // before onStartCommand() processes persisted state.
    if (!ensureForegroundLocationService()) {
      stopSelf();
      return;
    }
    fused = LocationServices.getFusedLocationProviderClient(this);
  }

  @Override public int onStartCommand(Intent intent, int flags, int startId) {
    String action = intent == null ? null : intent.getAction();
    if ("com.kanishka.pwa.NATIVE_GPS_RESUME".equals(action)) {
      String persisted = getSharedPreferences(PREFS, MODE_PRIVATE).getString(ACTIVE_TRIP, "");
      String persistedEvent = getSharedPreferences(PREFS, MODE_PRIVATE).getString(ACTIVE_EVENT, "PASSENGER_RIDE_TRACE");
      String persistedEntity = getSharedPreferences(PREFS, MODE_PRIVATE).getString(ACTIVE_ENTITY, "TRIP");
      if (persisted != null && !persisted.isEmpty()) {
        if (!ensureForegroundLocationService()) return START_NOT_STICKY;
        startTracking(persisted, persistedEvent, persistedEntity);
      } else {
        stopSelf();
      }
      return START_STICKY;
    }
    if (ACTION_STOP.equals(action)) {
      String requested = intent == null ? null : intent.getStringExtra(EXTRA_TRIP_ID);
      String active = tripId;
      if (active == null || active.isEmpty()) active = getSharedPreferences(PREFS, MODE_PRIVATE).getString(ACTIVE_TRIP, "");
      if (active == null || active.isEmpty()) {
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
        return START_NOT_STICKY;
      }
      if (!shouldStopForTrip(active, requested)) return START_STICKY;
      stopTracking();
      stopForeground(STOP_FOREGROUND_REMOVE);
      stopSelf();
      return START_NOT_STICKY;
    }
    if (ACTION_START.equals(action)) {
      String requested = intent.getStringExtra(EXTRA_TRIP_ID);
      String requestedEvent = intent.getStringExtra("eventType");
      String requestedEntity = intent.getStringExtra("entityType");
      if (requested != null && !requested.isEmpty()) {
        if (!ensureForegroundLocationService()) return START_NOT_STICKY;
        startTracking(requested, requestedEvent, requestedEntity);
      }
      return START_STICKY;
    }

    String persisted = getSharedPreferences(PREFS, MODE_PRIVATE).getString(ACTIVE_TRIP, "");
    String persistedEvent = getSharedPreferences(PREFS, MODE_PRIVATE).getString(ACTIVE_EVENT, "PASSENGER_RIDE_TRACE");
    String persistedEntity = getSharedPreferences(PREFS, MODE_PRIVATE).getString(ACTIVE_ENTITY, "TRIP");
    if (persisted != null && !persisted.isEmpty()) {
      if (!ensureForegroundLocationService()) return START_NOT_STICKY;
      startTracking(persisted, persistedEvent, persistedEntity);
    }
    return START_STICKY;
  }

  private void acquireLocationWakeLock() {
    if (locationWakeLock != null && locationWakeLock.isHeld()) return;
    PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
    if (powerManager == null) return;
    locationWakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, getPackageName() + ":KfeNativeGps");
    locationWakeLock.setReferenceCounted(false);
    locationWakeLock.acquire();
  }

  private void releaseLocationWakeLock() {
    if (locationWakeLock == null) return;
    try { if (locationWakeLock.isHeld()) locationWakeLock.release(); } catch (RuntimeException ignored) {}
    locationWakeLock = null;
  }

  private void startTracking(String id, String requestedEventType, String requestedEntityType) {
    if (id == null || id.isEmpty()) return;
    if (!hasLocationPermission()) return;
    String requestedType = "DEAD_MOVEMENT_TRACE".equals(requestedEventType) ? "DEAD_MOVEMENT_TRACE" : "PASSENGER_RIDE_TRACE";
    String requestedEntity = "SHIFT".equals(requestedEntityType) ? "SHIFT" : "TRIP";
    if (id.equals(tripId) && callback != null && requestedType.equals(eventType) && requestedEntity.equals(entityType)) return;
    // A trip starts with pickup/dead-movement telemetry and must switch to
    // passenger-ride telemetry when Start Trip is pressed. Restart the callback
    // for the same trip when its event type changes; otherwise all ride points
    // would remain mislabeled as dead movement and be excluded from trip distance.
    releaseLocationUpdates();
    tripId = id;
    eventType = requestedType;
    entityType = requestedEntity;
    traceFile = new File(getFilesDir(), "kfe_gps_trace_" + safeName(id) + ".jsonl");
    loadSeenKeys();
    getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(ACTIVE_TRIP, id).putString(ACTIVE_EVENT, eventType).putString(ACTIVE_ENTITY, entityType).putBoolean(ACTIVE_READY, false).apply();

    if (androidx.core.app.ActivityCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_FINE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED
        && androidx.core.app.ActivityCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_COARSE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
      return;
    }

    LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000L)
        .setMinUpdateIntervalMillis(3000L)
        .setMinUpdateDistanceMeters(8f)
        .setWaitForAccurateLocation(false)
        .build();

    callback = new LocationCallback() {
      @Override public void onLocationResult(LocationResult result) {
        for (Location location : result.getLocations()) persistLocation(location);
      }
    };

    acquireLocationWakeLock();
    LocationCallback requestedCallback = callback;
    fused.requestLocationUpdates(request, requestedCallback, getMainLooper())
        .addOnSuccessListener(unused -> {
          if (id.equals(tripId) && callback == requestedCallback) {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putBoolean(ACTIVE_READY, true)
                .remove("lastLocationRegistrationFailure")
                .commit();
            Log.i("KfeNativeGpsService", "Native GPS callback registered for trip=" + id + " phase=" + eventType);
          }
        })
        .addOnFailureListener(error -> {
          Log.e("KfeNativeGpsService", "Unable to register native GPS updates.", error);
          getSharedPreferences(PREFS, MODE_PRIVATE).edit()
              .putBoolean(ACTIVE_READY, false)
              .putString("lastLocationRegistrationFailure", error.getClass().getSimpleName() + ": " + error.getMessage())
              .commit();
          if (callback == requestedCallback) {
            releaseLocationUpdates();
            releaseLocationWakeLock();
          }
        });
  }

  private void persistLocation(Location location) {
    if (location == null || traceFile == null) return;
    if (!location.hasAccuracy() || location.getAccuracy() > 100f) return;

    long timestamp = location.getTime() > 0 ? location.getTime() : System.currentTimeMillis();
    String key = eventType + "|" + timestamp + "|" + location.getLatitude() + "|" + location.getLongitude();
    if (seenKeys.contains(key)) return;

    try {
      JSONObject point = new JSONObject();
      point.put("id", "native-" + Integer.toHexString(key.hashCode()));
      point.put("tripId", tripId);
      point.put("entityType", entityType);
      point.put("latitude", location.getLatitude());
      point.put("longitude", location.getLongitude());
      point.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : JSONObject.NULL);
      point.put("speed", location.hasSpeed() ? location.getSpeed() : JSONObject.NULL);
      point.put("bearing", location.hasBearing() ? location.getBearing() : JSONObject.NULL);
      point.put("capturedAt", new java.util.Date(timestamp).toInstant().toString());
      point.put("capturedAtEpoch", timestamp);
      point.put("source", "ANDROID_NATIVE_FGS");
      point.put("eventType", eventType);

      byte[] payload = (point.toString() + "\n").getBytes(java.nio.charset.StandardCharsets.UTF_8);
      try (FileOutputStream output = new FileOutputStream(traceFile, true)) {
        output.write(payload);
        output.flush();
        output.getFD().sync();
      }
      seenKeys.add(key);
      if ("PASSENGER_RIDE_TRACE".equals(eventType) || "DEAD_MOVEMENT_TRACE".equals(eventType)) {
        appendFilteredDistanceLocation(location);
        refreshLiveDistanceReadout();
      }
    } catch (Exception error) {
      // Do not mark the point as seen when persistence fails. The next location
      // callback can retry the same evidence instead of silently losing it.
      Log.e("KfeNativeGpsService", "GPS trace persistence failed; point will be retried.", error);
    }
  }

  private void loadSeenKeys() {
    seenKeys.clear();
    filteredDistanceLocations.clear();
    lastPassengerLocation = null;
    passengerDistanceMeters = 0d;
    if (traceFile == null || !traceFile.exists()) {
      refreshLiveDistanceReadout();
      return;
    }
    try (BufferedReader reader = new BufferedReader(new FileReader(traceFile))) {
      String line;
      while ((line = reader.readLine()) != null) {
        try {
          JSONObject point = new JSONObject(line);
          String storedEvent = point.optString("eventType", "PASSENGER_RIDE_TRACE");
          long timestamp = point.optLong("capturedAtEpoch", -1);
          double latitude = point.optDouble("latitude", Double.NaN);
          double longitude = point.optDouble("longitude", Double.NaN);
          seenKeys.add(storedEvent + "|" + timestamp + "|" + latitude + "|" + longitude);
          if (eventType.equals(storedEvent) && !Double.isNaN(latitude) && !Double.isInfinite(latitude) && !Double.isNaN(longitude) && !Double.isInfinite(longitude)) {
            Location distancePoint = new Location("KFE");
            distancePoint.setLatitude(latitude);
            distancePoint.setLongitude(longitude);
            if (timestamp > 0) distancePoint.setTime(timestamp);
            if (point.has("accuracy") && !point.isNull("accuracy")) distancePoint.setAccuracy((float) point.optDouble("accuracy"));
            if (point.has("speed") && !point.isNull("speed")) distancePoint.setSpeed((float) point.optDouble("speed"));
            appendFilteredDistanceLocation(distancePoint);
          }
        } catch (Exception ignored) {}
      }
    } catch (Exception error) {
      Log.e("KfeNativeGpsService", "Unable to rebuild filtered GPS distance from durable trace.", error);
    }
    refreshLiveDistanceReadout();
  }

  private void appendFilteredDistanceLocation(Location location) {
    if (location == null || !location.hasAccuracy() || location.getAccuracy() > MAX_ACCURACY_FOR_DISTANCE_METERS) return;
    Location previous = filteredDistanceLocations.isEmpty() ? null : filteredDistanceLocations.get(filteredDistanceLocations.size() - 1);
    float segmentMeters = 0f;
    if (previous != null) {
      long elapsedMs = location.getTime() - previous.getTime();
      if (elapsedMs <= 0L) return;
      float displacementMeters = previous.distanceTo(location);
      if (displacementMeters < 1f) return;
      if (location.hasSpeed() && location.getSpeed() * 3.6f > MAX_REASONABLE_SPEED_KMH) return;
      if (elapsedMs <= MAX_CONTIGUOUS_GAP_MS) {
        float measuredSpeedKmh = (displacementMeters / 1000f) / (elapsedMs / 3600000f);
        if (measuredSpeedKmh > MAX_REASONABLE_SPEED_KMH) return;
        segmentMeters = displacementMeters;
      }
      // Match the shared JS filter: only an explicitly stationary, short move is
      // discarded as jitter. Missing speed is unknown, not stationary.
      if (location.hasSpeed() && location.getSpeed() * 3.6f <= 2f && displacementMeters <= 30f) return;
    }
    // Incremental accounting avoids an O(n^2) full-trace rescan on every GPS fix.
    passengerDistanceMeters += segmentMeters;
    filteredDistanceLocations.add(new Location(location));
    lastPassengerLocation = new Location(location);
  }

  private void refreshLiveDistanceReadout() {
    String distance = String.format(java.util.Locale.US, "%.1f km", passengerDistanceMeters / 1000d);
    if ("DEAD_MOVEMENT_TRACE".equals(eventType)) KfeOverlayService.updateDeadKm(distance);
    else KfeOverlayService.updateLiveKm(distance);
  }

  private void releaseLocationUpdates() {
    if (fused != null && callback != null) {
      try { fused.removeLocationUpdates(callback); } catch (Exception ignored) {}
    }
    callback = null;
  }

  static boolean isAnyPersistedTracking(Context context) {
    android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String activeId = prefs.getString(ACTIVE_TRIP, "");
    KfeNativeGpsService service = liveInstance;
    return service != null && activeId != null && !activeId.trim().isEmpty()
      && activeId.equals(service.tripId) && service.callback != null && prefs.getBoolean(ACTIVE_READY, false);
  }

  static String persistedActiveTripId(Context context) {
    String id = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(ACTIVE_TRIP, "");
    return id == null ? "" : id;
  }

  static String persistedActiveEventType(Context context) {
    String event = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(ACTIVE_EVENT, "");
    return event == null ? "" : event;
  }

  static boolean isPersistedTracking(Context context, String id, String requestedEventType, String requestedEntityType) {
    android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String activeId = prefs.getString(ACTIVE_TRIP, "");
    String activeEvent = prefs.getString(ACTIVE_EVENT, "PASSENGER_RIDE_TRACE");
    String activeEntity = prefs.getString(ACTIVE_ENTITY, "TRIP");
    String wantedEvent = "DEAD_MOVEMENT_TRACE".equals(requestedEventType) ? "DEAD_MOVEMENT_TRACE" : "PASSENGER_RIDE_TRACE";
    String wantedEntity = "SHIFT".equals(requestedEntityType) ? "SHIFT" : "TRIP";
    KfeNativeGpsService service = liveInstance;
    return service != null && id != null && id.equals(activeId) && id.equals(service.tripId)
      && wantedEvent.equals(activeEvent) && wantedEntity.equals(activeEntity)
      && wantedEvent.equals(service.eventType) && wantedEntity.equals(service.entityType)
      && service.callback != null && prefs.getBoolean(ACTIVE_READY, false);
  }

  static boolean shouldStopForTrip(String activeTripId, String requestedTripId) {
    return activeTripId != null && !activeTripId.isEmpty()
      && requestedTripId != null && !requestedTripId.isEmpty()
      && activeTripId.equals(requestedTripId);
  }

  private void stopTracking() {
    releaseLocationUpdates();
    releaseLocationWakeLock();
    tripId = null;
    eventType = "PASSENGER_RIDE_TRACE";
    traceFile = null;
    lastPassengerLocation = null;
    passengerDistanceMeters = 0d;
    seenKeys.clear();
    filteredDistanceLocations.clear();
    getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove(ACTIVE_TRIP).remove(ACTIVE_EVENT).remove(ACTIVE_ENTITY).remove(ACTIVE_READY).apply();
  }

  public static String listTraceOwners(Context context) {
    org.json.JSONArray owners = new org.json.JSONArray();
    java.util.HashSet<String> seenOwners = new java.util.HashSet<>();
    File[] files = context.getFilesDir().listFiles((dir, name) -> name.startsWith("kfe_gps_trace_") && name.endsWith(".jsonl"));
    if (files == null) return owners.toString();
    for (File file : files) {
      try (BufferedReader reader = new BufferedReader(new FileReader(file))) {
        String line;
        while ((line = reader.readLine()) != null) {
          try {
            String ownerId = new JSONObject(line).optString("tripId", "");
            if (!ownerId.isEmpty() && seenOwners.add(ownerId)) owners.put(ownerId);
            break;
          } catch (Exception ignored) {}
        }
      } catch (Exception ignored) {}
    }
    return owners.toString();
  }

  public static String readTrace(Context context, String tripId) {
    if (tripId == null || tripId.isEmpty()) return "[]";
    File file = new File(context.getFilesDir(), "kfe_gps_trace_" + safeName(tripId) + ".jsonl");
    org.json.JSONArray array = new org.json.JSONArray();
    if (!file.exists()) return array.toString();
    try (BufferedReader reader = new BufferedReader(new FileReader(file))) {
      String line;
      while ((line = reader.readLine()) != null) {
        try { array.put(new JSONObject(line)); } catch (Exception ignored) {}
      }
    } catch (Exception ignored) {}
    return array.toString();
  }

  public static boolean clearTrace(Context context, String tripId) {
    if (tripId == null || tripId.isEmpty()) return false;
    return new File(context.getFilesDir(), "kfe_gps_trace_" + safeName(tripId) + ".jsonl").delete();
  }

  private static String safeName(String value) {
    return value.replaceAll("[^A-Za-z0-9._-]", "_");
  }

  private static boolean hasBackgroundLocationPermission(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true;
    return androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_BACKGROUND_LOCATION)
      == android.content.pm.PackageManager.PERMISSION_GRANTED;
  }

  private boolean hasLocationPermission() {
    return hasLocationPermission(this);
  }

  private static boolean hasLocationPermission(Context context) {
    return androidx.core.app.ActivityCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED
        || androidx.core.app.ActivityCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_COARSE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED;
  }

  private boolean ensureForegroundLocationService() {
    if (!hasLocationPermission()) {
      stopSelf();
      return false;
    }
    try {
      startAsForeground();
      return true;
    } catch (SecurityException error) {
      // Keep this failure visible: boot recovery can reach the receiver while
      // Android still rejects promotion of the location foreground service.
      Log.e("KfeNativeGpsService", "Unable to promote native GPS service to foreground.", error);
      getSharedPreferences(PREFS, MODE_PRIVATE).edit()
          .putString("lastForegroundStartFailure", error.getClass().getSimpleName() + ": " + error.getMessage())
          .putBoolean(ACTIVE_READY, false)
          .commit();
      stopSelf();
      return false;
    }
  }

  private void startAsForeground() {
    Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_menu_mylocation)
        .setContentTitle("KFE ride GPS active")
        .setContentText("Background ride location is being recorded.")
        .setOngoing(true)
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .build();
    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
    } else {
      startForeground(NOTIFICATION_ID, notification);
    }
  }

  private void createChannel() {
    if (Build.VERSION.SDK_INT >= 26) {
      NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
      if (manager != null) manager.createNotificationChannel(
          new NotificationChannel(CHANNEL_ID, "KFE Ride GPS", NotificationManager.IMPORTANCE_LOW));
    }
  }

  @Override public void onDestroy() {
    // Do not clear ACTIVE_TRIP here. START_STICKY may recreate this service after
    // an OS/process interruption, and the persisted trip id is required to resume.
    releaseLocationUpdates();
    releaseLocationWakeLock();
    getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(ACTIVE_READY, false).apply();
    if (liveInstance == this) liveInstance = null;
    super.onDestroy();
  }

  @Nullable @Override public IBinder onBind(Intent intent) { return null; }
}
