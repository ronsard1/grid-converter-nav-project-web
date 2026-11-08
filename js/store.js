/* ==================================================================
   store.js — saving data ON THIS DEVICE (no account, no cloud)
   Everything is kept in the app's own storage on the phone.
   API: Store.list(col) · Store.get(col,id) · Store.save(col,obj) · Store.remove(col,id)
   Collections: maps, points, exercises
   Use Backup (top-right button) to save a copy of everything as a file.
   ================================================================== */
(function (root) {
  'use strict';
  const COLS = ['maps', 'points', 'exercises'];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const KEY = c => 'gridnav:device:' + c;

  const Store = {
    mode: 'device',
    user: { uid: 'device', displayName: 'This device' },
    cache: { maps: [], points: [], exercises: [] },

    async init() {
      for (const c of COLS) {
        try { this.cache[c] = Object.values(JSON.parse(localStorage.getItem(KEY(c)) || '{}')); }
        catch (e) { this.cache[c] = []; }
      }
      // Ask the system not to clear our storage when the phone is low on space.
      try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}
    },
    list(c) { return this.cache[c]; },
    get(c, id) { return this.cache[c].find(x => x.id === id); },

    async save(c, obj) {
      const o = JSON.parse(JSON.stringify({ ...obj, id: obj.id || uid(), updatedAt: Date.now(), createdAt: obj.createdAt || Date.now() }));
      const i = this.cache[c].findIndex(x => x.id === o.id);
      if (i >= 0) this.cache[c][i] = o; else this.cache[c].push(o);
      this.persist(c);
      return o;
    },
    async remove(c, id) {
      this.cache[c] = this.cache[c].filter(x => x.id !== id);
      this.persist(c);
    },
    persist(c) {
      const obj = {}; this.cache[c].forEach(x => obj[x.id] = x);
      try { localStorage.setItem(KEY(c), JSON.stringify(obj)); lastChange(); }
      catch (e) { root.dispatchEvent(new CustomEvent('store-error', { detail: 'Phone storage is full. Delete old exercises or save a backup and clear.' })); }
    },

    /* ---------- backups ---------- */
    exportData() {
      return { app: 'GridNav', version: 3, exported: new Date().toISOString(),
        maps: this.cache.maps, points: this.cache.points, exercises: this.cache.exercises };
    },
    /** Merge a backup into this device. Same id = replaced by the backup copy. Returns counts. */
    async importData(d) {
      if (!d || d.app !== 'GridNav') throw new Error('This file is not a GridNav backup.');
      const n = {};
      for (const c of COLS) { n[c] = 0; for (const o of d[c] || []) { await this.save(c, o); n[c]++; } }
      return n;
    },
    lastBackup() { try { return Number(localStorage.getItem('gridnav:lastBackup')) || 0; } catch (e) { return 0; } },
    markBackup() { try { localStorage.setItem('gridnav:lastBackup', String(Date.now())); localStorage.setItem('gridnav:changes', '0'); } catch (e) {} },
    changesSinceBackup() { try { return Number(localStorage.getItem('gridnav:changes')) || 0; } catch (e) { return 0; } }
  };
  function lastChange() { try { localStorage.setItem('gridnav:changes', String((Number(localStorage.getItem('gridnav:changes')) || 0) + 1)); } catch (e) {} }
  root.Store = Store;
})(window);
