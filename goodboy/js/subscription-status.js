/**
 * Стадии подписки для кабинета Goodboy.
 * Сервер (gbMe) присылает stage*; здесь — fallback, если Deploy ещё старый.
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
      title: "Ждём, пока Барни сократит запасы лакомств",
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
      text: "Курьер везёт доставку по вашему адресу.",
      progress: 88
    },
    delivered: {
      id: "delivered",
      badge: "получен",
      title: "Набор у вас",
      text: "Приятного аппетита питомцу. Следующий цикл начнём вовремя.",
      progress: 100
    },
    trial: {
      id: "trial",
      badge: "пробный",
      title: "Пробный период",
      text: "Идёт тестовый набор. После него можно перейти на постоянную подписку.",
      progress: 40
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

  function resolveFromSub(sub, link) {
    sub = sub || {};
    link = link || {};
    if (sub.stage && sub.stage.id && sub.stage.title) return sub.stage;
    if (sub.stageId && CATALOG[sub.stageId]) {
      return Object.assign({}, CATALOG[sub.stageId], {
        badge: sub.stageBadge || CATALOG[sub.stageId].badge,
        title: sub.stageTitle || CATALOG[sub.stageId].title,
        text: sub.stageText || CATALOG[sub.stageId].text,
        progress: sub.stageProgress != null ? sub.stageProgress : CATALOG[sub.stageId].progress
      });
    }

    var linked = link.status === "linked";
    var segment = String(sub.segment || "").toUpperCase();
    var calStatus = String(sub.calStatus || "").toLowerCase();
    var days = sub.daysUntil != null ? Number(sub.daysUntil) : daysUntilIso(sub.nextDate);
    var status = String(sub.status || "");

    if (!linked) return CATALOG.unlinked;
    if (status === "paused") return CATALOG.paused;
    if (calStatus === "delivered" || calStatus === "done") return CATALOG.delivered;
    if (/ship|transit|courier|delivering|пути|едет/.test(calStatus)) return CATALOG.on_the_way;
    if (/assembl|packed|сбор/.test(calStatus)) return CATALOG.packing;

    if (days == null || isNaN(days)) {
      return (segment === "БП" || segment === "BP" || status === "trial")
        ? CATALOG.trial
        : CATALOG.waiting_stock;
    }
    if (days <= 1) return CATALOG.on_the_way;
    if (days <= 3) return CATALOG.packing;
    if (days <= 9) return CATALOG.preparing;
    if (days <= 16) return CATALOG.scheduled;
    if (segment === "БП" || segment === "BP" || status === "trial") return CATALOG.trial;
    return CATALOG.waiting_stock;
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
    daysUntilIso: daysUntilIso
  };
})(window);
