/* ==================================================================
   native.js — phone features when running as the Android app (APK)
   In the APK (Capacitor) we use Android's own printing and sharing.
   In a normal browser the same buttons use the browser's versions.
   ================================================================== */
(function (root) {
  'use strict';
  const cap = () => root.Capacitor;
  const isApp = () => !!(cap() && typeof cap().isNativePlatform === 'function' && cap().isNativePlatform());
  const reg = {};
  const plugin = name => {
    const c = cap(); if (!c) return null;
    if (c.Plugins && c.Plugins[name]) return c.Plugins[name];
    if (typeof c.registerPlugin === 'function') return reg[name] || (reg[name] = c.registerPlugin(name));
    return null;
  };

  function download(filename, text, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  const Native = {
    isApp,

    /** Print an HTML document. Returns true if handled natively. */
    async print(html, name, landscape) {
      const pr = plugin('HtmlPrint'); // our Android print module (build/android/HtmlPrintPlugin.java)
      if (isApp() && pr) {
        try { await pr.print({ html, name: name || 'GridNav', landscape: !!landscape }); return true; }
        catch (e) { console.warn('HtmlPrint failed, sharing instead', e); }
      }
      if (isApp()) { // no print service: hand the page to another app (Chrome, WPS, printer apps)
        await this.shareFile((name || 'GridNav').replace(/[^\w-]+/g, '_') + '.html', html, 'text/html', name);
        return true;
      }
      return false;
    },

    /** Share a file with WhatsApp, email, Drive… (falls back to a download). */
    async shareFile(filename, text, mime, title) {
      const Fs = plugin('Filesystem'), Sh = plugin('Share');
      if (isApp() && Fs && Sh) {
        await Fs.writeFile({ path: filename, data: text, directory: 'CACHE', encoding: 'utf8' });
        const { uri } = await Fs.getUri({ path: filename, directory: 'CACHE' });
        await Sh.share({ title: title || filename, files: [uri], dialogTitle: 'Share ' + (title || filename) });
        return 'shared';
      }
      try {
        const file = new File([text], filename, { type: mime });
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: title || filename }); return 'shared'; }
      } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
      download(filename, text, mime); return 'downloaded';
    },

    /** Save a file into the phone's Documents/GridNav folder (or download in a browser). */
    async saveFile(filename, text, mime) {
      const Fs = plugin('Filesystem');
      if (isApp() && Fs) {
        try {
          await Fs.writeFile({ path: 'GridNav/' + filename, data: text, directory: 'DOCUMENTS', encoding: 'utf8', recursive: true });
          return 'Documents/GridNav/' + filename;
        } catch (e) { await this.shareFile(filename, text, mime); return 'shared'; }
      }
      download(filename, text, mime); return 'Downloads/' + filename;
    }
  };
  root.Native = Native;
})(window);
