package com.dinedesk.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Insets;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.ViewTreeObserver;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * DineDesk: one app for guests and businesses. Opens <platform host>/app full-screen and keeps the
 * platform host and its business subdomains inside the app; everything else (other websites, phone,
 * mail, WhatsApp, UPI, maps) opens in the phone's own apps.
 *
 * Pages get window.DineDeskAndroid (Bridge below) for what a WebView can't do by itself: printing
 * and saving blob: downloads. The web side is frontend/src/lib/dinedeskApp.ts and print.ts.
 */
public class MainActivity extends Activity {
    private static final int REQ_FILE = 41;
    private static final int REQ_PERM_UPLOAD = 51;
    private static final int REQ_PERM_CAMERA = 52;
    private static final int REQ_PERM_LOCATION = 53;
    private static final int REQ_PERM_RIDER = 54;
    private static final int REQ_PERM_NOTIFY = 55;
    /** The on-duty notification: open the rider screen (EXTRA_URL). */
    static final String ACTION_OPEN_RIDER = "com.dinedesk.app.OPEN_RIDER";
    static final String EXTRA_URL = "url";
    private static final String PREFS = "dinedesk";
    private static final String PREF_ALLOWED = "allowed_hosts";
    private static final Pattern HOST = Pattern.compile("^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$");

    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView web;
    private String[] appHosts;
    /** Businesses' own domains confirmed by the web app (allowHost), kept across launches. */
    private final Set<String> allowedHosts = new HashSet<>();
    /** Host of the page on screen: the bridge only serves DineDesk pages. */
    private volatile boolean trustedPage;
    private volatile String pageUrl = "";
    private boolean ready;
    private long lastBack;

    private ValueCallback<Uri[]> pendingUpload;
    private WebChromeClient.FileChooserParams pendingParams;
    private Uri cameraUri;
    private File cameraFile;
    private PermissionRequest pendingWebPermission;
    private String pendingGeoOrigin;
    /** startLocationSharing's settings while Android asks the rider for location. */
    private String pendingRiderConfig;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private final List<WebView> printing = new ArrayList<>();
    private final Map<String, Incoming> incoming = new HashMap<>();

    private static class Incoming {
        final File file;
        final String name;
        final String mime;

        Incoming(File file, String name, String mime) {
            this.file = file;
            this.name = name;
            this.mime = mime;
        }
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        appHosts = BuildConfig.APP_HOSTS.toLowerCase(Locale.ROOT).split(",");
        allowedHosts.addAll(getSharedPreferences(PREFS, MODE_PRIVATE).getStringSet(PREF_ALLOWED, new HashSet<>()));

        int brand = getColor(R.color.brand);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(brand);
        web = new WebView(this);
        // Dark like the /app start screen until the first page is drawn (no white flash).
        web.setBackgroundColor(brand);
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 35) {
            // Android 15 draws apps edge to edge: keep the page clear of the status bar, navigation bar and keyboard.
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(i.left, i.top, i.right, i.bottom);
                return WindowInsets.CONSUMED;
            });
        }
        holdSplash(root);

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEV);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setSupportMultipleWindows(false);
        // Dev pages are plain http; production is https only.
        s.setMixedContentMode(BuildConfig.DEV ? WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE : WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " DineDeskApp/1");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new Bridge(), "DineDeskAndroid");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.setDownloadListener((url, ua, disposition, mime, length) -> download(url, ua, disposition, mime));

        // Positions or a token left behind by a killed process are not kept (the service isn't running).
        LocationService.clearLeftovers(this);
        String rider = riderUrl(getIntent());
        if (state != null && web.restoreState(state) != null) {
            if (rider != null) web.loadUrl(rider);
            return;
        }
        web.loadUrl(rider != null ? rider : BuildConfig.START_URL);
    }

    /** The rider screen from the on-duty notification, when it is a DineDesk page. */
    private String riderUrl(Intent intent) {
        if (intent == null || !ACTION_OPEN_RIDER.equals(intent.getAction())) return null;
        String url = intent.getStringExtra(EXTRA_URL);
        return url != null && isAppHost(Uri.parse(url)) ? url : null;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String rider = riderUrl(intent);
        // Already on the rider screen: just show the app as it is.
        String path = Uri.parse(pageUrl).getPath();
        if (rider != null && web != null && (path == null || !path.startsWith("/rider"))) web.loadUrl(rider);
    }

    /** Keeps the splash screen (Android 12+) or launch background up until the first page draws, at most 3 s. */
    private void holdSplash(View content) {
        main.postDelayed(() -> ready = true, 3000);
        content.getViewTreeObserver().addOnPreDrawListener(new ViewTreeObserver.OnPreDrawListener() {
            @Override
            public boolean onPreDraw() {
                if (!ready) return false;
                content.getViewTreeObserver().removeOnPreDrawListener(this);
                return true;
            }
        });
    }

    // ---- Where links open ------------------------------------------------------------------

    /** The platform host or one of its subdomains, or a business's own domain confirmed by the web app. */
    private boolean isAppHost(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        if (host.isEmpty() || !(scheme.equals("http") || scheme.equals("https"))) return false;
        if (!BuildConfig.DEV && !scheme.equals("https")) return false;
        for (String base : appHosts) {
            if (!base.isEmpty() && (host.equals(base) || host.endsWith("." + base))) return true;
        }
        return scheme.equals("https") && allowedHosts.contains(host);
    }

    private void trackPage(String url) {
        pageUrl = url == null ? "" : url;
        trustedPage = url != null && isAppHost(Uri.parse(url));
    }

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if (!request.isForMainFrame()) {
                // Embedded frames (a map on a business's page) load normally; other schemes from frames need a tap.
                if (scheme.startsWith("http") || scheme.equals("about") || scheme.equals("data") || scheme.equals("blob")) return false;
                if (request.hasGesture()) openExternal(uri);
                return true;
            }
            if (isAppHost(uri)) return false;
            openExternal(uri);
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            trackPage(url);
        }

        @Override
        public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            trackPage(url);
        }

        @Override
        public void onPageCommitVisible(WebView view, String url) {
            ready = true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            ready = true;
            view.setBackgroundColor(Color.WHITE);
            CookieManager.getInstance().flush();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) showOffline(request.getUrl().toString());
        }
    }

    /** Phone, mail, WhatsApp, UPI, maps, intent: links and other websites: the phone's own apps. */
    private void openExternal(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        try {
            Intent i;
            if (scheme.equals("intent")) {
                i = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                // Never let a page start a private component of another app.
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                i.setComponent(null);
                i.setSelector(null);
                if (i.resolveActivity(getPackageManager()) == null) {
                    String fallback = i.getStringExtra("browser_fallback_url");
                    if (fallback != null && (fallback.startsWith("https://") || fallback.startsWith("http://"))) {
                        Uri f = Uri.parse(fallback);
                        if (isAppHost(f)) web.loadUrl(fallback);
                        else openExternal(f);
                        return;
                    }
                }
            } else if (scheme.equals("mailto")) {
                i = new Intent(Intent.ACTION_SENDTO, uri);
            } else if (scheme.equals("tel")) {
                i = new Intent(Intent.ACTION_DIAL, uri);
            } else {
                // upi://pay opens the phone's UPI apps (GPay, PhonePe, Paytm…), wa.me opens WhatsApp,
                // Google Maps links the Maps app, other https sites the browser.
                i = new Intent(Intent.ACTION_VIEW, uri);
                if (scheme.equals("http") || scheme.equals("https")) i.addCategory(Intent.CATEGORY_BROWSABLE);
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            toast(scheme.equals("upi") ? "No UPI app on this phone. Install GPay, PhonePe or Paytm." : "No app on this phone can open that link.");
        }
    }

    private void showOffline(String failedUrl) {
        String retry = JSONObject.quote(failedUrl == null || failedUrl.startsWith("data:") ? BuildConfig.START_URL : failedUrl);
        String html = "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>"
                + "<body style='margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;"
                + "font-family:sans-serif;padding:32px;box-sizing:border-box;text-align:center;background:#14110f;color:#fbf8f3'>"
                + "<div style='font-size:44px'>&#128246;</div>"
                + "<h2 style='margin:16px 0 8px'>No internet</h2>"
                + "<p style='opacity:.7;margin:0'>Check your connection and try again.</p>"
                + (BuildConfig.DEV ? "<p style='opacity:.5;font-size:13px'>Dev build: keep the PC running DineDesk on and this phone on the same Wi-Fi.<br>" + BuildConfig.START_URL + "</p>" : "")
                + "<button style='margin-top:24px;padding:14px 32px;border:0;border-radius:28px;background:#f2b544;color:#14110f;font-weight:700;font-size:16px'"
                + " onclick='location.replace(" + retry.replace("'", "&#39;") + ")'>Retry</button>"
                + "</body></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    // ---- Uploads, camera, location ---------------------------------------------------------

    private boolean granted(String permission) {
        return checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private static boolean acceptsImages(WebChromeClient.FileChooserParams params) {
        String[] types = params.getAcceptTypes();
        if (types == null || types.length == 0) return true;
        for (String t : types) {
            for (String one : t.split(",")) {
                String x = one.trim().toLowerCase(Locale.ROOT);
                if (x.isEmpty() || x.equals("*/*") || x.startsWith("image/") || x.matches("\\.(jpe?g|png|webp|heic|gif)")) return true;
            }
        }
        return false;
    }

    /** accept="image/*,application/pdf,.csv" → MIME types for the picker. */
    private static String[] mimeTypes(WebChromeClient.FileChooserParams params) {
        Set<String> out = new LinkedHashSet<>();
        String[] types = params.getAcceptTypes();
        if (types != null) {
            for (String t : types) {
                for (String one : t.split(",")) {
                    String x = one.trim().toLowerCase(Locale.ROOT);
                    if (x.isEmpty()) continue;
                    if (x.startsWith(".")) {
                        String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(x.substring(1));
                        if (m != null) out.add(m);
                        else return new String[0];
                    } else if (x.contains("/")) out.add(x);
                }
            }
        }
        return out.toArray(new String[0]);
    }

    private void openChooser() {
        WebChromeClient.FileChooserParams params = pendingParams;
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        String[] mimes = mimeTypes(params);
        if (mimes.length == 1) pick.setType(mimes[0]);
        else {
            pick.setType("*/*");
            if (mimes.length > 1) pick.putExtra(Intent.EXTRA_MIME_TYPES, mimes);
        }
        if (params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

        Intent camera = null;
        cameraUri = null;
        cameraFile = null;
        if (acceptsImages(params) && granted(Manifest.permission.CAMERA)) {
            try {
                File dir = AppFiles.root(this, AppFiles.CAMERA);
                if (dir.isDirectory() || dir.mkdirs()) {
                    cameraFile = new File(dir, "photo-" + System.currentTimeMillis() + ".jpg");
                    cameraUri = AppFiles.uriFor(this, AppFiles.CAMERA, cameraFile);
                    camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                    camera.setClipData(ClipData.newRawUri("photo", cameraUri));
                    camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    if (camera.resolveActivity(getPackageManager()) == null) camera = null;
                }
            } catch (Exception e) {
                camera = null;
            }
        }
        try {
            if (camera != null && params.isCaptureEnabled()) {
                // <input capture>: straight to the camera.
                startActivityForResult(camera, REQ_FILE);
            } else {
                Intent chooser = Intent.createChooser(pick, params.getTitle());
                if (camera != null) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
                startActivityForResult(chooser, REQ_FILE);
            }
        } catch (Exception e) {
            finishUpload(null);
            toast("No app on this phone can pick a file.");
        }
    }

    private void finishUpload(Uri[] result) {
        if (pendingUpload != null) pendingUpload.onReceiveValue(result);
        pendingUpload = null;
        pendingParams = null;
    }

    private class Chrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (pendingUpload != null) pendingUpload.onReceiveValue(null);
            pendingUpload = callback;
            pendingParams = params;
            // Offer the camera next to the files when the page takes photos.
            if (acceptsImages(params) && !granted(Manifest.permission.CAMERA)) {
                requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_PERM_UPLOAD);
            } else {
                openChooser();
            }
            return true;
        }

        /** getUserMedia (Scan QR): the camera only, only for DineDesk pages. */
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            main.post(() -> {
                boolean wantsVideo = false;
                for (String r : request.getResources()) if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) wantsVideo = true;
                if (!wantsVideo || !isAppHost(request.getOrigin())) {
                    request.deny();
                    return;
                }
                if (granted(Manifest.permission.CAMERA)) {
                    request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                } else {
                    if (pendingWebPermission != null) pendingWebPermission.deny();
                    pendingWebPermission = request;
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_PERM_CAMERA);
                }
            });
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest request) {
            if (pendingWebPermission == request) pendingWebPermission = null;
        }

        /** navigator.geolocation ("Use my location"), only for DineDesk pages. */
        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (!isAppHost(Uri.parse(origin))) {
                callback.invoke(origin, false, false);
                return;
            }
            if (granted(Manifest.permission.ACCESS_FINE_LOCATION) || granted(Manifest.permission.ACCESS_COARSE_LOCATION)) {
                callback.invoke(origin, true, false);
                return;
            }
            pendingGeoOrigin = origin;
            pendingGeoCallback = callback;
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_PERM_LOCATION);
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        boolean any = false;
        for (int r : results) any |= r == PackageManager.PERMISSION_GRANTED;
        if (code == REQ_PERM_UPLOAD) {
            if (pendingUpload != null) openChooser();
        } else if (code == REQ_PERM_CAMERA && pendingWebPermission != null) {
            if (any) pendingWebPermission.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            else pendingWebPermission.deny();
            pendingWebPermission = null;
        } else if (code == REQ_PERM_RIDER) {
            String config = pendingRiderConfig;
            pendingRiderConfig = null;
            if (config == null) return;
            if (granted(Manifest.permission.ACCESS_FINE_LOCATION) || granted(Manifest.permission.ACCESS_COARSE_LOCATION)) {
                startRiderService(config);
            } else {
                LocationService.noteError(this, "denied");
                toast("Allow Location for DineDesk (Settings → Apps → DineDesk → Permissions) to share it while on duty.");
            }
        } else if (code == REQ_PERM_LOCATION && pendingGeoCallback != null) {
            pendingGeoCallback.invoke(pendingGeoOrigin, any, false);
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        if (request != REQ_FILE) {
            super.onActivityResult(request, result, data);
            return;
        }
        Uri[] out = null;
        if (result == RESULT_OK) {
            List<Uri> uris = new ArrayList<>();
            if (data != null && data.getClipData() != null) {
                ClipData clip = data.getClipData();
                for (int i = 0; i < clip.getItemCount(); i++) {
                    Uri u = clip.getItemAt(i).getUri();
                    if (u != null && !u.equals(cameraUri)) uris.add(u);
                }
            }
            if (uris.isEmpty() && data != null && data.getData() != null && !data.getData().equals(cameraUri)) uris.add(data.getData());
            if (uris.isEmpty() && cameraFile != null && cameraFile.length() > 0) uris.add(cameraUri);
            if (!uris.isEmpty()) out = uris.toArray(new Uri[0]);
        }
        finishUpload(out);
    }

    // ---- Downloads -------------------------------------------------------------------------

    private void download(String url, String ua, String disposition, String mime) {
        String name = URLUtil.guessFileName(url, disposition, mime);
        try {
            if (url.startsWith("blob:")) {
                // The web app saves its own files through saveBlob; this catches any other blob link.
                if (!trustedPage) return;
                web.evaluateJavascript("(function(u,n){fetch(u).then(function(r){return r.blob()}).then(function(b){"
                        + "var B=window.DineDeskAndroid,id=B.saveBegin(n,b.type||'application/octet-stream'),at=0,S=393216;"
                        + "(function next(){if(at>=b.size){B.saveEnd(id,false);return;}"
                        + "b.slice(at,at+S).arrayBuffer().then(function(ab){var a=new Uint8Array(ab),s='';"
                        + "for(var i=0;i<a.length;i+=32768)s+=String.fromCharCode.apply(null,a.subarray(i,i+32768));"
                        + "B.saveChunk(id,btoa(s));at+=S;next();});})();});})("
                        + JSONObject.quote(url) + "," + JSONObject.quote(name) + ")", null);
            } else if (url.startsWith("data:")) {
                int comma = url.indexOf(',');
                String meta = url.substring(5, Math.max(5, comma));
                String type = meta.split(";")[0].isEmpty() ? "application/octet-stream" : meta.split(";")[0];
                byte[] bytes = meta.endsWith(";base64") ? Base64.decode(url.substring(comma + 1), Base64.DEFAULT) : Uri.decode(url.substring(comma + 1)).getBytes("UTF-8");
                String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(type);
                File tmp = File.createTempFile("dl", null, getCacheDir());
                try (OutputStream o = new FileOutputStream(tmp)) {
                    o.write(bytes);
                }
                publish(tmp, "download-" + System.currentTimeMillis() + (ext != null ? "." + ext : ""), type, false);
            } else if (url.startsWith("http://") || url.startsWith("https://")) {
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null) r.addRequestHeader("Cookie", cookies);
                r.addRequestHeader("User-Agent", ua);
                r.setMimeType(mime);
                r.setTitle(name);
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                if (Build.VERSION.SDK_INT >= 29) r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                else r.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, name);
                ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(r);
                toast("Downloading " + name);
            }
        } catch (Exception e) {
            toast("Could not download the file.");
        }
    }

    /** Moves a finished file to Downloads (Android 10+: the shared Downloads folder) and opens it when asked. */
    private boolean publish(File tmp, String name, String mime, boolean open) {
        String safe = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (safe.isEmpty() || safe.startsWith(".")) safe = "download" + safe;
        if (safe.length() > 120) safe = safe.substring(safe.length() - 120);
        Uri uri;
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                ContentResolver cr = getContentResolver();
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, safe);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) throw new IllegalStateException();
                try (InputStream in = new FileInputStream(tmp); OutputStream out = cr.openOutputStream(uri)) {
                    copy(in, out);
                }
                v.clear();
                v.put(MediaStore.MediaColumns.IS_PENDING, 0);
                cr.update(uri, v, null, null);
            } else {
                File dir = AppFiles.root(this, AppFiles.FILES);
                if (dir == null || !(dir.isDirectory() || dir.mkdirs())) throw new IllegalStateException();
                File dest = new File(dir, safe);
                for (int n = 1; dest.exists(); n++) {
                    int dot = safe.lastIndexOf('.');
                    dest = new File(dir, dot > 0 ? safe.substring(0, dot) + " (" + n + ")" + safe.substring(dot) : safe + " (" + n + ")");
                }
                try (InputStream in = new FileInputStream(tmp); OutputStream out = new FileOutputStream(dest)) {
                    copy(in, out);
                }
                safe = dest.getName();
                uri = AppFiles.uriFor(this, AppFiles.FILES, dest);
            }
        } catch (Exception e) {
            toast("Could not save the file.");
            return false;
        } finally {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
        }
        final Uri saved = uri;
        final String shown = safe;
        main.post(() -> {
            if (open) {
                Intent view = new Intent(Intent.ACTION_VIEW);
                view.setDataAndType(saved, mime);
                view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    startActivity(view);
                    return;
                } catch (Exception ignored) {
                    // No viewer: it is still in Downloads.
                }
            }
            toast(Build.VERSION.SDK_INT >= 29 ? "Saved to Downloads: " + shown : "Saved: " + shown);
        });
        return true;
    }

    private static void copy(InputStream in, OutputStream out) throws java.io.IOException {
        byte[] buf = new byte[64 * 1024];
        for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
    }

    // ---- Printing --------------------------------------------------------------------------

    private void printFrom(WebView view, String title) {
        PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
        String job = (title == null || title.trim().isEmpty() ? "DineDesk" : title.trim());
        pm.print(job, view.createPrintDocumentAdapter(job), new PrintAttributes.Builder().build());
    }

    /** Thermal slips: the slip's own HTML in an off-screen WebView, printed through the phone's print service. */
    @SuppressLint("SetJavaScriptEnabled")
    private void printHtml(String html, String title) {
        WebView pw = new WebView(this);
        pw.getSettings().setJavaScriptEnabled(false);
        pw.getSettings().setAllowFileAccess(false);
        printing.add(pw);
        pw.setWebViewClient(new WebViewClient() {
            private boolean done;

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (done) return;
                done = true;
                // Let fonts settle, then print. The view is kept until the next print or the app closes.
                main.postDelayed(() -> {
                    printFrom(view, title);
                    while (printing.size() > 3) printing.remove(0).destroy();
                }, 200);
            }
        });
        Uri page = Uri.parse(pageUrl);
        String base = page.getScheme() != null && page.getAuthority() != null ? page.getScheme() + "://" + page.getAuthority() + "/" : null;
        pw.loadDataWithBaseURL(base, html, "text/html", "utf-8", null);
    }

    /**
     * window.DineDeskAndroid. Calls arrive on a background thread; each one checks that the page on
     * screen is a DineDesk page (platform host, its subdomains, or a confirmed business domain).
     */
    private class Bridge {
        @JavascriptInterface
        public void printHtml(String html, String title) {
            if (trustedPage && html != null) main.post(() -> MainActivity.this.printHtml(html, title));
        }

        @JavascriptInterface
        public void printPage(String title) {
            if (trustedPage) main.post(() -> printFrom(web, title));
        }

        @JavascriptInterface
        public String saveBegin(String filename, String mime) {
            if (!trustedPage) return "";
            try {
                String id = UUID.randomUUID().toString();
                File dir = new File(getCacheDir(), "incoming");
                if (!dir.isDirectory() && !dir.mkdirs()) return "";
                synchronized (incoming) {
                    incoming.put(id, new Incoming(new File(dir, id), filename == null ? "download" : filename, mime == null || mime.isEmpty() ? "application/octet-stream" : mime));
                }
                return id;
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public boolean saveChunk(String id, String base64) {
            Incoming in;
            synchronized (incoming) {
                in = incoming.get(id);
            }
            if (in == null || base64 == null) return false;
            try (OutputStream out = new FileOutputStream(in.file, true)) {
                out.write(Base64.decode(base64, Base64.DEFAULT));
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean saveEnd(String id, boolean open) {
            Incoming in;
            synchronized (incoming) {
                in = incoming.remove(id);
            }
            if (in == null || !in.file.exists()) return false;
            String name = in.name;
            // A name without an extension gets one from its type, so viewers know what to open it with.
            if (!name.contains(".")) {
                String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(in.mime);
                if (ext != null) name = name + "." + ext;
            }
            return publish(in.file, name, in.mime, open);
        }

        @JavascriptInterface
        public void allowHost(String host) {
            if (!trustedPage || host == null) return;
            String h = host.trim().toLowerCase(Locale.ROOT);
            if (!HOST.matcher(h).matches()) return;
            main.post(() -> {
                if (!allowedHosts.add(h)) return;
                SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
                prefs.edit().putStringSet(PREF_ALLOWED, new HashSet<>(allowedHosts)).apply();
            });
        }

        /**
         * Rider on duty: json = { uploadUrl, token, intervalSec, tenantHost, locale, expiresAt }.
         * true = started, or Android is asking the rider for location (the service starts when it is
         * allowed; a refusal shows as lastError "denied" in locationSharingStatus). false = it can't
         * start: bad settings, token already ended, or Location is switched off on the phone.
         */
        @JavascriptInterface
        public boolean startLocationSharing(String json) {
            if (!trustedPage || json == null) return false;
            JSONObject o;
            try {
                o = new JSONObject(json);
            } catch (Exception e) {
                LocationService.noteError(MainActivity.this, "start_failed");
                return false;
            }
            String upload = o.optString("uploadUrl", "");
            // The token goes only to DineDesk itself (https in production; the dev PC over http).
            if (o.optString("token", "").isEmpty() || upload.isEmpty() || !isAppHost(Uri.parse(upload))) {
                LocationService.noteError(MainActivity.this, "start_failed");
                return false;
            }
            long expires = o.isNull("expiresAt") ? -1 : RiderQueue.parseIso(o.optString("expiresAt", null));
            if (expires > 0 && expires <= System.currentTimeMillis()) {
                LocationService.noteError(MainActivity.this, "unauthorized");
                return false;
            }
            if (!locationOn()) {
                LocationService.noteError(MainActivity.this, "position");
                toast("Turn on Location on this phone to share it while on duty.");
                return false;
            }
            LocationService.noteError(MainActivity.this, null);
            String config = o.toString();
            boolean hasLocation = granted(Manifest.permission.ACCESS_FINE_LOCATION) || granted(Manifest.permission.ACCESS_COARSE_LOCATION);
            boolean askNotify = Build.VERSION.SDK_INT >= 33 && !granted(Manifest.permission.POST_NOTIFICATIONS);
            if (hasLocation) {
                if (!startRiderService(config)) return false;
                // The notification is optional for the service; ask once so the rider sees it.
                if (askNotify) main.post(() -> requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_PERM_NOTIFY));
                return true;
            }
            List<String> ask = new ArrayList<>();
            ask.add(Manifest.permission.ACCESS_FINE_LOCATION);
            ask.add(Manifest.permission.ACCESS_COARSE_LOCATION);
            if (askNotify) ask.add(Manifest.permission.POST_NOTIFICATIONS);
            main.post(() -> {
                pendingRiderConfig = config;
                requestPermissions(ask.toArray(new String[0]), REQ_PERM_RIDER);
            });
            return true;
        }

        /** Off duty: sends what is queued once, then stops (allowed from any page: it only stops). */
        @JavascriptInterface
        public void stopLocationSharing() {
            main.post(() -> pendingRiderConfig = null);
            LocationService.stop(MainActivity.this);
        }

        /** { running, lastSentAt, lastError, queued } */
        @JavascriptInterface
        public String locationSharingStatus() {
            if (!trustedPage) return "";
            return LocationService.status(MainActivity.this);
        }

        /** One position now (duty start, order picked up / delivered). */
        @JavascriptInterface
        public void sendLocationNow() {
            if (trustedPage) LocationService.sendNow();
        }
    }

    private boolean locationOn() {
        LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return false;
        if (Build.VERSION.SDK_INT >= 28) return lm.isLocationEnabled();
        try {
            return lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (RuntimeException e) {
            return false;
        }
    }

    /** Starts (or updates) the rider's location service; false when Android refuses it. */
    private boolean startRiderService(String config) {
        try {
            LocationService.start(this, config);
            return true;
        } catch (RuntimeException e) {
            // e.g. ForegroundServiceStartNotAllowedException: the app isn't on screen.
            LocationService.noteError(this, "start_failed");
            return false;
        }
    }

    // ---- Lifecycle -------------------------------------------------------------------------

    private void toast(String text) {
        main.post(() -> Toast.makeText(this, text, Toast.LENGTH_SHORT).show());
    }

    /** Back: the page's history; on the start screen (or with no history) press twice to exit. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        Uri now = Uri.parse(pageUrl);
        boolean atStart = "/app".equals(now.getPath()) && isAppHost(now) && now.getHost() != null && now.getHost().equalsIgnoreCase(Uri.parse(BuildConfig.START_URL).getHost());
        if (!atStart && web.canGoBack()) {
            web.goBack();
            return;
        }
        long t = System.currentTimeMillis();
        if (t - lastBack < 2000) {
            super.onBackPressed();
            return;
        }
        lastBack = t;
        Toast.makeText(this, "Press back again to exit", Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onDestroy() {
        for (WebView pw : printing) pw.destroy();
        printing.clear();
        if (web != null) {
            web.setVisibility(View.GONE);
            web.destroy();
        }
        super.onDestroy();
    }
}
