/**
 * Стадии подписки для кабинета Goodboy.
 * Сервер (gbMe) присылает stage*; здесь — fallback + кличка + метка «пробный».
 */
(function (global) {
  "use strict";

  var CATALOG = {
    unlinked: {
      id: "unlinked",
      badge: "не привязана",
      title: "Привяжите заказ",
      text: "Укажите телефон или Instagram-ник из Бойни — покажем дату и состав.",
      progress: 8
    },
    waiting_stock: {
      id: "waiting_stock",
      badge: "ждём",
      title: "Ждём, пока питомец сократит запасы лакомств",
      text: "Пока доедаете текущий набор — новый не торопим. Когда пора готовить, статус обновится.",
      progress: 22
    },
    scheduled: {
      id: "scheduled",
      badge: "в плане",
      title: "Доставка уже в календаре",
      text: "Дата зафиксирована. Скоро начнём заготовку лакомств.",
      progress: 38
    },
    preparing: {
      id: "preparing",
      badge: "готовим",
      title: "Заготавливаем новые лакомства",
      text: "Сушим и комплектуем набор под вашего питомца.",
      progress: 55
    },
    packing: {
      id: "packing",
      badge: "собираем",
      title: "Собираем ваш набор",
      text: "Упаковываем позиции и готовим к передаче курьеру.",
      progress: 72
    },
    on_the_way: {
      id: "on_the_way",
      badge: "в пути",
      title: "Набор уже в пути",
      text: "Сегодня день доставки — курьер везёт набор по адресу.",
      progress: 88
    },
    delivered: {
      id: "delivered",
      badge: "получен",
      title: "Набор у вас",
      text: "Приятного аппетита питомцу. Следующий цикл начнём вовремя.",
      progress: 100
    },
    paused: {
      id: "paused",
      badge: "пауза",
      title: "Подписка на паузе",
      text: "Доставки временно не планируем. Напишите нам, когда возобновить.",
      progress: 15
    }
  };

  function daysUntilIso(iso) {
    if (!iso) return null;
    var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    var target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((target - today) / 86400000);
  }

  function personalize(stage, petName) {
    stage = Object.assign({}, stage || {});
    var pet = String(petName || "").trim() || "питомец";
    if (stage.id === "waiting_stock") {
      stage.title = "Ждём, пока " + pet + " сократит запасы лакомств";
      stage.text = "Пока " + pet + " доедает текущий набор — новый не торопим. Когда пора готовить, статус обновится.";
    } else if (stage.id === "preparing") {
      stage.text = "Сушим и комплектуем набор под " + (pet === "питомец" ? "вашего питомца" : pet) + ".";
    } else if (stage.id === "delivered") {
      stage.text = pet === "питомец"
        ? "Приятного аппетита питомцу. Следующий цикл начнём вовремя."
        : ("Приятного аппетита, " + pet + "! Следующий цикл начнём вовремя.");
    }
    return stage;
  }

  function resolveFromSub(sub, link, petName) {
    sub = sub || {};
    link = link || {};
    var pet = petName || sub.petName || "";
    var isTrial = !!(sub.isTrial || sub.trialLabel || String(sub.segment || "").toUpperCase() === "БП" ||
      String(sub.segment || "").toUpperCase() === "BP" || sub.status === "trial");

    var stage;
    if (sub.stage && sub.stage.id && sub.stage.title && sub.stage.id !== "trial") {
      stage = Object.assign({}, sub.stage);
    } else if (sub.stageId && sub.stageId !== "trial" && CATALOG[sub.stageId]) {
      stage = Object.assign({}, CATALOG[sub.stageId], {
        badge: sub.stageBadge || CATALOG[sub.stageId].badge,
        title: sub.stageTitle || CATALOG[sub.stageId].title,
        text: sub.stageText || CATALOG[sub.stageId].text,
        progress: sub.stageProgress != null ? sub.stageProgress : CATALOG[sub.stageId].progress
      });
    } else {
      var linked = link.status === "linked";
      var calStatus = String(sub.calStatus || "").toLowerCase();
      var days = sub.daysUntil != null ? Number(sub.daysUntil) : daysUntilIso(sub.nextDate);
      var status = String(sub.status || "");

      if (!linked) stage = CATALOG.unlinked;
      else if (status === "paused") stage = CATALOG.paused;
      else if (calStatus === "delivered" || calStatus === "done") stage = CATALOG.delivered;
      else if (/ship|transit|courier|delivering|пути|едет/.test(calStatus)) stage = CATALOG.on_the_way;
      else if (/assembl|packed|сбор/.test(calStatus)) stage = CATALOG.packing;
      else if (days == null || isNaN(days)) stage = CATALOG.waiting_stock;
      else if (days === 0 || days < 0) stage = CATALOG.on_the_way;
      else if (days <= 3) stage = CATALOG.packing;
      else if (days <= 9) stage = CATALOG.preparing;
      else if (days <= 16) stage = CATALOG.scheduled;
      else stage = CATALOG.waiting_stock;
    }

    stage = personalize(stage, pet);
    stage.isTrial = isTrial;
    stage.trialLabel = isTrial ? (sub.trialLabel || "пробный") : "";
    return stage;
  }

  function tipMeta(stage, sub) {
    stage = stage || CATALOG.unlinked;
    sub = sub || {};
    var days = sub.daysUntil != null ? Number(sub.daysUntil) : daysUntilIso(sub.nextDate);
    var when = "";
    if (days == null || isNaN(days)) when = "";
    else if (days <= 0) when = "Доставка сегодня";
    else if (days === 1) when = "Завтра";
    else when = "Через " + days + " дн.";
    return {
      title: stage.title,
      text: stage.text,
      when: when,
      progress: stage.progress
    };
  }

  global.GBSubStatus = {
    catalog: CATALOG,
    resolve: resolveFromSub,
    tipMeta: tipMeta,
    personalize: personalize,
    daysUntilIso: daysUntilIso
  };
})(window);
