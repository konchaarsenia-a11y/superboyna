(function (global) {
  "use strict";

  var KEY = (global.GB_CONFIG && global.GB_CONFIG.storageKey) || "goodboy_v1";
  var state = {
    screen: "home",
    page: "profile",
    mapFilter: "all",
    mapPlaceId: "p2",
    demo: false,
    user: null,
    pets: [],
    activePetId: null,
    subscription: null,
    partners: [],
    privilege: null,
    link: null,
    bootError: ""
  };
  var listeners = [];

  function loadLocal() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function saveLocal() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        user: state.user,
        pets: state.pets,
        activePetId: state.activePetId,
        subscription: state.subscription,
        partners: state.partners,
        privilege: state.privilege,
        link: state.link,
        demo: state.demo
      }));
    } catch (e2) {}
  }

  function notify() {
    listeners.forEach(function (fn) {
      try { fn(state); } catch (e) {}
    });
  }

  function set(patch) {
    Object.keys(patch || {}).forEach(function (k) {
      state[k] = patch[k];
    });
    saveLocal();
    notify();
  }

  function hydrateFromLocal() {
    var loc = loadLocal();
    if (!loc) return;
    if (loc.user) state.user = loc.user;
    if (loc.pets) state.pets = loc.pets;
    if (loc.activePetId) state.activePetId = loc.activePetId;
    if (loc.subscription) state.subscription = loc.subscription;
    if (loc.partners) state.partners = loc.partners;
    if (loc.privilege) state.privilege = loc.privilege;
    if (loc.link) state.link = loc.link;
    if (loc.demo) state.demo = !!loc.demo;
  }

  function activePet() {
    var id = state.activePetId;
    for (var i = 0; i < state.pets.length; i++) {
      if (state.pets[i].id === id) return state.pets[i];
    }
    return state.pets[0] || null;
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (x) { return x !== fn; });
    };
  }

  hydrateFromLocal();

  global.GBStore = {
    get: function () { return state; },
    set: set,
    subscribe: subscribe,
    activePet: activePet,
    saveLocal: saveLocal
  };
})(window);
