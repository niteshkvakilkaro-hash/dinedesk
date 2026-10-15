package com.dinedesk.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * A delivery rider's location while on duty: a foreground service of type "location", started by the
 * rider screen (window.DineDeskAndroid.startLocationSharing) while the app is on screen, so it needs
 * no background-location permission. Every interval it takes the best recent position from the GPS
 * and network providers (android.location only: no Google Play services), queues it (kept in
 * SharedPreferences, at most 500) and uploads the queue in batches of 50 straight to the API with the
 * rider's upload-only token. Web side: frontend/src/features/rider/locationSharing.ts.
 *
 * Not sticky: after the process is killed or the phone restarts it does not come back by itself (it
 * could not show itself from the background anyway, and the token may have ended); the rider opens
 * the app again. Nothing is recorded while it isn't running, and the queue is cleared when it stops.
 */
public class LocationService extends Service {
    static final String PREFS = "dinedesk_rider";
    private static final String K_CONFIG = "config";
    private static final String K_QUEUE = "queue";
    private static final String K_LAST_SENT = "last_sent_at";
    private static final String K_LAST_ERROR = "last_error";
    private static final String CHANNEL = "rider_location";
    private static final int NOTIFICATION_ID = 7301;
    private static final long FIX_WAIT_MS = 20_000;
    private static final long FRESH_MS = 30_000;
    private static final int TIMEOUT_MS = 15_000;

    /** The running service (same process as the app). Read on any thread. */
    private static volatile LocationService instance;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    /** Stop a minute before the token ends, so the last positions still go up. */
    private static final long EXPIRY_MARGIN_MS = 60_000;

    private HandlerThread thread;
    private Handler worker;
    private LocationManager lm;
    private PowerManager.WakeLock wake;
    private Config config;
    private RiderQueue queue;
    private Location best;
    private long lastRecordedFixTime;
    private long lastCaptureElapsed;
    private boolean waitingForFix;
    private volatile boolean stopping;
    private boolean listening;

    /** What startLocationSharing was given. */
    static final class Config {
        final String uploadUrl;
        final String token;
        final int intervalSec;
        final String tenantHost;
        final String locale;
        /** Epoch ms, or -1 when the page gave none. */
        final long expiresAt;
        final String raw;

        Config(JSONObject o) {
            uploadUrl = o.optString("uploadUrl", "");
            token = o.optString("token", "");
            intervalSec = RiderQueue.clampInterval(o.has("intervalSec") ? o.optDouble("intervalSec", 0) : null);
            tenantHost = o.optString("tenantHost", "");
            locale = o.optString("locale", "en");
            expiresAt = o.isNull("expiresAt") ? -1 : RiderQueue.parseIso(o.optString("expiresAt", null));
            raw = o.toString();
        }

        Config withInterval(int sec) throws Exception {
            JSONObject o = new JSONObject(raw);
            o.put("intervalSec", sec);
            return new Config(o);
        }

        boolean expired() {
            return expiresAt > 0 && System.currentTimeMillis() >= expiresAt;
        }

        boolean endsSoon() {
            return expiresAt > 0 && System.currentTimeMillis() >= expiresAt - EXPIRY_MARGIN_MS;
        }

        /** The rider screen on the business's host, for the notification. */
        String riderPage() {
            Uri u = Uri.parse(uploadUrl);
            String host = tenantHost.isEmpty() ? u.getAuthority() : tenantHost;
            return u.getScheme() + "://" + host + "/rider/";
        }
    }

    // ---- Called from the app (MainActivity's bridge) --------------------------------------

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    static boolean isRunning() {
        LocationService s = instance;
        return s != null && !s.stopping;
    }

    /** Starts the service, or gives the running one the new settings (a new duty, a new token). */
    static void start(Context c, String configJson) {
        start(c.getApplicationContext(), configJson, 0);
    }

    private static void start(Context c, String configJson, int attempt) {
        LocationService old = instance;
        if (old != null && old.stopping) {
            // The last duty is still being wound up (its last upload): start once it is gone.
            if (attempt < 40) MAIN.postDelayed(() -> start(c, configJson, attempt + 1), 250);
            else noteError(c, "start_failed");
            return;
        }
        SharedPreferences p = prefs(c);
        if (!isRunning()) {
            // A fresh start: nothing left over from an earlier duty.
            p.edit().remove(K_QUEUE).remove(K_LAST_ERROR).commit();
        }
        p.edit().putString(K_CONFIG, configJson).commit();
        LocationService s = instance;
        if (s != null && !s.stopping) {
            s.worker.post(s::reload);
            return;
        }
        Intent i = new Intent(c, LocationService.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
            else c.startService(i);
        } catch (RuntimeException e) {
            // Android 12+ refuses a foreground service started while the app isn't on screen.
            p.edit().remove(K_CONFIG).apply();
            noteError(c, "start_failed");
            if (attempt == 0) throw e;
        }
    }

    /** Sends what is queued once, then stops. */
    static void stop(Context c) {
        LocationService s = instance;
        if (s != null && !s.stopping) {
            s.stopping = true;
            s.worker.post(() -> s.finish(true));
        } else {
            clearLeftovers(c);
        }
    }

    static void sendNow() {
        LocationService s = instance;
        if (s != null && !s.stopping) s.worker.post(s::captureSoon);
    }

    /** Called when the app opens: a queue or token left by a killed process is not kept. */
    static void clearLeftovers(Context c) {
        if (isRunning()) return;
        prefs(c).edit().remove(K_QUEUE).remove(K_CONFIG).apply();
    }

    /** lastError for locationSharingStatus; null clears it. */
    static void noteError(Context c, String error) {
        if (error == null) prefs(c).edit().remove(K_LAST_ERROR).apply();
        else prefs(c).edit().putString(K_LAST_ERROR, error).apply();
    }

    /** { running, lastSentAt, lastError, queued } */
    static String status(Context c) {
        SharedPreferences p = prefs(c);
        LocationService s = instance;
        int queued = 0;
        if (s != null && s.queue != null) queued = s.queue.size();
        else queued = RiderQueue.parse(p.getString(K_QUEUE, null)).size();
        try {
            JSONObject o = new JSONObject();
            o.put("running", isRunning());
            o.put("lastSentAt", p.contains(K_LAST_SENT) ? p.getString(K_LAST_SENT, null) : JSONObject.NULL);
            o.put("lastError", p.contains(K_LAST_ERROR) ? p.getString(K_LAST_ERROR, null) : JSONObject.NULL);
            o.put("queued", queued);
            return o.toString();
        } catch (Exception e) {
            return "{\"running\":false,\"lastSentAt\":null,\"lastError\":null,\"queued\":0}";
        }
    }

    // ---- Service ---------------------------------------------------------------------------

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "DineDesk:riderLocation");
        wake.setReferenceCounted(false);
        thread = new HandlerThread("rider-location");
        thread.start();
        worker = new Handler(thread.getLooper());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Within 5 s of startForegroundService, and before any location is taken.
        try {
            Notification n = notification();
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            else startForeground(NOTIFICATION_ID, n);
        } catch (RuntimeException e) {
            // Android 14+: no location permission, or started from the background.
            noteError(this, "denied");
            stopping = true;
            stopSelf();
            return START_NOT_STICKY;
        }
        worker.post(this::reload);
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        stopping = true;
        if (instance == this) instance = null;
        stopListening();
        if (worker != null) worker.removeCallbacksAndMessages(null);
        if (thread != null) thread.quitSafely();
        if (wake != null && wake.isHeld()) wake.release();
        super.onDestroy();
    }

    /** The app was swiped away: the service goes on (that is its point); stop() ends it. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
    }

    private Notification notification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Location while on duty", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Shown while DineDesk shares your location with the restaurant during a delivery shift.");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(this, MainActivity.class);
        open.setAction(MainActivity.ACTION_OPEN_RIDER);
        String page = riderPageFromPrefs();
        if (page != null) open.putExtra(MainActivity.EXTRA_URL, page);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : legacyBuilder();
        b.setSmallIcon(R.drawable.ic_stat_location)
                .setContentTitle("DineDesk — sharing your location while on duty")
                .setContentText("Tap to open the rider screen. End duty there to stop.")
                .setContentIntent(pi)
                .setOngoing(true)
                .setShowWhen(false)
                .setColor(getColor(R.color.brand))
                .setCategory(Notification.CATEGORY_SERVICE);
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        return b.build();
    }

    @SuppressWarnings("deprecation")
    private Notification.Builder legacyBuilder() {
        return new Notification.Builder(this).setPriority(Notification.PRIORITY_LOW);
    }

    private String riderPageFromPrefs() {
        try {
            String raw = prefs(this).getString(K_CONFIG, null);
            return raw == null ? null : new Config(new JSONObject(raw)).riderPage();
        } catch (Exception e) {
            return null;
        }
    }

    // ---- On the worker thread --------------------------------------------------------------

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (stopping) return;
            captureSoon();
            schedule();
        }
    };

    private final Runnable fixTimeout = () -> {
        if (!waitingForFix) return;
        waitingForFix = false;
        recordBestAndFlush();
    };

    private final Runnable expire = () -> {
        if (stopping || config == null || !config.endsSoon()) return;
        noteError(this, "unauthorized");
        stopping = true;
        finish(true);
    };

    /** (Re)reads the settings: first start, a new token, or a new interval. */
    private void reload() {
        if (stopping) return;
        Config c;
        try {
            String raw = prefs(this).getString(K_CONFIG, null);
            c = raw == null ? null : new Config(new JSONObject(raw));
        } catch (Exception e) {
            c = null;
        }
        if (c == null || c.token.isEmpty() || c.uploadUrl.isEmpty()) {
            noteError(this, "start_failed");
            stopping = true;
            finish(false);
            return;
        }
        if (c.expired()) {
            noteError(this, "unauthorized");
            stopping = true;
            finish(false);
            return;
        }
        boolean intervalChanged = config == null || config.intervalSec != c.intervalSec;
        config = c;
        if (queue == null) queue = RiderQueue.parse(prefs(this).getString(K_QUEUE, null));
        worker.removeCallbacks(expire);
        if (c.expiresAt > 0) worker.postDelayed(expire, Math.max(0, c.expiresAt - EXPIRY_MARGIN_MS - System.currentTimeMillis()));
        if (!listening || intervalChanged) startListening();
        if (!listening) {
            // No provider on: nothing to share.
            noteError(this, "position");
        }
        schedule();
        // The first position right away (duty start).
        captureSoon();
    }

    private void schedule() {
        worker.removeCallbacks(tick);
        if (!stopping && config != null) worker.postDelayed(tick, config.intervalSec * 1000L);
    }

    private final LocationListener listener = new LocationListener() {
        @Override
        public void onLocationChanged(Location l) {
            if (stopping || l == null) return;
            if (isBetter(l, best)) best = l;
            if (waitingForFix && SystemClock.elapsedRealtime() - ageBase(l) < FRESH_MS) {
                waitingForFix = false;
                worker.removeCallbacks(fixTimeout);
                recordBestAndFlush();
            } else if (config != null && SystemClock.elapsedRealtime() - lastCaptureElapsed >= config.intervalSec * 1000L - 5_000) {
                // The Handler's clock stops while the phone sleeps; a delivered position wakes it, so
                // positions also drive the interval.
                captureSoon();
                schedule();
            }
        }

        @Override
        public void onStatusChanged(String provider, int status, Bundle extras) {
        }

        @Override
        public void onProviderEnabled(String provider) {
            // GPS (or network location) switched on during the shift: listen to it too.
            if (!stopping && config != null) startListening();
        }

        @Override
        public void onProviderDisabled(String provider) {
        }
    };

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @SuppressWarnings("MissingPermission")
    private void startListening() {
        stopListening();
        if (!hasLocationPermission()) {
            noteError(this, "denied");
            return;
        }
        long minTime = config.intervalSec * 1000L;
        boolean fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        for (String provider : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER}) {
            try {
                if (provider.equals(LocationManager.GPS_PROVIDER) && !fine) continue;
                if (lm.getAllProviders().contains(provider) && lm.isProviderEnabled(provider)) {
                    lm.requestLocationUpdates(provider, minTime, 0f, listener, thread.getLooper());
                    listening = true;
                    Location last = lm.getLastKnownLocation(provider);
                    if (last != null && isBetter(last, best)) best = last;
                }
            } catch (RuntimeException ignored) {
                // A provider missing on this phone, or the permission just taken away.
            }
        }
    }

    private void stopListening() {
        if (lm != null) {
            try {
                lm.removeUpdates(listener);
            } catch (RuntimeException ignored) {
            }
        }
        listening = false;
    }

    /** A position now: the best one if it is fresh, else waits up to 20 s for a new one. */
    private void captureSoon() {
        if (stopping || config == null) return;
        if (config.endsSoon()) {
            expire.run();
            return;
        }
        if (!listening) startListening();
        lastCaptureElapsed = SystemClock.elapsedRealtime();
        if (best != null && SystemClock.elapsedRealtime() - ageBase(best) < FRESH_MS) {
            recordBestAndFlush();
            return;
        }
        if (waitingForFix) return;
        waitingForFix = true;
        hold(FIX_WAIT_MS + 2 * TIMEOUT_MS);
        worker.postDelayed(fixTimeout, FIX_WAIT_MS);
    }

    private static long ageBase(Location l) {
        return l.getElapsedRealtimeNanos() / 1_000_000L;
    }

    private void recordBestAndFlush() {
        if (stopping) return;
        hold(4 * TIMEOUT_MS);
        Location l = best;
        // A position older than two intervals (at least 10 minutes) says nothing about now.
        long maxAge = Math.max(600_000L, 2000L * config.intervalSec);
        boolean usable = l != null && SystemClock.elapsedRealtime() - ageBase(l) <= maxAge;
        if (usable && l.getTime() != lastRecordedFixTime) {
            lastRecordedFixTime = l.getTime();
            queue.add(point(l));
            save();
        }
        flush();
        if (!usable && !stopping) noteError(this, hasLocationPermission() ? "position" : "denied");
        release();
    }

    private String point(Location l) {
        try {
            JSONObject p = new JSONObject();
            p.put("lat", l.getLatitude());
            p.put("lng", l.getLongitude());
            p.put("accuracy_m", l.hasAccuracy() ? Math.min(100000, Math.round(l.getAccuracy())) : JSONObject.NULL);
            p.put("speed", l.hasSpeed() ? Math.min(200.0, Math.max(0.0, round1(l.getSpeed()))) : JSONObject.NULL);
            p.put("heading", l.hasBearing() ? Math.min(360.0, Math.max(0.0, round1(l.getBearing()))) : JSONObject.NULL);
            int battery = battery();
            p.put("battery", battery >= 0 ? battery : JSONObject.NULL);
            // The position's own time, unless the phone's clock and the fix disagree (then now).
            long t = l.getTime();
            long now = System.currentTimeMillis();
            if (t <= 0 || t > now + 60_000 || t < now - 12 * 3600_000L) t = now;
            p.put("recorded_at", RiderQueue.iso(t));
            return p.toString();
        } catch (Exception e) {
            return null;
        }
    }

    private static double round1(float v) {
        return Math.round(v * 10.0) / 10.0;
    }

    private int battery() {
        try {
            BatteryManager bm = (BatteryManager) getSystemService(Context.BATTERY_SERVICE);
            int v = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
            return v >= 0 && v <= 100 ? v : -1;
        } catch (RuntimeException e) {
            return -1;
        }
    }

    /** Newer wins unless an older one from the last 30 s is clearly more accurate. */
    private static boolean isBetter(Location l, Location current) {
        if (current == null) return true;
        long dt = l.getElapsedRealtimeNanos() / 1_000_000L - current.getElapsedRealtimeNanos() / 1_000_000L;
        if (dt > FRESH_MS) return true;
        if (dt < -FRESH_MS) return false;
        float a = l.hasAccuracy() ? l.getAccuracy() : Float.MAX_VALUE;
        float b = current.hasAccuracy() ? current.getAccuracy() : Float.MAX_VALUE;
        if (dt >= 0) return a <= b * 1.5f;
        return a < b;
    }

    private void save() {
        prefs(this).edit().putString(K_QUEUE, queue.serialize()).commit();
    }

    /** Uploads the queue, batch by batch, until it is empty or an answer says stop / try later. */
    private void flush() {
        if (config == null || queue == null) return;
        for (int round = 0; round < 12 && !queue.isEmpty(); round++) {
            List<String> batch = queue.batch();
            RiderQueue.Decision d = upload(batch);
            if (d.queue == RiderQueue.QueueAction.DROP_BATCH) queue.dropFirst(batch.size());
            else if (d.queue == RiderQueue.QueueAction.CLEAR) queue.clear();
            save();
            SharedPreferences.Editor e = prefs(this).edit();
            if (d.sent) e.putString(K_LAST_SENT, RiderQueue.iso(System.currentTimeMillis()));
            if (d.error == null) e.remove(K_LAST_ERROR);
            else e.putString(K_LAST_ERROR, d.error);
            e.apply();
            if (d.intervalSec > 0 && d.intervalSec != config.intervalSec && !d.stop && !stopping) {
                try {
                    config = config.withInterval(d.intervalSec);
                    prefs(this).edit().putString(K_CONFIG, config.raw).apply();
                    startListening();
                    schedule();
                } catch (Exception ignored) {
                }
            }
            if (d.stop) {
                if (!stopping) {
                    stopping = true;
                    finish(false);
                }
                return;
            }
            if (!d.continueFlush()) return;
        }
    }

    private RiderQueue.Decision upload(List<String> batch) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(config.uploadUrl).openConnection();
            c.setConnectTimeout(TIMEOUT_MS);
            c.setReadTimeout(TIMEOUT_MS);
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setUseCaches(false);
            c.setInstanceFollowRedirects(false);
            c.setRequestProperty("Authorization", "Bearer " + config.token);
            c.setRequestProperty("Accept", "application/json");
            c.setRequestProperty("Content-Type", "application/json");
            if (!config.tenantHost.isEmpty()) c.setRequestProperty("X-Tenant-Host", config.tenantHost);
            if (!config.locale.isEmpty()) c.setRequestProperty("X-Locale", config.locale);
            c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android " + Build.VERSION.RELEASE + ") DineDeskApp/1 RiderLocation");
            byte[] body = RiderQueue.body(batch).getBytes(StandardCharsets.UTF_8);
            c.setFixedLengthStreamingMode(body.length);
            try (OutputStream out = c.getOutputStream()) {
                out.write(body);
            }
            int status = c.getResponseCode();
            String text = read(status >= 400 ? c.getErrorStream() : c.getInputStream());
            JSONObject json = null;
            try {
                json = text.isEmpty() ? null : new JSONObject(text);
            } catch (Exception ignored) {
            }
            Boolean onDuty = null;
            Integer interval = null;
            String code = null;
            if (json != null) {
                JSONObject data = json.optJSONObject("data");
                if (data != null) {
                    if (data.has("on_duty") && !data.isNull("on_duty")) onDuty = data.optBoolean("on_duty", true);
                    if (data.has("interval_sec") && !data.isNull("interval_sec")) interval = data.optInt("interval_sec", 0);
                }
                JSONObject meta = json.optJSONObject("meta");
                if (meta != null && !meta.isNull("code")) code = meta.optString("code", null);
            }
            return RiderQueue.decide(status, code, onDuty, interval);
        } catch (Exception e) {
            return RiderQueue.decide(0, null, null, null);
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static String read(InputStream in) {
        if (in == null) return "";
        try (InputStream i = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            for (int n; (n = i.read(buf)) > 0 && out.size() < 65536; ) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } catch (Exception e) {
            return "";
        }
    }

    /** Stops: optionally one last upload, then the queue and token are wiped. */
    private void finish(boolean flushFirst) {
        worker.removeCallbacks(tick);
        worker.removeCallbacks(fixTimeout);
        worker.removeCallbacks(expire);
        waitingForFix = false;
        stopListening();
        if (flushFirst && config != null && queue != null && !queue.isEmpty() && !config.expired()) {
            hold(4 * TIMEOUT_MS);
            // stopping is already set; flush() only uploads.
            flush();
        }
        if (queue != null) queue.clear();
        prefs(this).edit().remove(K_QUEUE).remove(K_CONFIG).commit();
        config = null;
        best = null;
        release();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void hold(long ms) {
        try {
            wake.acquire(ms);
        } catch (RuntimeException ignored) {
        }
    }

    private void release() {
        try {
            if (wake.isHeld()) wake.release();
        } catch (RuntimeException ignored) {
        }
    }
}
