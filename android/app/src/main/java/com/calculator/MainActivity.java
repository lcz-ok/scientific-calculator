package com.calculator;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashSet;
import java.util.Set;

public class MainActivity extends Activity {

    private WebView webView;
    private final Set<String> activeDownloads = new HashSet<>();

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new UpdateBridge(), "AndroidUpdate");

        // 沉浸式：隐藏状态栏，最大化计算区域
        View decorView = getWindow().getDecorView();
        int uiOptions = View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE;
        decorView.setSystemUiVisibility(uiOptions);

        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            View decorView = getWindow().getDecorView();
            decorView.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    // ===== 自动更新桥接：断点续传下载 / 进度回调 / 安装 =====
    public class UpdateBridge {

        @JavascriptInterface
        public String status(String fileName) {
            try {
                File part = new File(getCacheDir(), fileName + ".part");
                File full = new File(getCacheDir(), fileName);
                boolean complete = full.exists() && full.length() > 0;
                long received = complete ? full.length() : (part.exists() ? part.length() : 0);
                JSONObject o = new JSONObject();
                o.put("received", received);
                o.put("complete", complete);
                o.put("path", complete ? full.getAbsolutePath() : "");
                return o.toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public void download(final String url, final String fileName) {
            synchronized (activeDownloads) {
                if (activeDownloads.contains(fileName)) return;
                activeDownloads.add(fileName);
            }
            new Thread(() -> runDownload(url, fileName)).start();
        }

        @JavascriptInterface
        public void install(final String fileName) {
            runOnUiThread(() -> installApk(fileName));
        }

        @JavascriptInterface
        public void openExternal(final String url) {
            runOnUiThread(() -> {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) {
                }
            });
        }
    }

    private void runDownload(String url, String fileName) {
        File part = new File(getCacheDir(), fileName + ".part");
        File full = new File(getCacheDir(), fileName);
        HttpURLConnection conn = null;
        try {
            if (full.exists() && full.length() > 0) {
                notifyReady(fileName);
                return;
            }

            long start = part.exists() ? part.length() : 0;
            conn = openConnection(url, start);
            int code = conn.getResponseCode();
            if (code == 416) {
                conn.disconnect();
                if (part.exists()) part.delete();
                start = 0;
                conn = openConnection(url, 0);
                code = conn.getResponseCode();
            }
            if (code != 200 && code != 206) throw new Exception("HTTP " + code);

            long total = 0;
            String contentRange = conn.getHeaderField("Content-Range");
            if (contentRange != null && contentRange.contains("/")) {
                total = Long.parseLong(contentRange.substring(contentRange.lastIndexOf('/') + 1));
            } else if (conn.getContentLength() > 0) {
                total = start + conn.getContentLength();
            }

            boolean append = code == 206 && start > 0;
            InputStream in = conn.getInputStream();
            FileOutputStream out = new FileOutputStream(part, append);
            byte[] buffer = new byte[64 * 1024];
            long received = append ? start : 0;
            long lastNotify = 0;
            int n;
            while ((n = in.read(buffer)) > 0) {
                out.write(buffer, 0, n);
                received += n;
                long now = System.currentTimeMillis();
                if (now - lastNotify > 200) {
                    lastNotify = now;
                    notifyProgress(received, total, fileName);
                }
            }
            out.flush();
            out.close();
            in.close();
            notifyProgress(received, total, fileName);

            if (full.exists()) full.delete();
            if (!part.renameTo(full)) throw new Exception("rename failed");
            notifyReady(fileName);
        } catch (Exception e) {
            notifyError(fileName, e.getMessage() == null ? "download failed" : e.getMessage());
        } finally {
            if (conn != null) conn.disconnect();
            synchronized (activeDownloads) {
                activeDownloads.remove(fileName);
            }
        }
    }

    private HttpURLConnection openConnection(String url, long start) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setInstanceFollowRedirects(true);
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        conn.setRequestProperty("User-Agent", "ScientificCalculator-Updater");
        if (start > 0) conn.setRequestProperty("Range", "bytes=" + start + "-");
        return conn;
    }

    private void notifyProgress(long received, long total, String fileName) {
        runJs("window.__updateProgress(" + received + "," + total + "," + JSONObject.quote(fileName) + ")");
    }

    private void notifyReady(String fileName) {
        runJs("window.__updateReady(" + JSONObject.quote(fileName) + ")");
    }

    private void notifyError(String fileName, String message) {
        runJs("window.__updateError(" + JSONObject.quote(fileName) + "," + JSONObject.quote(message) + ")");
    }

    private void runJs(final String code) {
        runOnUiThread(() -> {
            if (webView != null) webView.evaluateJavascript(code, null);
        });
    }

    private void installApk(String fileName) {
        try {
            File apk = new File(getCacheDir(), fileName);
            if (!apk.exists() || apk.length() <= 0) return;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    && !getPackageManager().canRequestPackageInstalls()) {
                Intent settingsIntent = new Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getPackageName()));
                startActivity(settingsIntent);
                return;
            }

            Uri uri = FileProvider.getUriForFile(
                    MainActivity.this,
                    getPackageName() + ".fileprovider",
                    apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception ignored) {
        }
    }
}
