package com.kanishka.pwa;

import android.os.StatFs;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.valhalla.valhalla.Valhalla;
import com.squareup.moshi.Moshi;
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory;
import com.valhalla.valhalla.config.ValhallaConfigFactory;
import com.valhalla.valhalla.config.ValhallaConfigManager;
import com.valhalla.valhalla.files.ValhallaFile;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.Locale;
import java.util.Date;
import java.text.SimpleDateFormat;
import java.util.TimeZone;

@CapacitorPlugin(name = "KfeOfflineMaps")
public class KfeOfflineMapsPlugin extends Plugin {
    private static final String DEFAULT_REGION_ID = "mumbai-pune-nashik-alibag-v1";
    private static final String MANIFEST_URL = "https://github.com/amtalwalkar-sudo/KFE-New/releases/download/offline-maps/offline-maps-manifest.json";
    private static final ExecutorService DOWNLOAD_IO = Executors.newSingleThreadExecutor();
    private static final ExecutorService MATCH_IO = Executors.newSingleThreadExecutor();
    private static final ExecutorService STATUS_IO = Executors.newSingleThreadExecutor();
    private final Object mapStateLock = new Object();
    private boolean mapUpdateInProgress = false;
    private File mapDir() { File f = new File(getContext().getFilesDir(), "offline-maps"); if (!f.exists()) f.mkdirs(); return f; }
    private File tilesFile() { return new File(mapDir(), "valhalla-tiles.tar"); }
    private File metadataFile() { return new File(mapDir(), "map-metadata.json"); }

    @PluginMethod public void getStatus(PluginCall call) {
        STATUS_IO.execute(() -> {
            File statusManifest = new File(mapDir(), "status-manifest.json");
            try {
                synchronized (mapStateLock) { if (!mapUpdateInProgress) recoverStagedMap(); }
                File tiles = tilesFile(); File meta = metadataFile();
                String requestedRegionId = call.getString("regionId", DEFAULT_REGION_ID);
                JSObject out = new JSObject();
                out.put("supported", true); out.put("regionId", requestedRegionId);
                synchronized (mapStateLock) { out.put("updateInProgress", mapUpdateInProgress); }
                long installedBytes = tiles.isFile() ? tiles.length() : 0;
                out.put("bytesInstalled", installedBytes);
                StatFs fs = new StatFs(getContext().getFilesDir().getAbsolutePath());
                out.put("bytesAvailable", fs.getAvailableBytes());
                JSONObject installedMetadata = meta.isFile() ? new JSONObject(readText(meta)) : new JSONObject();
                String installedRegionId = installedMetadata.optString("regionId", "");
                out.put("installedRegionId", installedRegionId);
                out.put("installed", tiles.isFile() && tiles.length() > 0 && meta.isFile() && requestedRegionId.equals(installedRegionId));
                if (meta.isFile()) {
                    out.put("installedVersion", installedMetadata.optString("version", ""));
                    out.put("installedAt", installedMetadata.optString("installedAt", ""));
                    out.put("installedRegion", installedMetadata.optString("region", ""));
                }
                try {
                    JSONObject catalog = fetchJson(MANIFEST_URL, statusManifest, 4000, 5000);
                    JSONArray regions = catalog.optJSONArray("regions");
                    JSONObject manifest = findRegionManifest(catalog, requestedRegionId);
                    if (regions != null) out.put("availableRegions", regionsForUi(regions));
                    if (manifest == null) throw new IllegalStateException("No published offline map package exists for the selected area.");
                    long requiredBytes = manifest.optLong("sizeBytes", 0);
                    if (requiredBytes <= 0 || manifest.optString("sha256", "").length() != 64 || !manifest.optString("packageUrl", "").startsWith("https://")) throw new IllegalStateException("Map manifest is invalid.");
                    long safetyMargin = Math.max(64L * 1024 * 1024, requiredBytes / 10);
                    out.put("manifestAvailable", true);
                    out.put("latestVersion", manifest.optString("version", ""));
                    out.put("bytesRequired", requiredBytes);
                    out.put("bytesRequiredForUpdate", requiredBytes + installedBytes + safetyMargin);
                    out.put("region", manifest.optString("region", requestedRegionId));
                    out.put("coverageBounds", manifest.optJSONObject("coverageBounds"));
                    out.put("mapAttribution", catalog.optString("attribution", manifest.optString("attribution", "© OpenStreetMap contributors")));
                } catch (Exception manifestError) {
                    out.put("manifestAvailable", false);
                    out.put("manifestError", manifestError.getMessage() == null ? "Latest map version could not be checked. Connect to the internet and refresh." : manifestError.getMessage());
                    if (!out.has("availableRegions")) {
                        JSONArray knownRegions = new JSONArray();
                        knownRegions.put(new JSONObject().put("regionId", DEFAULT_REGION_ID).put("region", "Mumbai · Pune · Nashik · Alibag"));
                        out.put("availableRegions", knownRegions);
                    }
                } finally { statusManifest.delete(); }
                call.resolve(out);
            } catch (Exception e) { statusManifest.delete(); call.reject("Unable to read offline map status safely.", e); }
        });
    }

    @PluginMethod public void downloadUpdate(PluginCall call) {
        if (!call.getBoolean("confirmed", false)) { call.reject("Confirm the offline map download first."); return; }
        String requestedRegionId = call.getString("regionId", DEFAULT_REGION_ID);
        synchronized (mapStateLock) {
            if (mapUpdateInProgress) { call.reject("An offline map download/update is already running."); return; }
            mapUpdateInProgress = true;
        }
        DOWNLOAD_IO.execute(() -> {
            File stage = new File(mapDir(), "staging"); if (!stage.exists()) stage.mkdirs();
            File part = new File(stage, "valhalla-tiles.tar.part");
            File manifestTemp = new File(stage, "manifest.json");
            try {
                recoverStagedMap();
                JSONObject catalog = fetchJson(MANIFEST_URL, manifestTemp);
                JSONObject manifest = findRegionManifest(catalog, requestedRegionId);
                if (manifest == null) throw new IllegalStateException("No published offline map package exists for the selected area.");
                String version = manifest.getString("version");
                String packageUrl = manifest.getString("packageUrl");
                String expectedHash = manifest.getString("sha256").toLowerCase(Locale.ROOT);
                long expectedBytes = manifest.getLong("sizeBytes");
                if (!packageUrl.startsWith("https://") || expectedBytes <= 0 || expectedHash.length() != 64) throw new IllegalStateException("The map manifest is incomplete or unsafe.");
                long available = new StatFs(getContext().getFilesDir().getAbsolutePath()).getAvailableBytes();
                long existingBytes = tilesFile().isFile() ? tilesFile().length() : 0;
                long requiredBytes = expectedBytes + existingBytes + Math.max(64L * 1024 * 1024, expectedBytes / 10);
                if (available < requiredBytes) throw new IllegalStateException("Not enough free storage for a safe map update. Required free space: " + requiredBytes + " bytes.");
                downloadFile(packageUrl, part, expectedBytes, expectedHash);
                JSONObject metadata = new JSONObject();
                metadata.put("regionId", requestedRegionId); metadata.put("region", manifest.optString("region", requestedRegionId));
                if (manifest.has("coverageBounds") && !manifest.isNull("coverageBounds")) metadata.put("coverageBounds", manifest.getJSONObject("coverageBounds"));
                metadata.put("version", version); metadata.put("sha256", expectedHash); metadata.put("sizeBytes", expectedBytes);
                SimpleDateFormat installedAtFormat = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT); installedAtFormat.setTimeZone(TimeZone.getTimeZone("UTC")); metadata.put("installedAt", installedAtFormat.format(new Date())); metadata.put("engineVersion", manifest.optString("engineVersion", "0.6.4"));
                File nextMeta = new File(stage, "map-metadata.json"); writeText(nextMeta, metadata.toString());
                File active = tilesFile(); File old = new File(stage, "previous-tiles.tar");
                File activeMeta = metadataFile(); File oldMeta = new File(stage, "previous-map-metadata.json");
                if (old.exists()) old.delete(); if (oldMeta.exists()) oldMeta.delete();
                if (active.exists() && !active.renameTo(old)) throw new IllegalStateException("Unable to stage existing map safely.");
                if (activeMeta.exists() && !activeMeta.renameTo(oldMeta)) { if (old.exists()) old.renameTo(active); throw new IllegalStateException("Unable to stage existing map metadata safely."); }
                if (!part.renameTo(active)) { if (old.exists()) old.renameTo(active); if (oldMeta.exists()) oldMeta.renameTo(activeMeta); throw new IllegalStateException("Unable to activate downloaded map."); }
                if (!nextMeta.renameTo(activeMeta)) { active.delete(); if (old.exists()) old.renameTo(active); if (oldMeta.exists()) oldMeta.renameTo(activeMeta); throw new IllegalStateException("Unable to commit map metadata."); }
                old.delete(); oldMeta.delete();
                JSObject done = new JSObject(); done.put("version", version); done.put("bytesInstalled", expectedBytes); done.put("regionId", requestedRegionId); done.put("region", manifest.optString("region", requestedRegionId));
                notifyListeners("downloadComplete", done);
            } catch (Exception e) {
                part.delete();
                JSObject failure = new JSObject(); failure.put("message", e.getMessage() == null ? "Map download failed." : e.getMessage());
                notifyListeners("downloadFailed", failure);
            } finally { manifestTemp.delete(); synchronized (mapStateLock) { mapUpdateInProgress = false; } }
        });
        JSObject response = new JSObject(); response.put("started", true); call.resolve(response);
    }

    @PluginMethod public void traceRoute(PluginCall call) {
        JSArray points = call.getArray("points");
        if (points == null || points.length() < 2) { call.reject("At least two GPS points are required."); return; }
        MATCH_IO.execute(() -> {
            try {
                File tiles = tilesFile(); File meta = metadataFile();
                if (!tiles.isFile() || tiles.length() == 0 || !meta.isFile()) throw new IllegalStateException("Offline Valhalla maps are not installed.");
                JSONObject installed = new JSONObject(readText(meta));
                JSONObject bounds = installed.optJSONObject("coverageBounds");
                if (bounds != null) {
                    for (int i = 0; i < points.length(); i++) {
                        JSONObject point = points.getJSONObject(i);
                        double lat = point.optDouble("latitude", Double.NaN), lon = point.optDouble("longitude", Double.NaN);
                        if (!Double.isFinite(lat) || !Double.isFinite(lon)) continue;
                        if (lat < bounds.optDouble("south", -90) || lat > bounds.optDouble("north", 90)
                            || lon < bounds.optDouble("west", -180) || lon > bounds.optDouble("east", 180)) {
                            throw new IllegalArgumentException("GPS trace is outside the installed offline map coverage.");
                        }
                    }
                }
                JSONArray shape = new JSONArray();
                for (int i = 0; i < points.length(); i++) {
                    JSONObject p = points.getJSONObject(i);
                    double lat = p.optDouble("latitude", Double.NaN), lon = p.optDouble("longitude", Double.NaN);
                    if (Double.isNaN(lat) || Double.isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
                    JSONObject q = new JSONObject(); q.put("lat", lat); q.put("lon", lon);
                    String capturedAt = p.optString("capturedAt", p.optString("timestamp", ""));
                    try { SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSX", Locale.US); f.setTimeZone(TimeZone.getTimeZone("UTC")); q.put("time", f.parse(capturedAt).getTime() / 1000L); } catch (Exception ignored) {}
                    shape.put(q);
                }
                if (shape.length() < 2) throw new IllegalArgumentException("GPS trace has fewer than two valid points.");
                JSONObject request = new JSONObject(); request.put("shape", shape); request.put("shape_match", "map_snap"); request.put("costing", "auto"); request.put("units", "kilometers"); request.put("shape_format", "geojson");
                ValhallaConfigManager manager = new ValhallaConfigManager(getContext(), new ValhallaFile(getContext(), "valhalla-offline.json", mapDir()), new Moshi.Builder().add(new KotlinJsonAdapterFactory()).build());
                try (Valhalla engine = new Valhalla(getContext(), ValhallaConfigFactory.INSTANCE.usingTileExtract(tiles.getAbsolutePath(), null), manager)) {
                    String raw = engine.traceRouteRaw(request.toString());
                    JSObject result = new JSObject(); result.put("raw", raw); result.put("provider", "valhalla-mobile"); result.put("regionId", installed.optString("regionId", DEFAULT_REGION_ID));
                    call.resolve(result);
                }
            } catch (Exception e) { call.reject("Offline Valhalla map matching failed; raw GPS evidence must be retained.", e); }
        });
    }

    private JSONObject findRegionManifest(JSONObject catalog, String regionId) throws Exception {
        JSONArray regions = catalog.optJSONArray("regions");
        if (regions != null) {
            for (int i = 0; i < regions.length(); i++) {
                JSONObject region = regions.optJSONObject(i);
                if (region != null && regionId.equals(region.optString("regionId"))) return region;
            }
            return null;
        }
        return regionId.equals(catalog.optString("regionId")) ? catalog : null;
    }

    private JSONArray regionsForUi(JSONArray source) throws Exception {
        JSONArray result = new JSONArray();
        for (int i = 0; i < source.length(); i++) {
            JSONObject item = source.optJSONObject(i);
            if (item == null) continue;
            JSONObject option = new JSONObject();
            option.put("regionId", item.optString("regionId", ""));
            option.put("region", item.optString("region", item.optString("regionId", "")));
            option.put("sizeBytes", item.optLong("sizeBytes", 0));
            result.put(option);
        }
        return result;
    }

    private void recoverStagedMap() throws Exception {
        File active = tilesFile(); File activeMeta = metadataFile();
        File stage = new File(mapDir(), "staging");
        File old = new File(stage, "previous-tiles.tar");
        File oldMeta = new File(stage, "previous-map-metadata.json");
        boolean activePairValid = active.isFile() && active.length() > 0 && activeMeta.isFile();
        if (activePairValid) { old.delete(); oldMeta.delete(); return; }
        if (old.isFile() && old.length() > 0) {
            if (active.exists() && !active.delete()) throw new IllegalStateException("Unable to remove incomplete map during recovery.");
            if (!old.renameTo(active)) throw new IllegalStateException("Unable to restore previous offline map after interrupted update.");
            if (oldMeta.isFile()) {
                if (activeMeta.exists() && !activeMeta.delete()) throw new IllegalStateException("Unable to replace incomplete map metadata.");
                if (!oldMeta.renameTo(activeMeta)) throw new IllegalStateException("Unable to restore previous map metadata.");
            }
            return;
        }
        if (active.exists() && !active.delete()) throw new IllegalStateException("Unable to remove incomplete first map download.");
        if (activeMeta.exists() && !activeMeta.delete()) throw new IllegalStateException("Unable to remove incomplete map metadata.");
        if (oldMeta.exists() && !oldMeta.delete()) throw new IllegalStateException("Unable to clean incomplete map recovery metadata.");
    }

    private JSONObject fetchJson(String address, File temp) throws Exception { return fetchJson(address, temp, 15000, 30000); }
    private JSONObject fetchJson(String address, File temp, int connectTimeout, int readTimeout) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(address).openConnection(); c.setConnectTimeout(connectTimeout); c.setReadTimeout(readTimeout); c.setInstanceFollowRedirects(true); c.setRequestProperty("Accept", "application/json");
        try { if (c.getResponseCode() < 200 || c.getResponseCode() >= 300) throw new IllegalStateException("Map manifest unavailable (HTTP " + c.getResponseCode() + ")."); if (!"https".equalsIgnoreCase(c.getURL().getProtocol())) throw new IllegalStateException("Map manifest redirected to an insecure URL."); try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(temp)) { byte[] b = new byte[8192]; int n; while ((n=in.read(b))!=-1) out.write(b,0,n); } return new JSONObject(readText(temp)); } finally { c.disconnect(); }
    }
    private void downloadFile(String address, File destination, long expectedBytes, String expectedHash) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(address).openConnection(); c.setConnectTimeout(20000); c.setReadTimeout(60000); c.setInstanceFollowRedirects(true);
        try {
            if (c.getResponseCode() < 200 || c.getResponseCode() >= 300) throw new IllegalStateException("Map package unavailable (HTTP " + c.getResponseCode() + ").");
            if (!"https".equalsIgnoreCase(c.getURL().getProtocol())) throw new IllegalStateException("Map package redirected to an insecure URL.");
            long contentLength = c.getContentLengthLong(); if (contentLength > 0 && contentLength != expectedBytes) throw new IllegalStateException("Map package size does not match its manifest.");
            MessageDigest digest = MessageDigest.getInstance("SHA-256"); long count = 0;
            try (InputStream in = new BufferedInputStream(c.getInputStream()); OutputStream out = new FileOutputStream(destination)) {
                byte[] b = new byte[64 * 1024]; int n;
                while ((n=in.read(b))!=-1) { out.write(b,0,n); digest.update(b,0,n); count += n; JSObject progress = new JSObject(); progress.put("bytesDownloaded", count); progress.put("bytesTotal", expectedBytes); progress.put("percent", Math.min(99, (int)(count * 100 / expectedBytes))); notifyListeners("downloadProgress", progress); }
            }
            StringBuilder hash = new StringBuilder(); for (byte v : digest.digest()) hash.append(String.format(Locale.ROOT, "%02x", v));
            if (count != expectedBytes || !hash.toString().equals(expectedHash)) throw new IllegalStateException("Map package failed size or SHA-256 verification.");
        } finally { c.disconnect(); }
    }
    private static String readText(File file) throws Exception { byte[] b = new byte[(int)file.length()]; try (FileInputStream in = new FileInputStream(file)) { int offset=0,n; while(offset<b.length && (n=in.read(b,offset,b.length-offset))>0) offset+=n; } return new String(b, java.nio.charset.StandardCharsets.UTF_8); }
    private static void writeText(File file, String value) throws Exception { try (FileOutputStream out = new FileOutputStream(file)) { out.write(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)); out.getFD().sync(); } }
}
