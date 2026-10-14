package kr.bito.projectmemo;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.view.View;
import android.view.WindowInsets;

public final class MainActivity extends Activity {
    private WebView web;
    private String origin;
    private LinearLayout root;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets edges = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                view.setPadding(edges.left, edges.top, edges.right, edges.bottom);
            } else view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        setContentView(root);
        if (android.os.Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, () -> { if (web != null && web.canGoBack()) web.goBack(); else finish(); });
        origin = getPreferences(MODE_PRIVATE).getString("origin", "");
        if (origin.isEmpty()) setup(); else open(state);
    }
    private void setup() {
        root.removeAllViews();
        TextView title = new TextView(this);
        title.setText("프로젝트 메모\n사용 중인 메모 앱의 웹 주소를 입력하세요.");
        title.setTextSize(20); title.setPadding(24, 32, 24, 24); root.addView(title);
        EditText url = new EditText(this);
        url.setHint("https://메모앱주소"); url.setSingleLine(true);
        url.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        url.setText(origin); root.addView(url);
        Button connect = new Button(this); connect.setText("메모 앱 연결"); root.addView(connect);
        connect.setOnClickListener(view -> {
            Uri parsed = Uri.parse(url.getText().toString().trim());
            if (!"https".equals(parsed.getScheme()) || parsed.getHost() == null || parsed.getUserInfo() != null) { url.setError("https://로 시작하는 올바른 웹 주소를 입력하세요."); return; }
            origin = parsed.buildUpon().path("").clearQuery().fragment(null).build().toString();
            getPreferences(MODE_PRIVATE).edit().putString("origin", origin).apply();
            open(null);
        });
    }
    private void open(Bundle state) {
        root.removeAllViews();
        Button settings = new Button(this); settings.setText("프로젝트 메모 · 연결 설정");
        settings.setOnClickListener(view -> new AlertDialog.Builder(this).setMessage("다른 메모 앱 주소에 연결할까요? 입력 중인 내용은 먼저 저장 여부를 확인하세요.").setNegativeButton("취소", null).setPositiveButton("주소 변경", (dialog, which) -> { if (web != null) { web.destroy(); web = null; } setup(); }).show());
        root.addView(settings, new LinearLayout.LayoutParams(-1, 48 * (int)getResources().getDisplayMetrics().density));
        web = new WebView(this);
        root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        WebSettings config = web.getSettings();
        config.setJavaScriptEnabled(true); config.setDomStorageEnabled(true);
        config.setAllowFileAccess(false); config.setAllowContentAccess(false);
        config.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptCookie(true);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                Uri home = Uri.parse(origin);
                if ("https".equals(uri.getScheme()) && home.getHost().equals(uri.getHost()) && home.getPort() == uri.getPort()) return false;
                if (request.isForMainFrame() && ("https".equals(uri.getScheme()) || "mailto".equals(uri.getScheme()) || "tel".equals(uri.getScheme()))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (android.content.ActivityNotFoundException ignored) { }
                }
                return true;
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                if (request.isForMainFrame()) new AlertDialog.Builder(MainActivity.this).setMessage("메모 앱에 연결할 수 없습니다. 인터넷 연결과 웹 주소를 확인하세요.").setPositiveButton("다시 시도", (dialog, which) -> view.loadUrl(origin)).setNegativeButton("닫기", null).show();
            }
        });
        if (state == null || web.restoreState(state) == null) web.loadUrl(origin);
    }
    @Override protected void onSaveInstanceState(Bundle state) { if (web != null) web.saveState(state); super.onSaveInstanceState(state); }
    @Override protected void onPause() { CookieManager.getInstance().flush(); super.onPause(); }
    @Override public void onBackPressed() { if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onDestroy() { if (web != null) web.destroy(); super.onDestroy(); }
}
