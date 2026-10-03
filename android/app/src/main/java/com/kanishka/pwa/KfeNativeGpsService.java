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
import java.io.FileWriter;
import java.util.HashSet;
import java.util.Set;

public class KfeNativeGpsService extends Service {
  public static final String ACTION_START = "com.kanishka.pwa.NATIVE_GPS_START";
  public static final String ACTION_STOP = "com.kanishka.pwa.NATIVE_GPS_STOP";
  public static final String EXTRA_TRIP_ID = "tripId";
  private static final String PREFS = "kfe_native_gps";
  private static final String ACTIVE_TRIP = "activeTripId";
  private static final String ACTIVE_EVENT = "activeEventType";
  private static final String CHANNEL_ID = "kfe_native_gps";
  private static final int NOTIFICATION_ID = 7110;

  private FusedLocationProviderClient fused;
  private LocationCallback callback;
  private String tripId;
  private String eventType = "PASSENGER_RIDE_TRACE";
  private File traceFile;
  private Location lastPassengerLocation;
  private double passengerDistanceMeters = 0d;
  private final Set<String> seenKeys = new HashSet<>();

  public static void start(Context context, String tripId, String eventType) {
    Intent intent = new Intent(context, KfeNativeGpsService.class);
    intent.setAction(ACTION_START);
    intent.putExtra(EXTRA_TRIP_ID, tripId);
    intent.putExtra("eventType", eventType == null ? "PASSENGER_RIDE_TRACE" : eventType);
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
    fused = LocationServices.getFusedLocationProviderClient(this);
  }

  @Override public int onStartCommand(Intent intent, int flags, int startId) {
    String action = intent == null ? null : intent.getAction();
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
      if (requested != null && !requested.isEmpty()) {
        if (!ensureForegroundLocationService()) return START_NOT_STICKY;
        startTracking(requested, requestedEvent);
      }
      return START_STICKY;
    }

    String persisted = getSharedPreferences(PREFS, MODE_PRIVATE).getString(ACTIVE_TRIP, "");
    String persistedEvent = getSharedPreferences(PREFS, MODE_PRIVATE).getString(ACTIVE_EVENT, "PASSENGER_RIDE_TRACE");
    if (persisted != null && !persisted.isEmpty()) {
      if (!ensureForegroundLocationService()) return START_NOT_STICKY;
      startTracking(persisted, persistedEvent);
    }
    return START_STICKY;
  }

  private void startTracking(String id, String requestedEventType) {
    if (id == null || id.isEmpty()) return;
    if (!hasLocationPermission()) return;
    String requestedType = "DEAD_MOVEMENT_TRACE".equals(requestedEventType) ? "DEAD_MOVEMENT_TRACE" : "PASSENGER_RIDE_TRACE";
    if (id.equals(tripId) && callback != null && requestedType.equals(eventType)) return;
    // A trip starts with pickup/dead-movement telemetry and must switch to
    // passenger-ride telemetry when Start Trip is pressed. Restart the callback
    // for the same trip when its event type changes; otherwise all ride points
    // would remain mislabeled as dead movement and be excluded from trip distance.
    releaseLocationUpdates();
    tripId = id;
    eventType = requestedType;
    traceFile = new File(getFilesDir(), "kfe_gps_trace_" + safeName(id) + ".jsonl");
    loadSeenKeys();
    getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(ACTIVE_TRIP, id).putString(ACTIVE_EVENT, eventType).apply();

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
      point.put("latitude", location.getLatitude());
      point.put("longitude", location.getLongitude());
      point.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : JSONObject.NULL);
      point.put("speed", location.hasSpeed() ? location.getSpeed() : JSONObject.NULL);
      point.put("bearing", location.hasBearing() ? location.getBearing() : JSONObject.NULL);
      point.put("capturedAt", new java.util.Date(timestamp).toInstant().toString());
      point.put("capturedAtEpoch", timestamp);
      point.put("source", "ANDROID_NATIVE_FGS");
      point.put("eventType", eventType);

      try (FileWriter writer = new FileWriter(traceFile, true)) {
        writer.write(point.toString());
        writer.write("\n");
      }
      seenKeys.add(key);
      if ("PASSENGER_RIDE_TRACE".equals(eventType)) {
        if (lastPassengerLocation != null) passengerDistanceMeters += lastPassengerLocation.distanceTo(location);
        lastPassengerLocation = new Location(location);
        KfeOverlayService.updateLiveKm(String.format(java.util.Locale.US, "%.1f km", passengerDistanceMeters / 1000d));
      }
    } catch (Exception ignored) {
      // A transient local write failure must not kill the foreground location service.
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
    getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove(ACTIVE_TRIP).remove(ACTIVE_EVENT).apply();
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

  private boolean hasLocationPermission() {
    return androidx.core.app.ActivityCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED
        || androidx.core.app.ActivityCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_COARSE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED;
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
