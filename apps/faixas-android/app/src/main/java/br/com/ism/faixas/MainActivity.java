package br.com.ism.faixas;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import org.json.JSONArray;

public class MainActivity extends Activity {

    private static final String PAGINA = "https://appassets.androidplatform.net/assets/index.html";
    private static final String URL_SAT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/";
    private static final int REQ_LOC = 1;
    private static final int REQ_ARMAZ = 2;

    private WebView web;
    private WebViewAssetLoader loader;
    private File pastaTiles;
    private GeolocationPermissions.Callback geoCb;
    private String geoOrigem;
    private long ultimoVoltar = 0;
    private final ExecutorService baixador = Executors.newFixedThreadPool(8);

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        // Tela sempre acesa enquanto o app está aberto: o GPS do WebView para se a tela apagar.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        pastaTiles = new File(getFilesDir(), "tiles");
        pastaTiles.mkdirs();

        loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                WebResourceResponse local = loader.shouldInterceptRequest(u);
                if (local != null) return local;
                String h = u.getHost();
                if (h != null && h.endsWith("arcgisonline.com")) return tileGuardada(u);
                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("appassets.androidplatform.net".equals(u.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignorado) { }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origem, GeolocationPermissions.Callback cb) {
                if (temLocalizacao()) {
                    cb.invoke(origem, true, false);
                } else {
                    geoCb = cb;
                    geoOrigem = origem;
                    requestPermissions(new String[]{
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOC);
                }
            }
        });

        web.addJavascriptInterface(new Ponte(), "AndroidApp");

        if (estado != null) {
            web.restoreState(estado);
        } else {
            web.loadUrl(PAGINA);
        }
    }

    private boolean temLocalizacao() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        super.onRequestPermissionsResult(req, perms, res);
        if (req == REQ_LOC && geoCb != null) {
            boolean ok = false;
            for (int r : res) if (r == PackageManager.PERMISSION_GRANTED) ok = true;
            geoCb.invoke(geoOrigem, ok, false);
            geoCb = null;
            if (ok && checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                Toast.makeText(this, "Ative a localização PRECISA para as faixas ficarem corretas.", Toast.LENGTH_LONG).show();
            }
        }
    }

    /**
     * Imagens de satélite: se a imagem já foi guardada (mapa offline), serve do disco.
     * Senão devolve null e o próprio WebView baixa, em paralelo e com o cache dele.
     */
    private WebResourceResponse tileGuardada(Uri u) {
        File f = arquivoTile(u.getPathSegments());
        if (f == null || !f.exists() || f.length() == 0) return null;
        try {
            Map<String, String> cab = new HashMap<>();
            cab.put("Access-Control-Allow-Origin", "*");
            cab.put("Cache-Control", "max-age=31536000");
            return new WebResourceResponse("image/jpeg", null, 200, "OK", cab, new FileInputStream(f));
        } catch (Exception e) {
            return null;
        }
    }

    private File arquivoTile(List<String> seg) {
        int n = seg.size();
        if (n < 3) return null;
        String z = seg.get(n - 3), y = seg.get(n - 2), x = seg.get(n - 1);
        if (!z.matches("\\d+") || !y.matches("\\d+") || !x.matches("\\d+")) return null;
        return new File(pastaTiles, z + "_" + y + "_" + x + ".img");
    }

    /** Baixa uma imagem para o disco. Devolve true se ficou guardada. */
    private boolean guardaTile(String zyx) {
        String[] p = zyx.split("/");
        if (p.length != 3) return false;
        File f = new File(pastaTiles, p[0] + "_" + p[1] + "_" + p[2] + ".img");
        if (f.exists() && f.length() > 0) return true;
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(URL_SAT + zyx).openConnection();
            c.setConnectTimeout(10000);
            c.setReadTimeout(20000);
            c.setRequestProperty("User-Agent", "FaixasISM/1.1 (Android)");
            if (c.getResponseCode() != 200) return false;
            InputStream in = c.getInputStream();
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] b = new byte[16384];
            int lidos;
            while ((lidos = in.read(b)) > 0) buf.write(b, 0, lidos);
            in.close();
            File tmp = new File(pastaTiles, f.getName() + ".tmp" + Thread.currentThread().getId());
            FileOutputStream out = new FileOutputStream(tmp);
            out.write(buf.toByteArray());
            out.close();
            if (!tmp.renameTo(f)) tmp.delete();
            return f.exists();
        } catch (Exception e) {
            return false;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private void progresso(int feitos, int total, int falhas) {
        runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript(
                    "window.__progressoMapa&&window.__progressoMapa(" + feitos + "," + total + "," + falhas + ")", null);
        });
    }

    private WebResourceResponse vazio(Map<String, String> cab, int cod) {
        return new WebResourceResponse("text/plain", "utf-8", cod, cod == 404 ? "Nao encontrado" : "Sem rede", cab,
                new ByteArrayInputStream(new byte[0]));
    }

    /** Ponte chamada pela página para salvar CSV/GeoJSON e baixar o mapa offline. */
    private class Ponte {
        @JavascriptInterface
        public void baixarMapa(String json) {
            try {
                JSONArray lista = new JSONArray(json);
                final int total = lista.length();
                final AtomicInteger feitos = new AtomicInteger(), falhas = new AtomicInteger();
                if (total == 0) { progresso(0, 0, 0); return; }
                for (int i = 0; i < total; i++) {
                    final String zyx = lista.getString(i);
                    baixador.execute(() -> {
                        if (!guardaTile(zyx)) falhas.incrementAndGet();
                        int f = feitos.incrementAndGet();
                        if (f % 10 == 0 || f == total) progresso(f, total, falhas.get());
                    });
                }
            } catch (Exception e) {
                progresso(1, 1, 1);
            }
        }

        @JavascriptInterface
        public String salvar(String nome, String texto) {
            try {
                nome = nome.replaceAll("[^A-Za-z0-9._-]", "_");
                byte[] dados = texto.getBytes(StandardCharsets.UTF_8);
                String mime = nome.endsWith(".csv") ? "text/csv" : nome.endsWith(".json") ? "application/json" : "text/plain";
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.Downloads.DISPLAY_NAME, nome);
                    cv.put(MediaStore.Downloads.MIME_TYPE, mime);
                    cv.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Faixas ISM");
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri == null) return "Não foi possível criar o arquivo em Downloads.";
                    OutputStream o = getContentResolver().openOutputStream(uri);
                    o.write(dados);
                    o.close();
                } else {
                    if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                        runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_ARMAZ));
                        return "Permita o acesso aos arquivos e toque em exportar de novo.";
                    }
                    File d = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Faixas ISM");
                    d.mkdirs();
                    FileOutputStream o = new FileOutputStream(new File(d, nome));
                    o.write(dados);
                    o.close();
                }
                return "Arquivo salvo em Downloads/Faixas ISM/" + nome;
            } catch (Exception e) {
                return "Não foi possível salvar o arquivo: " + e.getMessage();
            }
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.evaluateJavascript("window.__salvar&&window.__salvar()", null);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        long agora = System.currentTimeMillis();
        if (agora - ultimoVoltar < 2500) {
            super.onBackPressed();
        } else {
            ultimoVoltar = agora;
            Toast.makeText(this, "Toque em voltar de novo para sair", Toast.LENGTH_SHORT).show();
        }
    }
}
