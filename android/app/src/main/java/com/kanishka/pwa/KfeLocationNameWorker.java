package com.kanishka.pwa;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * Best-effort locality enrichment for already-saved GPS snapshots.
 * Coordinates and event timestamps are never changed by this worker.
 */
public final class KfeLocationNameWorker extends Worker {
  private static final String TAG = "KfeLocationName";
  private static final String UNIQUE_WORK = "kfe-location-name-enrichment";
  private static final int BATCH_SIZE = 20;
  private static final int MAX_RETRIES = 5;
  private static final String ENDPOINT = "https://photon.komoot.io/reverse";

  public KfeLocationNameWorker(@NonNull Context context, @NonNull WorkerParameters params) {
    super(context, params);
  }

  public static void enqueue(@NonNull Context context) {
    enqueue(context, ExistingWorkPolicy.KEEP);
  }

  private static void enqueue(@NonNull Context context, @NonNull ExistingWorkPolicy policy) {
    Constraints constraints = new Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build();
    OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(KfeLocationNameWorker.class)
        .setConstraints(constraints)
        .setBackoffCriteria(androidx.work.BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
        .build();
    WorkManager.getInstance(context.getApplicationContext())
        .enqueueUniqueWork(UNIQUE_WORK, policy, request);
  }

  private static void enqueueContinuation(@NonNull Context context) {
    enqueue(context, ExistingWorkPolicy.APPEND_OR_REPLACE);
  }

  private boolean hasValidatedInternet() {
    return KfeConnectivityService.hasValidatedInternet(getApplicationContext());
  }

  @NonNull @Override public Result doWork() {
    if (getRunAttemptCount() >= MAX_RETRIES) {
      Log.w(TAG, "Stopped after bounded reverse-geocoding retries; saved coordinates remain available.");
      return Result.failure();
    }

    try {
      if (!hasValidatedInternet()) return Result.retry();
      JSONObject listed = KfeCanonicalWorkStore.get(getApplicationContext()).listRecords("GPS_SNAPSHOT", 1000);
      JSONArray records = listed.optJSONArray("records");
      if (records == null || records.length() == 0) return Result.success();

      int processed = 0;
      boolean hasMorePending = false;
      KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(getApplicationContext());
      for (int i = 0; i < records.length(); i++) {
        JSONObject snapshot = records.optJSONObject(i);
        if (snapshot == null || !snapshot.optString("placeName", "").trim().isEmpty()) continue;
        if (snapshot.has("geocodeAttemptedAt") && !snapshot.isNull("geocodeAttemptedAt")) continue;
        double lat = snapshot.optDouble("latitude", Double.NaN);
        double lon = snapshot.optDouble("longitude", Double.NaN);
        if (!Double.isFinite(lat) || Math.abs(lat) > 90 || !Double.isFinite(lon) || Math.abs(lon) > 180) continue;

        if (processed >= BATCH_SIZE) {
          hasMorePending = true;
          break;
        }
        // Keep requests gentle toward the public geocoder when several saved events are pending.
        if (processed > 0) Thread.sleep(250L);
        String label = reverseGeocode(lat, lon);
        snapshot.put("geocodeAttemptedAt", Instant.now().toString());
        if (label != null && !label.trim().isEmpty()) snapshot.put("placeName", label);
        snapshot.put("updatedAt", Instant.now().toString());
        KfeCanonicalWorkStore.Outcome outcome = store.putRecord(
            "gps-locality-" + snapshot.optString("id") + "-" + UUID.randomUUID(),
            "GPS_SNAPSHOT", snapshot);
        if (!outcome.accepted) throw new IOException("Canonical GPS locality update was not acknowledged.");
        processed++;
      }

      if (hasMorePending) enqueueContinuation(getApplicationContext());
      return Result.success();
    } catch (IOException error) {
      Log.w(TAG, "Reverse geocoding temporarily failed; WorkManager will retry with backoff.", error);
      return Result.retry();
    } catch (Exception error) {
      Log.e(TAG, "Saved GPS locality enrichment failed safely.", error);
      return Result.retry();
    }
  }

  private String reverseGeocode(double latitude, double longitude) throws IOException {
    String query = "?lat=" + URLEncoder.encode(Double.toString(latitude), StandardCharsets.UTF_8.name())
        + "&lon=" + URLEncoder.encode(Double.toString(longitude), StandardCharsets.UTF_8.name());
    HttpURLConnection connection = (HttpURLConnection) new URL(ENDPOINT + query).openConnection();
    connection.setRequestMethod("GET");
    connection.setConnectTimeout(5000);
    connection.setReadTimeout(5000);
    connection.setUseCaches(true);
    try {
      int status = connection.getResponseCode();
      if (status == 429 || status >= 500) throw new IOException("Reverse geocoder returned HTTP " + status);
      if (status < 200 || status >= 300) return null;
      try (InputStream input = connection.getInputStream();
           BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
        StringBuilder body = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) body.append(line);
        JSONObject payload = new JSONObject(body.toString());
        JSONArray features = payload.optJSONArray("features");
        if (features == null || features.length() == 0) return null;
        JSONObject properties = features.optJSONObject(0) == null ? new JSONObject()
            : features.optJSONObject(0).optJSONObject("properties");
        if (properties == null) return null;
        String locality = first(properties, "suburb", "neighbourhood", "neighborhood", "locality", "district", "county", "city_district");
        String city = first(properties, "city", "town", "village", "municipality");
        String state = first(properties, "state");
        StringBuilder label = new StringBuilder();
        appendDistinct(label, locality);
        appendDistinct(label, city);
        appendDistinct(label, state);
        return label.length() == 0 ? null : label.toString();
      } catch (org.json.JSONException parseError) {
        throw new IOException("Reverse geocoder returned an unreadable response.", parseError);
      }
    } finally {
      connection.disconnect();
    }
  }

  private static String first(JSONObject object, String... keys) {
    for (String key : keys) {
      String value = object.optString(key, "").trim();
      if (!value.isEmpty() && !"null".equalsIgnoreCase(value)) return value;
    }
    return "";
  }

  private static void appendDistinct(StringBuilder target, String value) {
    if (value == null || value.trim().isEmpty()) return;
    String candidate = value.trim();
    for (String existing : target.toString().split(", ")) {
      if (existing.equalsIgnoreCase(candidate)) return;
    }
    if (target.length() > 0) target.append(", ");
    target.append(candidate);
  }
}
