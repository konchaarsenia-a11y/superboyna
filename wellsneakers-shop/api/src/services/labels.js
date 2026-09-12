import bwipjs from "bwip-js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function buildBarcodePng(text) {
  return bwipjs.toBuffer({
    bcid: "code128",
    text: String(text),
    scale: 2,
    height: 10,
    includetext: false,
    backgroundcolor: "FFFFFF",
  });
}

/** 58×58 mm thermal label HTML (print-ready). */
export async function buildLabelHtml(product, { size, date } = {}) {
  const article = product.article || product.barcode;
  let barcodeDataUrl = "";
  try {
    const png = await buildBarcodePng(article);
    barcodeDataUrl = `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    barcodeDataUrl = "";
  }
  const when = date || new Date().toLocaleDateString("ru-RU");
  const price = Number(product.price_byn || 0).toFixed(2);

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<title>Label ${esc(article)}</title>
<style>
  @page { size: 58mm 58mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; }
  .label {
    width: 58mm; height: 58mm; padding: 1.6mm 1.8mm;
    overflow: hidden; position: relative;
  }
  .fine { font-size: 5.2pt; line-height: 1.15; }
  .model { font-size: 8.5pt; font-weight: 700; line-height: 1.1; margin: 1.2mm 0 0.4mm; text-transform: uppercase; }
  .addr { font-size: 6pt; margin-bottom: 0.8mm; }
  .row { display: flex; justify-content: space-between; align-items: flex-end; gap: 1mm; }
  .meta { font-size: 7.5pt; font-weight: 700; line-height: 1.15; }
  .eac { font-size: 7pt; font-weight: 700; border: 0.3mm solid #000; padding: 0.2mm 0.6mm; }
  .bc { text-align: right; }
  .bc img { height: 9mm; max-width: 22mm; }
  .art { font-size: 7pt; font-weight: 700; text-align: center; }
  @media print {
    .noprint { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="noprint" style="padding:8px;font-family:sans-serif">
    <button onclick="window.print()">Печать</button>
    <span style="margin-left:8px">${esc(product.name)} · ${esc(size || "")} · арт. ${esc(article)}</span>
  </div>
  <div class="label">
    <div class="fine">
      ${esc(product.label_type)}<br/>
      Состав: верх ${esc(product.label_upper)}<br/>
      внутри ${esc(product.label_lining)}<br/>
      подошва ${esc(product.label_sole)}<br/>
      Сезонность обуви: ${esc(product.label_season)}<br/>
      Полнота: ${esc(product.label_width)}<br/>
      Страна изготовитель: ${esc(product.label_country)}<br/>
      Изготовитель: ${esc(product.label_maker || "—")}<br/>
      Импортер: ${esc(product.label_importer)}<br/>
      ${esc(product.label_importer_address)}<br/>
      ${esc(product.label_warranty)} ${esc(product.label_tr)}<br/>
      Продукцию экспл. по назначению
    </div>
    <div class="model">${esc(product.name)}</div>
    <div class="addr">${esc(product.store_address)}</div>
    <div class="row">
      <div class="meta">
        Дата ${esc(when)}<br/>
        Размер: ${esc(size || "—")}<br/>
        ${esc(price)}BYN
      </div>
      <div class="eac">EAC</div>
      <div class="bc">
        ${barcodeDataUrl ? `<img src="${barcodeDataUrl}" alt="barcode" />` : ""}
        <div class="art">${esc(article)}</div>
      </div>
    </div>
  </div>
  <script>window.addEventListener('load',()=>{ /* auto-print optional */ });</script>
</body>
</html>`;
}
