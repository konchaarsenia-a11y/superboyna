/* Goodboy — изолированный клиент. Конвейер Бойни не трогаем. */
window.GB_CONFIG = {
  version: "0.4.3",
  /**
   * live = webhook Apps Script (только gb* → листы GB_*; CRM read-only).
   * До Deploy Code.gs с gb* — fallback на demo (fallbackDemoOnUnknown).
   * Конвейер Бойни (getClients/saveOrder/…) этим режимом не затрагивается.
   */
  mode: "live",
  /** Бойня C Worker (D1-primary gb*); не сырой /exec */
  webhookUrl: "https://boinya-c.konchaarsenia.workers.dev",
  /** Заявки «Хочу попробовать» — тот же Worker (submitGoodboyTry → D1 + GAS) */
  leadWebhookUrl: "https://boinya-c.konchaarsenia.workers.dev",
  contactEmail: "hello@goodboy.by",
  partnerSlugVarok: "varok",
  storageKey: "goodboy_v1",
  /** Не входить автоматически в демо — сначала экран входа */
  allowDemoFallback: false,
  /** Если live webhook ещё без gb* (старый Deploy) — откат на demo */
  fallbackDemoOnUnknown: true
};
