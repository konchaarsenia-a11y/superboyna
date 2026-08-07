/**
 * IndexedDB — локальная правда UI песочницы C.
 */
(function () {
  "use strict";
  var cfg = window.__BOINYA_C__ || {};
  var DB_NAME = cfg.idbName || "boinya_c_v1";
  var DB_VER = cfg.idbVersion || 1;
  var _dbp = null;

  function openDb() {
    if (_dbp) return _dbp;
    _dbp = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains("days")) {
          db.createObjectStore("days", { keyPath: "day" });
        }
        if (!db.objectStoreNames.contains("outbox")) {
          var ob = db.createObjectStore("outbox", { keyPath: "id", autoIncrement: true });
          ob.createIndex("byStatus", "status", { unique: false });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
    return _dbp;
  }

  function txDone(tx) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () {
        resolve();
      };
      tx.onerror = function () {
        reject(tx.error);
      };
      tx.onabort = function () {
        reject(tx.error || new Error("abort"));
      };
    });
  }

  window.BoinyaCIdb = {
    open: openDb,

    async getDay(day) {
      var db = await openDb();
      return new Promise(function (resolve, reject) {
        var tx = db.transaction("days", "readonly");
        var req = tx.objectStore("days").get(day);
        req.onsuccess = function () {
          resolve(req.result || null);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    },

    async putDay(day, payload) {
      var db = await openDb();
      var tx = db.transaction("days", "readwrite");
      tx.objectStore("days").put({
        day: day,
        clients: (payload && payload.clients) || [],
        date: (payload && payload.date) || "",
        updatedAt: new Date().toISOString(),
        source: (payload && payload.source) || "local"
      });
      await txDone(tx);
    },

    async listDays() {
      var db = await openDb();
      return new Promise(function (resolve, reject) {
        var tx = db.transaction("days", "readonly");
        var req = tx.objectStore("days").getAll();
        req.onsuccess = function () {
          resolve(req.result || []);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    },

    async enqueue(mutation) {
      var db = await openDb();
      var tx = db.transaction("outbox", "readwrite");
      var row = Object.assign({}, mutation, {
        status: "pending",
        createdAt: new Date().toISOString(),
        tries: 0
      });
      var req = tx.objectStore("outbox").add(row);
      var idP = new Promise(function (resolve, reject) {
        req.onsuccess = function () {
          resolve(req.result);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
      await txDone(tx);
      return idP;
    },

    async listOutbox(status) {
      var db = await openDb();
      return new Promise(function (resolve, reject) {
        var tx = db.transaction("outbox", "readonly");
        var store = tx.objectStore("outbox");
        var req = status ? store.index("byStatus").getAll(status) : store.getAll();
        req.onsuccess = function () {
          resolve(req.result || []);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    },

    async markOutbox(id, patch) {
      var db = await openDb();
      var tx = db.transaction("outbox", "readwrite");
      var store = tx.objectStore("outbox");
      var getReq = store.get(id);
      await new Promise(function (resolve, reject) {
        getReq.onsuccess = function () {
          var row = getReq.result;
          if (!row) {
            resolve();
            return;
          }
          Object.keys(patch || {}).forEach(function (k) {
            row[k] = patch[k];
          });
          store.put(row);
          resolve();
        };
        getReq.onerror = function () {
          reject(getReq.error);
        };
      });
      await txDone(tx);
    },

    async setMeta(key, value) {
      var db = await openDb();
      var tx = db.transaction("meta", "readwrite");
      tx.objectStore("meta").put({ key: key, value: value });
      await txDone(tx);
    },

    async getMeta(key) {
      var db = await openDb();
      return new Promise(function (resolve, reject) {
        var tx = db.transaction("meta", "readonly");
        var req = tx.objectStore("meta").get(key);
        req.onsuccess = function () {
          resolve(req.result ? req.result.value : null);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    },

    async clearAll() {
      var db = await openDb();
      var tx = db.transaction(["days", "outbox", "meta"], "readwrite");
      tx.objectStore("days").clear();
      tx.objectStore("outbox").clear();
      tx.objectStore("meta").clear();
      await txDone(tx);
    }
  };
})();
