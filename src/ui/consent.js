/*
  Согласие на статистику и Яндекс Метрика — перенос схемы с doctorgabriel.ru.

  Порядок жёсткий: пока человек не нажал «Разрешить», скрипт Метрики не
  запрашивается вовсе — ни cookie, ни IP к Яндексу не уходят. Отказ
  запоминается так же, как согласие, и баннер больше не пристаёт.
  Выбор хранится в localStorage этого браузера и на сервер не уходит.

  Цели (завести в Метрике как «JavaScript-событие»):
    kwork_open, telegram_open, github_open — переходы на площадки
    work_open               — открыт сайт из витрины (параметр — название)
    viewer_next             — листали работы
    price_view              — дошли до цен
    menu_open               — открыли меню
*/
import { METRIKA_ID, CONSENT_VERSION, analyticsOn } from "../data/analytics.js";

const KEY = "site-portfolio:consent";
const base = import.meta.env.BASE_URL;
let counterId = null;

function readChoice() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return saved && saved.v === CONSENT_VERSION ? saved.choice : null;
  } catch {
    return null;
  }
}

function saveChoice(choice) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: CONSENT_VERSION, choice, at: new Date().toISOString() }));
  } catch {
    // Хранилище закрыто (приватный режим): выбор действует до перезагрузки.
  }
}

function loadMetrika() {
  if (counterId) return;
  counterId = METRIKA_ID;
  // Официальный код счётчика без <noscript>-пикселя: тот грузился бы и без согласия.
  (function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
    m[i].l = 1 * new Date();
    k = e.createElement(t);
    a = e.getElementsByTagName(t)[0];
    k.async = 1;
    k.src = r;
    a.parentNode.insertBefore(k, a);
  })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
  window.ym(Number(counterId), "init", { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true });
}

/** Цель в Метрике. Без согласия — ничего не делает. */
export function goal(name, params) {
  if (counterId && window.ym) window.ym(Number(counterId), "reachGoal", name, params);
}

// Отзыв согласия: cookie и записи Метрики стираются, страница перезагружается —
// иначе уже загруженный счётчик считал бы дальше.
function forgetMetrika() {
  const host = location.hostname;
  for (const pair of document.cookie.split(";")) {
    const name = pair.split("=")[0].trim();
    if (!name.startsWith("_ym")) continue;
    for (const domain of ["", host, "." + host]) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? "; domain=" + domain : ""}`;
    }
  }
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("_ym")) localStorage.removeItem(k);
  } catch {}
}

function buildBanner() {
  const el = document.createElement("section");
  el.className = "consent";
  el.setAttribute("aria-labelledby", "consentTitle");
  el.hidden = true;
  el.innerHTML = `
    <h2 class="consent__title" id="consentTitle">Статистика посещений</h2>
    <p class="consent__text">С вашего согласия сайт подключит Яндекс Метрику: она сохранит cookie и получит
      ваш IP-адрес, чтобы считать посещения и видеть, откуда приходят. Без согласия сайт работает так же.
      <a href="${base}privacy/">Политика</a> и <a href="${base}consent/">текст согласия</a>.</p>
    <div class="consent__actions">
      <button class="consent__btn" type="button" data-consent-yes>Разрешить</button>
      <button class="consent__btn" type="button" data-consent-no>Отказаться</button>
    </div>`;
  document.body.append(el);
  return el;
}

function addFooterLinks() {
  const nav = document.getElementById("footLinks");
  if (!nav) return;
  const privacy = document.createElement("a");
  privacy.href = `${base}privacy/`;
  privacy.textContent = "Политика";
  const settings = document.createElement("button");
  settings.type = "button";
  settings.className = "foot__btn";
  settings.dataset.consentOpen = "";
  settings.textContent = "Настройки статистики";
  nav.append(privacy, settings);
}

/** Показ баннера откладывается, пока идёт заставка: ready() вызывается после неё. */
export function initConsent() {
  if (!analyticsOn) return { ready() {} };
  addFooterLinks();
  const banner = buildBanner();
  const show = () => { banner.hidden = false; };
  const choice = readChoice();
  if (choice === "yes") loadMetrika();

  banner.querySelector("[data-consent-yes]").addEventListener("click", () => {
    saveChoice("yes");
    banner.hidden = true;
    loadMetrika();
  });
  banner.querySelector("[data-consent-no]").addEventListener("click", () => {
    const wasOn = Boolean(counterId);
    saveChoice("no");
    banner.hidden = true;
    forgetMetrika();
    if (wasOn) location.reload();
  });
  document.querySelectorAll("[data-consent-open]").forEach((b) => b.addEventListener("click", () => {
    show();
    banner.querySelector("[data-consent-yes]").focus();
  }));
  return { ready() { if (!choice) show(); } };
}
