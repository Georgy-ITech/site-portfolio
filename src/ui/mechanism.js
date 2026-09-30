/*
  Механизм — заранее отрендеренный бесшовный цикл (трассировка лучей, студийный свет,
  см. brand/preview/gear-render.html). За цикл большое колесо проходит 60°
  и совпадает само с собой, поэтому повтор не виден.

  Источник кадров — один из двух:
  - video — VP9 с прозрачностью (Chrome, Яндекс Браузер, Firefox, Edge). Цикл весит
    ~1 МБ против ~5 МБ кадрами. Скачивается один раз с настоящим прогрессом для заставки
    и раздаётся всем плеерам через blob-ссылку.
  - frames — WebP-кадры для WebKit (Safari, все браузеры на iPhone): прозрачность
    в VP9 там не поддерживается. 60 кадров на 12 к/с — та же длина цикла.

  Показ всегда на <canvas>: поверх кадра можно рисовать свет за курсором и затемнение
  по прокрутке (fx), и они ложатся только на металл — фон остаётся прозрачным.
*/
const base = import.meta.env.BASE_URL;

function isWebKitOnly() {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return true;
  return /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|OPR|YaBrowser|Firefox/.test(ua);
}

export function createMechanism() {
  const mode = isWebKitOnly() ? "frames" : "video";
  const listeners = new Set();
  const emit = (p) => listeners.forEach((fn) => fn(p));
  const source = mode === "video" ? videoSource(emit) : frameSource(emit);
  const clock = createClock(source, mode);
  return {
    mode,
    ready: source.ready,
    onProgress(fn) { listeners.add(fn); },
    // Один ход на все холсты: заставка, первый экран и финал показывают один и тот же кадр,
    // поэтому механизм переходит из заставки в первый экран без подмены и без рывка.
    hold() { clock.held = true; },
    still() { clock.still = true; },
    start: () => clock.start(),
    nudge: (v) => clock.nudge(v),
    tick: (t) => clock.tick(t),
    mount(canvas, opts = {}) { return mountPlayer(canvas, clock, opts); },
  };
}

/* ---------- общий ход механизма ---------- */

function createClock(source, mode) {
  const c = {
    held: false, still: false, video: null,
    rate: 1, velocity: 0, phase: 0, prevT: null, lastT: 0,
  };
  if (mode === "video") {
    // Одно видео на всех. Лежит в углу окна прозрачным, чтобы браузер считал его видимым
    // и не останавливал; показывают его холсты.
    source.ready.then((url) => {
      const v = document.createElement("video");
      v.muted = true; v.loop = true; v.playsInline = true;
      v.setAttribute("playsinline", ""); v.setAttribute("aria-hidden", "true");
      v.preload = "auto"; v.className = "mech-src"; v.src = url;
      document.body.append(v);
      c.video = v;
      if (!c.held && !c.still) v.play().catch(() => {});
      else if (c.held) {
        // Разогрев декодера: пока механизм ждёт сборки, видео коротко проигрывается и
        // возвращается на начало. Иначе первый старт после паузы стоит кадр-другой рывка.
        v.play().then(() => setTimeout(() => { if (c.held) { v.pause(); v.currentTime = 0; } }, 250)).catch(() => {});
      }
    });
  }
  c.tick = (t) => {
    if (t === c.lastT) return;
    c.lastT = t;
    if (c.prevT !== null && !c.held && !c.still) c.phase += (t - c.prevT) * FPS;
    c.prevT = t;
    const v = c.video;
    if (v && !c.still && !c.held) {
      // Прокрутка разгоняет колёса, потом они плавно возвращаются к своему ходу.
      c.velocity *= 0.9;
      const target = 1 + Math.min(Math.abs(c.velocity) * 0.06, 3);
      c.rate += (target - c.rate) * 0.12;
      if (Math.abs(v.playbackRate - c.rate) > 0.02) v.playbackRate = c.rate;
    }
  };
  c.nudge = (v) => { c.velocity = v; c.phase += v * 0.02; };
  // Старт после сборки. Промис — когда кадры уже действительно пошли: до этого механизм
  // не показываем, иначе видно, как он «стоит» на первом кадре, пока видео раскачивается.
  c.start = () => {
    if (!c.held) return Promise.resolve();
    c.held = false;
    // Сразу обычный ход. Цикл отрендерен на 24 к/с: на замедленном старте кадры меняются
    // реже 10 раз в секунду, и глаз читает это как подвисание. Разгон прячет перелёт в первый экран.
    c.rate = 1; c.phase = 0;
    const v = c.video;
    if (!v) return Promise.resolve();
    v.currentTime = 0;
    v.playbackRate = 1;
    v.play().catch(() => {});
    return new Promise((ok) => {
      const done = () => ok();
      if ("requestVideoFrameCallback" in v) {
        const wait = (_, meta) => (meta.mediaTime > 0.02 ? done() : v.requestVideoFrameCallback(wait));
        v.requestVideoFrameCallback(wait);
      } else v.addEventListener("playing", done, { once: true });
      setTimeout(done, 700);
    });
  };
  c.frame = () => {
    if (c.video) return c.video.readyState >= 2 ? c.video : null;
    if (mode === "video") return null;
    const p = c.still || c.held ? 0 : Math.floor(c.phase);
    return source.get(((p % FRAME_COUNT) + FRAME_COUNT) % FRAME_COUNT);
  };
  return c;
}

/* ---------- источник: видео ---------- */

function videoSource(emit) {
  // Полная версия (888 px — родное разрешение рендера) — всем, кроме узких экранов телефонов:
  // раньше порог срабатывал и на небольших окнах ноутбука, и механизм выглядел мыльным.
  const need = Math.min(window.innerWidth * 0.62, 680) * Math.min(window.devicePixelRatio || 1, 2);
  const url = `${base}mech/mech-${need > 420 ? 800 : 520}.webm`;
  const state = { url: null };
  state.ready = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(String(res.status));
      const total = Number(res.headers.get("content-length")) || 0;
      const reader = res.body.getReader();
      const chunks = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        if (total) emit(got / total);
      }
      state.url = URL.createObjectURL(new Blob(chunks, { type: "video/webm" }));
    } catch {
      state.url = url; // пусть браузер попробует сам — заставка всё равно отпустит по таймеру
    }
    emit(1);
    return state.url;
  })();
  return state;
}

/* ---------- источник: кадры (WebKit) ---------- */

const FRAME_COUNT = 60;
const FPS = 12;

function frameSource(emit) {
  const imgs = new Array(FRAME_COUNT).fill(null);
  const order = [];
  for (let i = 0; i < FRAME_COUNT; i += 4) order.push(i);
  for (let i = 0; i < FRAME_COUNT; i++) if (i % 4) order.push(i);
  let loaded = 0;
  const load = (i) => new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => { imgs[i] = img; loaded++; emit(loaded / FRAME_COUNT); resolve(); };
    img.onerror = () => resolve();
    img.src = `${base}mech/frames/${String(i).padStart(3, "0")}.webp`;
  });
  async function run(list) {
    let next = 0;
    const worker = async () => { while (next < list.length) await load(list[next++]); };
    await Promise.all(Array.from({ length: 6 }, worker));
  }
  const firstPass = order.slice(0, FRAME_COUNT / 4);
  const ready = run(firstPass).then(() => { run(order.slice(firstPass.length)); });
  return {
    ready,
    imgs,
    get(i) {
      for (let k = 0; k < FRAME_COUNT; k++) {
        const img = imgs[(i - k + FRAME_COUNT) % FRAME_COUNT];
        if (img) return img;
      }
      return null;
    },
  };
}

/* ---------- проигрыватель ---------- */

function mountPlayer(canvas, clock, { fx = null } = {}) {
  const ctx = canvas.getContext("2d");
  let visible = true, w = 0, h = 0, res = 1, active = true;
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * res;
    w = Math.max(1, Math.round(r.width * dpr));
    h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
  io.observe(canvas);
  resize();

  return {
    canvas,
    draw(t) {
      clock.tick(t);
      if (!visible || !active) return;
      const img = clock.frame();
      if (!img) return;
      const iw = img.videoWidth || img.naturalWidth, ih = img.videoHeight || img.naturalHeight;
      if (!iw || !ih) return;
      const s = Math.min(w / iw, h / ih);
      const dw = iw * s, dh = ih * s, dx = (w - dw) / 2, dy = (h - dh) / 2;
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, dx, dy, dw, dh);
      if (fx) {
        // Всё, что рисует fx, ложится только на уже нарисованный металл.
        ctx.globalCompositeOperation = "source-atop";
        fx(ctx, w, h);
        ctx.globalCompositeOperation = "source-over";
      }
    },
    // Холст, который растягивают трансформацией (перелёт из заставки), рисуем сразу в
    // конечном разрешении — иначе в полёте механизм мылится, а на месте резко становится чётким.
    setResolution(k) { res = k; resize(); },
    // Невидимый холст не рисуем: во время перелёта заставки видеокарта нужна летящему механизму.
    setActive(on) { active = on; },
    destroy() { ro.disconnect(); io.disconnect(); },
  };
}
