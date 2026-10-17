package com.dinedesk.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import android.util.Log;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

import java.lang.ref.WeakReference;
import java.util.Arrays;

/**
 * App notifications through Firebase Cloud Messaging, for people signed in to the dashboard (new
 * orders, bookings, rider jobs). Firebase is set up by hand from BuildConfig (app/build.gradle reads
 * app/google-services.json at build time; without it FCM_ENABLED is false and all of this does
 * nothing). The web app registers the token with the server (frontend/src/lib/dinedeskApp.ts).
 */
final class Push {
    static final String CHANNEL_ORDERS = "orders";
    static final String CHANNEL_GENERAL = "general";
    /** A tapped notification: open EXTRA_URL (a DineDesk page) in the app. FCM's click_action too. */
    static final String ACTION_OPEN = "com.dinedesk.app.OPEN_PUSH";
    private static final String TAG = "DineDeskPush";
    private static final String PREFS = "dinedesk_push";
    private static final String PREF_TOKEN = "token";
    private static final String PREF_ASKED = "asked";

    private static volatile boolean ready;
    /** The activity on screen, to tell its page about a new token. */
    private static WeakReference<MainActivity> activity = new WeakReference<>(null);

    private Push() {
    }

    /** Application start: notification channels, then Firebase when the build has it. */
    static void init(Context context) {
        createChannels(context);
        if (!BuildConfig.FCM_ENABLED) return;
        try {
            if (FirebaseApp.getApps(context).isEmpty()) {
                FirebaseOptions options = new FirebaseOptions.Builder()
                        .setProjectId(BuildConfig.FCM_PROJECT_ID)
                        .setApplicationId(BuildConfig.FCM_APP_ID)
                        .setApiKey(BuildConfig.FCM_API_KEY)
                        .setGcmSenderId(BuildConfig.FCM_SENDER_ID)
                        .build();
                FirebaseApp.initializeApp(context, options);
            }
            ready = true;
            refreshToken(context);
        } catch (RuntimeException e) {
            ready = false;
            Log.w(TAG, "Firebase could not start: " + e.getMessage());
        }
    }

    static boolean enabled() {
        return BuildConfig.FCM_ENABLED && ready;
    }

    static void attach(MainActivity a) {
        activity = new WeakReference<>(a);
    }

    static void detach(MainActivity a) {
        if (activity.get() == a) activity = new WeakReference<>(null);
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** The token Firebase gave this phone ('' when disabled or not known yet). */
    static String token(Context c) {
        return enabled() ? prefs(c).getString(PREF_TOKEN, "") : "";
    }

    /** Asks Firebase for the token (it arrives later through saveToken). */
    static void refreshToken(Context c) {
        if (!enabled()) return;
        Context app = c.getApplicationContext();
        try {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (task.isSuccessful() && task.getResult() != null && !task.getResult().isEmpty()) saveToken(app, task.getResult());
                else Log.w(TAG, "No Firebase token yet", task.getException());
            });
        } catch (RuntimeException e) {
            Log.w(TAG, "Firebase token: " + e.getMessage());
        }
    }

    /** New (or first) token: kept, and handed to the page on screen, which registers it with the server. */
    static void saveToken(Context c, String token) {
        if (token == null || token.isEmpty()) return;
        prefs(c).edit().putString(PREF_TOKEN, token).apply();
        MainActivity a = activity.get();
        if (a != null) a.pushTokenChanged(token);
    }

    static void markAsked(Context c) {
        prefs(c).edit().putBoolean(PREF_ASKED, true).apply();
    }

    static boolean asked(Context c) {
        return prefs(c).getBoolean(PREF_ASKED, false);
    }

    static boolean permissionGranted(Context c) {
        return Build.VERSION.SDK_INT < 33 || c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    /** granted | denied | default (Android 13+, not asked yet). */
    static String permission(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        boolean on = nm == null || nm.areNotificationsEnabled();
        if (on && permissionGranted(c)) return "granted";
        return Build.VERSION.SDK_INT >= 33 && !permissionGranted(c) && !asked(c) ? "default" : "denied";
    }

    /** For window.DineDeskAndroid.pushStatus(). */
    static String status(Context c) {
        try {
            return new JSONObject()
                    .put("enabled", enabled())
                    .put("permission", permission(c))
                    .put("token", !token(c).isEmpty())
                    .put("version", BuildConfig.VERSION_NAME)
                    .put("flavor", BuildConfig.FLAVOR)
                    .toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    /** "orders" rings (new orders, bookings, rider jobs); "general" for the rest. Made at start so FCM can use them while the app is closed. */
    static void createChannels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel orders = new NotificationChannel(CHANNEL_ORDERS, "New orders and bookings", NotificationManager.IMPORTANCE_HIGH);
        orders.setDescription("Rings for new orders, table and room bookings, and delivery jobs.");
        orders.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
        orders.enableVibration(true);
        orders.enableLights(true);
        NotificationChannel general = new NotificationChannel(CHANNEL_GENERAL, "Other updates", NotificationManager.IMPORTANCE_DEFAULT);
        general.setDescription("Rewards and other news for your business.");
        nm.createNotificationChannels(Arrays.asList(orders, general));
    }

    /** A message that arrived while the app is open (closed: Android shows it from the FCM message itself). */
    @SuppressWarnings("deprecation")
    static void show(Context c, String title, String body, String url, String channel, String tag) {
        if (!permissionGranted(c)) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        String ch = CHANNEL_ORDERS.equals(channel) ? CHANNEL_ORDERS : CHANNEL_GENERAL;
        int id = (tag != null && !tag.isEmpty() ? tag : String.valueOf(System.currentTimeMillis())).hashCode();

        Intent open = new Intent(c, MainActivity.class);
        open.setAction(ACTION_OPEN);
        if (url != null && !url.isEmpty()) open.putExtra(MainActivity.EXTRA_URL, url);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, id, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            b = new Notification.Builder(c, ch);
        } else {
            b = new Notification.Builder(c)
                    .setDefaults(Notification.DEFAULT_ALL)
                    .setPriority(CHANNEL_ORDERS.equals(ch) ? Notification.PRIORITY_HIGH : Notification.PRIORITY_DEFAULT);
        }
        String text = body == null ? "" : body;
        b.setSmallIcon(R.drawable.ic_stat_notify)
                .setColor(c.getColor(R.color.brand))
                .setContentTitle(title == null || title.isEmpty() ? "DineDesk" : title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setAutoCancel(true)
                .setContentIntent(pi)
                .setCategory(CHANNEL_ORDERS.equals(ch) ? Notification.CATEGORY_MESSAGE : Notification.CATEGORY_STATUS);
        try {
            nm.notify(tag, id, b.build());
        } catch (SecurityException e) {
            Log.w(TAG, "Notification not allowed: " + e.getMessage());
        }
    }
}
