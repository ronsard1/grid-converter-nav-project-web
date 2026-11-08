package __PACKAGE__;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Prints an HTML page with Android's own print service
 * (any installed printer, or "Save as PDF").
 * JavaScript: Capacitor.Plugins.HtmlPrint.print({ html, name, landscape })
 */
@CapacitorPlugin(name = "HtmlPrint")
public class HtmlPrintPlugin extends Plugin {
    private WebView printView; // keep a reference until printing has started

    @PluginMethod
    public void print(final PluginCall call) {
        final String html = call.getString("html", "");
        final String name = call.getString("name", "GridNav");
        final boolean landscape = Boolean.TRUE.equals(call.getBoolean("landscape", false));
        getActivity().runOnUiThread(() -> {
            final WebView wv = new WebView(getContext());
            printView = wv;
            wv.setWebViewClient(new WebViewClient() {
                private boolean done = false;
                @Override
                public void onPageFinished(WebView view, String url) {
                    if (done) return;
                    done = true;
                    PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                    PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(name);
                    PrintAttributes.MediaSize size = landscape
                            ? PrintAttributes.MediaSize.ISO_A4.asLandscape()
                            : PrintAttributes.MediaSize.ISO_A4.asPortrait();
                    pm.print(name, adapter, new PrintAttributes.Builder().setMediaSize(size).build());
                    call.resolve();
                }
            });
            wv.loadDataWithBaseURL("https://localhost/", html, "text/html", "UTF-8", null);
        });
    }
}
