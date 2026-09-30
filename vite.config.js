import { defineConfig } from "vite";
import { resolve } from "node:path";
import { analyticsOn, operator, LEGAL_DATE, YANDEX_VERIFICATION } from "./src/data/analytics.js";
import { faq } from "./src/data/works.js";

const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Вопросы — готовой разметкой в HTML, а не скриптом: их должны видеть поисковики и ИИ-краулеры.
// Та же пара «вопрос — ответ» уходит в разметку FAQPage для извлечения ответов.
const FAQ_SLOT = '<div class="faq__list" id="faq"></div>';
const faqHtml = faq.map(([q, a], i) => `
          <div class="qa"><h3 class="qa__h"><button class="qa__q" type="button" id="q${i}" aria-expanded="false" aria-controls="a${i}"><span>${esc(q)}</span><i class="qa__i" aria-hidden="true"></i></button></h3>
          <div class="qa__a" id="a${i}" role="region" aria-labelledby="q${i}"><div><p>${esc(a)}</p></div></div></div>`).join("");
// Угловая скобка экранируется, чтобы текст ответа не мог закрыть тег <script>.
const LT_ESCAPE = String.fromCharCode(92) + "u003c";
const faqLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
}).replaceAll("<", LT_ESCAPE);

const date = new Date(LEGAL_DATE).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

// Политика и согласие собираются только вместе со статистикой: пока нет счётчика
// или данных оператора, страниц с пропусками на сайте быть не должно.
const input = { main: resolve(import.meta.dirname, "index.html") };
if (analyticsOn) {
  input.privacy = resolve(import.meta.dirname, "privacy/index.html");
  input.consent = resolve(import.meta.dirname, "consent/index.html");
}

export default defineConfig({
  // Сайт живёт в подпапке: georgy-itech.github.io/site-portfolio/
  base: "/site-portfolio/",
  build: { rollupOptions: { input }, assetsInlineLimit: 0 },
  plugins: [{
    name: "static-content",
    transformIndexHtml(html) {
      let out = html;
      // Вопросы и FAQPage — только на главной, где есть блок вопросов.
      if (out.includes(FAQ_SLOT)) {
        out = out
          .replace(FAQ_SLOT, `<div class="faq__list" id="faq">${faqHtml}\n        </div>`)
          .replace("</head>", `  <script type="application/ld+json">${faqLd}</script>\n</head>`);
      }
      out = out
        .replaceAll("%%FIO%%", operator.fio)
        .replaceAll("%%FIO_DATIVE%%", operator.fioDative)
        .replaceAll("%%EMAIL%%", operator.email)
        .replaceAll("%%DATE%%", date);
      if (YANDEX_VERIFICATION) {
        out = out.replace("</head>", `  <meta name="yandex-verification" content="${YANDEX_VERIFICATION}">\n</head>`);
      }
      return out;
    },
  }],
});
