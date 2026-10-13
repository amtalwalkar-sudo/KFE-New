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
import java.util.HashSet;
import java.util.Set;

public class KfeNativeGpsService extends Service {
  public static final String ACTION_START = "com.kanishka.pwa.NATIVE_GPS_START";
  public static final String ACTION_STOP = "com.kanishka.pwa.NATIVE_GPS_STOP";
  public static final String EXTRA_TRIP_ID = "tripId";
  private static final String PREFS = "kfe_native_gps";
  private static final String ACTIVE_TRIP = "activeTripId";
  private static final String ACTIVE_EVENT = "activeEventType";
  private static final String ACTIVE_ENTITY = "activeEntityType";
  private static final String CHANNEL_ID = "kfe_native_gps";
  private static final int NOTIFICATION_ID = 7110;

  private FusedLocationProviderClient fused;
  private LocationCallback callback;
  private String tripId;
  private String eventType = "PASSENGER_RIDE_TRACE";
  private String entityType = "TRIP";
  private File traceFile;
  private Location lastPassengerLocation;
  private double passengerDistanceMeters = 0d;
  private final Set<String> seenKeys = new HashSet<>();

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
    // Boot/package-replacement broadcasts are delivered even when no ride is
    // active. Only revive an actually persisted ride with location permission.
    String persisted = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(ACTIVE_TRIP, "");
    if (persisted == null || persisted.trim().isEmpty() || !hasLocationPermission(context) || !hasBackgroundLocationPermission(context)) return;
    Intent intent = new Intent(context, KfeNativeGpsService.class);
    intent.setAction("com.kanishka.pwa.NATIVE_GPS_RESUME");
    androidx.core.content.ContextCompat.startForegroundService(context, intent);
  }

  public static void stop(Context context, String tripId) {
    Intent intent = new Intent(context, KfeNativeGpsService.class);
    intent.setAction(ACTION_STOP);
    intent.putExtra(EXTRA_TRIP_ID, tripId == null ? "" : tripId);
    context.startService(intent);
  }

  @Override public void onCreate() {
    super.onCreate();
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
    getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(ACTIVE_TRIP, id).putString(ACTIVE_EVENT, eventType).putString(ACTIVE_ENTITY, entityType).apply();

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

    fused.requestLocationUpdates(request, callback, getMainLooper());
  }

  private void persistLocation(Location location) {
    if (location == null || traceFile == null) return;
    if (!location.hasAccuracy() || location.getAccuracy() > 100f) return;

    long timestamp = location.getTime() > 0 ? location.getTime() : System.currentTimeMillis();
    String key = timestamp + "|" + location.getLatitude() + "|" + location.getLongitude();
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
      if ("PASSENGER_RIDE_TRACE".equals(eventType)) {
        if (lastPassengerLocation != null) passengerDistanceMeters += lastPassengerLocation.distanceTo(location);
        lastPassengerLocation = new Location(location);
        KfeOverlayService.updateLiveKm(String.format(java.util.Locale.US, "%.1f km", passengerDistanceMeters / 1000d));
      }
    } catch (Exception error) {
      // Do not mark the point as seen when persistence fails. The next location
      // callback can retry the same evidence instead of silently losing it.
      Log.e("KfeNativeGpsService", "GPS trace persistence failed; point will be retried.", error);
    }
  }

  private void loadSeenKeys() {
    seenKeys.clear();
    lastPassengerLocation = null;
    passengerDistanceMeters = 0d;
    if (traceFile == null || !traceFile.exists()) return;
    try (BufferedReader reader = new BufferedReader(new FileReader(traceFile))) {
      String line;
      while ((line = reader.readLine()) != null) {
        try {
          JSONObject point = new JSONObject(line);
          seenKeys.add(point.optLong("capturedAtEpoch", -1) + "|" + point.optDouble("latitude") + "|" + point.optDouble("longitude"));
          if ("PASSENGER_RIDE_TRACE".equals(point.optString("eventType", ""))) {
            Location passengerPoint = new Location("KFE");
            passengerPoint.setLatitude(point.optDouble("latitude"));
            passengerPoint.setLongitude(point.optDouble("longitude"));
            if (lastPassengerLocation != null) passengerDistanceMeters += lastPassengerLocation.distanceTo(passengerPoint);
            lastPassengerLocation = passengerPoint;
          }
        } catch (Exception ignored) {}
      }
    } catch (Exception ignored) {}
  }

  private void releaseLocationUpdates() {
    if (fused != null && callback != null) {
      try { fused.removeLocationUpdates(callback); } catch (Exception ignored) {}
    }
    callback = null;
  }

  static String persistedActiveTripId(Context context) {
    String id = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(ACTIVE_TRIP, "");
    return id == null ? "" : id;
  }

  static boolean isPersistedTracking(Context context, String id, String requestedEventType, String requestedEntityType) {
    android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String activeId = prefs.getString(ACTIVE_TRIP, "");
    String activeEvent = prefs.getString(ACTIVE_EVENT, "PASSENGER_RIDE_TRACE");
    String activeEntity = prefs.getString(ACTIVE_ENTITY, "TRIP");
    String wantedEvent = "DEAD_MOVEMENT_TRACE".equals(requestedEventType) ? "DEAD_MOVEMENT_TRACE" : "PASSENGER_RIDE_TRACE";
    String wantedEntity = "SHIFT".equals(requestedEntityType) ? "SHIFT" : "TRIP";
    return id != null && id.equals(activeId) && wantedEvent.equals(activeEvent) && wantedEntity.equals(activeEntity);
  }

  static boolean shouldStopForTrip(String activeTripId, String requestedTripId) {
    return activeTripId != null && !activeTripId.isEmpty()
      && requestedTripId != null && !requestedTripId.isEmpty()
      && activeTripId.equals(requestedTripId);
  }

  private void stopTracking() {
    releaseLocationUpdates();
    tripId = null;
    eventType = "PASSENGER_RIDE_TRACE";
    traceFile = null;
    lastPassengerLocation = null;
    passengerDistanceMeters = 0d;
    seenKeys.clear();
    getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove(ACTIVE_TRIP).remove(ACTIVE_EVENT).remove(ACTIVE_ENTITY).apply();
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
    } catch (SecurityException ignored) {
      // Android 14+ also enforces foreground-service eligibility at startForeground().
      // Never let a missing runtime/FGS permission crash the process; the PWA can
      // retry after the user grants location access and starts an eligible workflow.
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
    super.onDestroy();
  }

  @Nullable @Override public IBinder onBind(Intent intent) { return null; }
}
