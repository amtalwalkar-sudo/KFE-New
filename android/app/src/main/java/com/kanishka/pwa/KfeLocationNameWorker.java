package com.kanishka.pwa;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.BackoffPolicy;
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
  private static final long[] LOCALITY_RETRY_DELAYS_MS = {
      60_000L, 5 * 60_000L, 30 * 60_000L, 2 * 60 * 60_000L, 12 * 60 * 60_000L
  };
  private static final String FALLBACK_ENDPOINT = "https://photon.komoot.io/reverse";
  private static final String CACHE_PREFIX = "kfe_locality_cache_v2:";

  public KfeLocationNameWorker(@NonNull Context context, @NonNull WorkerParameters params) {
    super(context, params);
  }

  public static void enqueue(@NonNull Context context) {
    enqueue(context, ExistingWorkPolicy.KEEP, 0L);
  }

  private static void enqueue(@NonNull Context context, @NonNull ExistingWorkPolicy policy) {
    enqueue(context, policy, 0L);
  }

  private static void enqueue(@NonNull Context context, @NonNull ExistingWorkPolicy policy, long delayMs) {
    Constraints constraints = new Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build();
    OneTimeWorkRequest.Builder builder = new OneTimeWorkRequest.Builder(KfeLocationNameWorker.class)
        .setConstraints(constraints)
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS);
    if (delayMs > 0L) builder.setInitialDelay(delayMs, TimeUnit.MILLISECONDS);
    WorkManager.getInstance(context.getApplicationContext())
        .enqueueUniqueWork(UNIQUE_WORK, policy, builder.build());
  }

  private static void enqueueContinuation(@NonNull Context context, long delayMs) {
    enqueue(context, ExistingWorkPolicy.APPEND_OR_REPLACE, Math.max(0L, delayMs));
  }

  private boolean hasValidatedInternet() {
    return KfeConnectivityService.hasValidatedInternet(getApplicationContext());
  }

  @NonNull @Override public Result doWork() {
    if (getRunAttemptCount() >= MAX_RETRIES) {
      Log.w(TAG, "Stopped after bounded transport retries; saved coordinates remain available.");
      return Result.failure();
    }

    try {
      if (!hasValidatedInternet()) return Result.retry();
      JSONObject listed = KfeCanonicalWorkStore.get(getApplicationContext()).listRecords("GPS_SNAPSHOT", 1000);
      JSONArray records = listed.optJSONArray("records");
      if (records == null || records.length() == 0) return Result.success();

      int processed = 0;
      boolean hasMoreDue = false;
      long earliestRetryAt = Long.MAX_VALUE;
      long now = System.currentTimeMillis();
      KfeCanonicalWorkStore store = KfeCanonicalWorkStore.get(getApplicationContext());

      for (int i = 0; i < records.length(); i++) {
        JSONObject snapshot = records.optJSONObject(i);
        if (!hasUnresolvedLocality(snapshot)) continue;
        double lat = snapshot.optDouble("latitude", Double.NaN);
        double lon = snapshot.optDouble("longitude", Double.NaN);
        if (!validCoordinates(lat, lon)) continue;

        long nextAttemptAt = nextAttemptAt(snapshot);
        if (nextAttemptAt > now) {
          earliestRetryAt = Math.min(earliestRetryAt, nextAttemptAt);
          continue;
        }
        if (processed >= BATCH_SIZE) {
          hasMoreDue = true;
          break;
        }

        // Keep requests gentle toward the public geocoder when several saved events are pending.
        if (processed > 0) Thread.sleep(250L);
        String label = reverseGeocode(lat, lon);
        long attemptedAt = System.currentTimeMillis();
        int attempts = Math.max(0, snapshot.optInt("geocodeAttemptCount", 0)) + 1;
        snapshot.put("geocodeAttemptedAt", Instant.ofEpochMilli(attemptedAt).toString());
        snapshot.put("geocodeLastAttemptAt", Instant.ofEpochMilli(attemptedAt).toString());
        snapshot.put("geocodeAttemptCount", attempts);
        snapshot.put("localityAttemptCount", attempts);
        snapshot.put("localityLastAttemptAt", Instant.ofEpochMilli(attemptedAt).toString());
        if (label != null && !label.trim().isEmpty()) {
          snapshot.put("placeName", label.trim());
          snapshot.put("localityResolutionState", "RESOLVED");
          snapshot.put("localityResolvedAt", Instant.ofEpochMilli(attemptedAt).toString());
          snapshot.put("localityProvider", BuildConfig.KFE_MAPPLS_GEOCODER_GATEWAY.isEmpty() ? "photon" : "mappls-gateway-or-photon");
          snapshot.put("localityLastError", JSONObject.NULL);
          snapshot.put("localityNextAttemptAt", JSONObject.NULL);
          snapshot.remove("geocodeNextAttemptAt");
        } else {
          // A valid HTTP response with no usable locality is not success. Keep it
          // retryable with persisted backoff so a later network/geocoder recovery
          // can enrich the same snapshot without changing its GPS evidence.
          long delay = LOCALITY_RETRY_DELAYS_MS[Math.min(attempts - 1, LOCALITY_RETRY_DELAYS_MS.length - 1)];
          long retryAt = attemptedAt + delay;
          snapshot.put("localityResolutionState", "RETRY_SCHEDULED");
          snapshot.put("localityLastError", "NO_LOCALITY_MATCH_OR_PROVIDER_UNAVAILABLE");
          snapshot.put("localityNextAttemptAt", Instant.ofEpochMilli(retryAt).toString());
          snapshot.put("geocodeNextAttemptAt", Instant.ofEpochMilli(retryAt).toString());
          earliestRetryAt = Math.min(earliestRetryAt, retryAt);
        }
        snapshot.put("updatedAt", Instant.now().toString());
        KfeCanonicalWorkStore.Outcome outcome = store.putRecord(
            "gps-locality-" + snapshot.optString("id") + "-" + UUID.randomUUID(),
            "GPS_SNAPSHOT", snapshot);
        if (!outcome.accepted) throw new IOException("Canonical GPS locality update was not acknowledged.");
        processed++;
      }

      if (hasMoreDue) {
        enqueueContinuation(getApplicationContext(), 0L);
      } else if (earliestRetryAt != Long.MAX_VALUE) {
        enqueueContinuation(getApplicationContext(), Math.max(1L, earliestRetryAt - System.currentTimeMillis()));
      }
      return Result.success();
    } catch (IOException error) {
      Log.w(TAG, "Reverse geocoding temporarily failed; WorkManager will retry with backoff.", error);
      return Result.retry();
    } catch (Exception error) {
      Log.e(TAG, "Saved GPS locality enrichment failed safely.", error);
      return Result.retry();
    }
  }

  private static boolean hasUnresolvedLocality(JSONObject snapshot) {
    return snapshot != null && snapshot.optString("placeName", "").trim().isEmpty();
  }

  private static boolean validCoordinates(double latitude, double longitude) {
    return Double.isFinite(latitude) && Math.abs(latitude) <= 90
        && Double.isFinite(longitude) && Math.abs(longitude) <= 180;
  }

  private static long nextAttemptAt(JSONObject snapshot) {
    String rawNext = snapshot.optString("geocodeNextAttemptAt", "");
    if (!rawNext.isEmpty() && !"null".equalsIgnoreCase(rawNext)) {
      try { return Instant.parse(rawNext).toEpochMilli(); }
      catch (Exception ignored) { /* malformed legacy retry metadata is retried safely */ }
    }
    // Older builds wrote geocodeAttemptedAt and then permanently skipped that
    // record. Treat that field as history, not terminal completion.
    String legacyAttempt = snapshot.optString("geocodeAttemptedAt", "");
    if (!legacyAttempt.isEmpty() && snapshot.optInt("geocodeAttemptCount", 0) <= 0) {
      try {
        return Instant.parse(legacyAttempt).toEpochMilli() + LOCALITY_RETRY_DELAYS_MS[0];
      } catch (Exception ignored) {
        return 0L;
      }
    }
    return 0L;
  }

  private String reverseGeocode(double latitude, double longitude) throws IOException {
    String key = String.format(java.util.Locale.US, "%.5f:%.5f", latitude, longitude);
    android.content.SharedPreferences cache = getApplicationContext().getSharedPreferences("kfe_locality_cache", Context.MODE_PRIVATE);
    String cached = cache.getString(CACHE_PREFIX + key, null);
    if (cached != null && !cached.trim().isEmpty()) return cached;
    String label = null;
    String gateway = BuildConfig.KFE_MAPPLS_GEOCODER_GATEWAY == null ? "" : BuildConfig.KFE_MAPPLS_GEOCODER_GATEWAY.trim();
    if (!gateway.isEmpty()) {
      try { label = requestProvider(gateway, latitude, longitude); }
      catch (IOException error) { Log.w(TAG, "Mappls gateway unavailable; trying Photon fallback.", error); }
    }
    if (label == null || label.trim().isEmpty()) label = requestProvider(FALLBACK_ENDPOINT, latitude, longitude);
    if (label != null && !label.trim().isEmpty()) cache.edit().putString(CACHE_PREFIX + key, label.trim()).apply();
    return label;
  }

  private String requestProvider(String endpoint, double latitude, double longitude) throws IOException {
    String sep = endpoint.contains("?") ? "&" : "?";
    String query = sep + "lat=" + URLEncoder.encode(Double.toString(latitude), StandardCharsets.UTF_8.name())
        + "&lon=" + URLEncoder.encode(Double.toString(longitude), StandardCharsets.UTF_8.name());
    HttpURLConnection connection = (HttpURLConnection) new URL(endpoint.replaceAll("/$", "") + query).openConnection();
    connection.setRequestMethod("GET"); connection.setConnectTimeout(5000); connection.setReadTimeout(5000);
    connection.setRequestProperty("Accept", "application/json"); connection.setUseCaches(true);
    try {
      int status = connection.getResponseCode();
      if (status == 429 || status >= 500) throw new IOException("Reverse geocoder returned HTTP " + status);
      if (status < 200 || status >= 300) return null;
      try (InputStream input = connection.getInputStream(); BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
        StringBuilder body = new StringBuilder(); String line;
        while ((line = reader.readLine()) != null) body.append(line);
        JSONObject payload = new JSONObject(body.toString());
        JSONObject properties = null;
        JSONArray features = payload.optJSONArray("features");
        if (features != null && features.length() > 0) {
          JSONObject feature = features.optJSONObject(0);
          properties = feature == null ? null : feature.optJSONObject("properties");
        }
        if (properties == null) properties = payload.optJSONObject("address");
        if (properties == null) properties = payload.optJSONObject("result");
        if (properties == null) properties = payload;
        String locality = first(properties, "suburb", "neighbourhood", "neighborhood", "locality", "district", "county", "city_district", "area", "subDistrict");
        String city = first(properties, "city", "town", "village", "municipality", "cityName");
        String state = first(properties, "state", "stateName");
        StringBuilder label = new StringBuilder(); appendDistinct(label, locality); appendDistinct(label, city); appendDistinct(label, state);
        return label.length() == 0 ? null : label.toString();
      } catch (org.json.JSONException error) { throw new IOException("Reverse geocoder returned an unreadable response.", error); }
    } finally { connection.disconnect(); }
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
