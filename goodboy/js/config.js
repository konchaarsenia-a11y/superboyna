/* Goodboy — изолированный клиент. Конвейер Бойни не трогаем. */
window.GB_CONFIG = {
  version: "0.4.2",
  /**
   * live = webhook Apps Script (только gb* → листы GB_*; CRM read-only).
   * До Deploy Code.gs с gb* — fallback на demo (fallbackDemoOnUnknown).
   * Конвейер Бойни (getClients/saveOrder/…) этим режимом не затрагивается.
   */
  mode: "live",
  webhookUrl: "https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec",
  /** Заявки «Хочу попробовать» с try.html */
  leadWebhookUrl: "https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec",
  contactEmail: "hello@goodboy.by",
  partnerSlugVarok: "varok",
  storageKey: "goodboy_v1",
  /** Не входить автоматически в демо — сначала экран входа */
  allowDemoFallback: false,
  /** Если live webhook ещё без gb* (старый Deploy) — откат на demo */
  fallbackDemoOnUnknown: true
};
