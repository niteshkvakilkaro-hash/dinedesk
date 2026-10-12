package com.dinedesk.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

/**
 * Local test app: opens the DineDesk dev server (on the PC, same Wi-Fi) full-screen.
 * Pages of the same site stay in the app; phone numbers, WhatsApp, UPI and other sites open
 * their own apps. For the live domain the Play Store app is a Trusted Web Activity (android/README.md).
 */
public class MainActivity extends Activity {
    private static final int PICK_FILE = 41;

    private WebView web;
    private String home;
    private ValueCallback<Uri[]> pendingUpload;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        home = Uri.parse(BuildConfig.START_URL).getHost();

        Window w = getWindow();
        int brand = Color.parseColor(BuildConfig.THEME_COLOR);
        w.setStatusBarColor(brand);
        w.setNavigationBarColor(Color.WHITE);

        web = new WebView(this);
        web.setBackgroundColor(Color.WHITE);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setUserAgentString(s.getUserAgentString() + " DineDeskApp/1.0");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return openOutside(request.getUrl());
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showOffline();
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingUpload != null) pendingUpload.onReceiveValue(null);
                pendingUpload = callback;
                try {
                    startActivityForResult(params.createIntent(), PICK_FILE);
                } catch (ActivityNotFoundException e) {
                    pendingUpload = null;
                    return false;
                }
                return true;
            }
        });

        web.setDownloadListener((url, ua, disposition, mime, length) -> openOutside(Uri.parse(url), true));

        if (state != null) web.restoreState(state);
        else web.loadUrl(BuildConfig.START_URL);
    }

    /** Same site: stay in the app. Anything else: hand it to the phone. */
    private boolean openOutside(Uri uri) {
        return openOutside(uri, false);
    }

    private boolean openOutside(Uri uri, boolean always) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme();
        boolean isWeb = scheme.equals("http") || scheme.equals("https");
        if (!always && isWeb && home.equalsIgnoreCase(uri.getHost())) return false;
        // The business site and the dashboard link to each other: keep both in the app.
        if (!always && isWeb && uri.getHost() != null && uri.getHost().endsWith(".nip.io")) return false;
        try {
            Intent i = scheme.equals("intent") ? Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME) : new Intent(Intent.ACTION_VIEW, uri);
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(i);
        } catch (Exception e) {
            Toast.makeText(this, "No app on this phone can open that link.", Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    private void showOffline() {
        String html = "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>"
                + "<body style='font-family:sans-serif;padding:32px;text-align:center;color:#222'>"
                + "<h2>Can't reach the server</h2>"
                + "<p>Keep the PC running DineDesk on, and this phone on the same Wi-Fi.</p>"
                + "<p style='color:#777;font-size:13px'>" + BuildConfig.START_URL + "</p>"
                + "<button style='margin-top:16px;padding:12px 28px;border:0;border-radius:24px;background:" + BuildConfig.THEME_COLOR
                + ";color:#fff;font-size:16px' onclick=\"location.href='" + BuildConfig.START_URL + "'\">Try again</button>"
                + "</body></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        if (request == PICK_FILE && pendingUpload != null) {
            pendingUpload.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            pendingUpload = null;
            return;
        }
        super.onActivityResult(request, result, data);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.setVisibility(View.GONE);
            web.destroy();
        }
        super.onDestroy();
    }
}
