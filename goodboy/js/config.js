/* Goodboy — изолированный клиент. Конвейер Бойни не трогаем. */
window.GB_CONFIG = {
  version: "0.3.9",
  /** demo = вся логика локально; live = позже, свой/общий API */
  mode: "demo",
  /** Заполнится при связке с бэкендом. Пока не используется. */
  webhookUrl: "",
  /** Заявки «Хочу попробовать» с try.html */
  leadWebhookUrl: "https://script.google.com/macros/s/AKfycbzph2uAYgSd3Ja5XDoi647YkAIRDw2SfRIcgEUlaDW82aLpbzkgS36Zq9V5QXxqPNF7/exec",
  contactEmail: "hello@goodboy.by",
  partnerSlugVarok: "varok",
  storageKey: "goodboy_v1",
  /** Не входить автоматически в демо — сначала экран входа */
  allowDemoFallback: false
};
