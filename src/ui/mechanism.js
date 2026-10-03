/*
  Механизм — заранее отрендеренный бесшовный цикл (трассировка лучей, студийный свет,
  см. brand/preview/gear-render.html). За цикл большое колесо проходит 60°
  и совпадает само с собой, поэтому повтор не виден.

  Источник кадров — одно видео на все холсты, скачанное с настоящим прогрессом для
  заставки и розданное через blob-ссылку:
  - packed — H.264 (crf 17), альфа лежит в нижней половине кадра и собирается обратно на WebGL.
    Основной режим везде, где есть WebGL: H.264 декодирует видеокарта. VP9 с прозрачностью
    Chrome декодирует только программно — стоило процессору отвлечься, видео ждало кадров
    по 0.2 с, и шестерни замирали посреди перелёта в первый экран (замер на MSI, 2026-10-03).
  - video — VP9 с прозрачностью, если WebGL нет, а браузер не WebKit;
  - frames — 60 WebP по 480 px на 12 к/с: WebKit без WebGL или когда видео не дало кадра.

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
  // H.264 с альфой в нижней половине кадра — всем, у кого есть WebGL: его декодирует видеокарта.
  // VP9 с прозрачностью Chrome декодирует только программно, и стоило процессору отвлечься,
  // видео ждало кадров по 0.2 с — шестерни замирали посреди перелёта (замер на MSI, 2026-10-03).
  const mode = hasWebGL() ? "packed" : isWebKitOnly() ? "frames" : "video";
  const listeners = new Set();
  const emit = (p) => listeners.forEach((fn) => fn(p));
  const source = mode === "frames" ? frameSource(emit) : videoSource(emit, mode);
  const clock = createClock(source, mode);
  if (/[?&]debug(&|=|$)/.test(location.search)) debugOverlay(clock, mode);
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
    held: false, still: false, video: null, frames: null, why: "",
    rate: 1, velocity: 0, phase: 0, prevT: null, lastT: 0,
  };
  // Страховка для WebKit: если видео не дало ни кадра (автозапуск запрещён, декодер или WebGL
  // отказали), механизм переходит на WebP-кадры, а не исчезает с экрана.
  c.fallback = (why) => {
    if (c.frames || mode === "video") return;
    c.why = why;
    c.frames = frameSource(() => {});
    if (c.video) { c.video.pause(); c.video.remove(); c.video = null; }
  };
  if (mode !== "frames") {
    // Одно видео на всех. Лежит в углу окна прозрачным, чтобы браузер считал его видимым
    // и не останавливал; показывают его холсты.
    source.ready.then((url) => {
      const v = document.createElement("video");
      v.muted = true; v.loop = true; v.playsInline = true;
      v.setAttribute("playsinline", ""); v.setAttribute("aria-hidden", "true");
      v.preload = "auto"; v.className = "mech-src"; v.src = url;
      document.body.append(v);
      c.video = v;
      if (mode === "packed") {
        try { c.unpack = createUnpacker(v); } catch { c.fallback("webgl"); return; }
        v.addEventListener("error", () => c.fallback("error"), { once: true });
        setTimeout(() => { if (c.video && c.video.readyState < 2) c.fallback("no-data"); }, 3000);
      }
      // Режим энергосбережения на iPhone запрещает автозапуск — тогда пускаем с первого касания.
      const kick = () => { if (!c.held && !c.still) v.play().catch(() => {}); };
      addEventListener("touchstart", kick, { once: true, passive: true });
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
    if (mode === "packed") setTimeout(() => { if (c.video && c.video.currentTime < 0.05) c.fallback("no-play"); }, 1500);
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
    if (c.video) {
      if (c.video.readyState < 2) return null;
      if (!c.unpack) return c.video;
      try { return c.unpack(); } catch { c.fallback("unpack"); return null; }
    }
    const src = c.frames || (mode === "frames" ? source : null);
    if (!src) return null;
    const p = c.still || c.held ? 0 : Math.floor(c.phase);
    return src.get(((p % FRAME_COUNT) + FRAME_COUNT) % FRAME_COUNT);
  };
  return c;
}

/* ---------- источник: видео ---------- */

function videoSource(emit, mode) {
  // Полная версия (888 px — родное разрешение рендера) — всем, кроме узких экранов телефонов:
  // раньше порог срабатывал и на небольших окнах ноутбука, и механизм выглядел мыльным.
  // H.264 одна версия, полная: у iPhone плотность экрана 3, меньшая была бы мыльной.
  const need = Math.min(window.innerWidth * 0.62, 680) * Math.min(window.devicePixelRatio || 1, 2);
  const type = mode === "packed" ? "video/mp4" : "video/webm";
  const url = mode === "packed" ? `${base}mech/mech-800.mp4` : `${base}mech/mech-${need > 420 ? 800 : 520}.webm`;
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
      state.url = URL.createObjectURL(new Blob(chunks, { type }));
    } catch {
      state.url = url; // пусть браузер попробует сам — заставка всё равно отпустит по таймеру
    }
    emit(1);
    return state.url;
  })();
  return state;
}

/* ---------- ?debug — состояние механизма на телефоне, где нет консоли ---------- */

function debugOverlay(c, mode) {
  const el = document.createElement("pre");
  el.style.cssText = "position:fixed;left:4px;bottom:4px;z-index:99999;margin:0;padding:6px 8px;font:11px/1.35 monospace;color:#0f0;background:rgb(0 0 0 / .8);pointer-events:none;white-space:pre-wrap;max-width:96vw";
  document.body.append(el);
  const errs = [];
  addEventListener("error", (e) => errs.push(String(e.message).slice(0, 80)));
  setInterval(() => {
    const v = c.video;
    el.textContent = [
      `mode=${mode} fallback=${c.why || "-"} held=${c.held}`,
      v ? `rs=${v.readyState} ns=${v.networkState} paused=${v.paused} t=${v.currentTime.toFixed(2)} ${v.videoWidth}x${v.videoHeight} err=${v.error ? v.error.code : "-"}` : "video=none",
      c.frames ? `frames=${c.frames.imgs.filter(Boolean).length}/60` : "",
      `ua=${navigator.userAgent.slice(0, 90)}`,
      errs.length ? "js: " + errs.slice(-2).join(" | ") : "",
    ].filter(Boolean).join("\n");
  }, 400);
}

/* ---------- сборка прозрачности из H.264 (WebKit) ---------- */

function hasWebGL() {
  try { return !!document.createElement("canvas").getContext("webgl"); } catch { return false; }
}

// Цвет в верхней половине уже умножен на альфу, поэтому края чистые и без ореола.
function createUnpacker(video) {
  const cv = document.createElement("canvas");
  const gl = cv.getContext("webgl", { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
  const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, "attribute vec2 p;varying vec2 uv;void main(){uv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}"));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, "precision mediump float;varying vec2 uv;uniform sampler2D t;void main(){vec3 c=texture2D(t,vec2(uv.x,uv.y*.5)).rgb;float a=texture2D(t,vec2(uv.x,uv.y*.5+.5)).r;gl_FragColor=vec4(min(c,vec3(a)),a);}"));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // Перезаливаем текстуру, только когда видео действительно сменило кадр, — холстов три, а кадр один.
  let dirty = true, lastTime = -1;
  if ("requestVideoFrameCallback" in video) {
    const onFrame = () => { dirty = true; video.requestVideoFrameCallback(onFrame); };
    video.requestVideoFrameCallback(onFrame);
  }
  return () => {
    if (!dirty && video.currentTime === lastTime) return cv;
    dirty = false; lastTime = video.currentTime;
    const w = video.videoWidth, h = video.videoHeight >> 1;
    if (!w || !h) return null;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return cv;
  };
}

/* ---------- источник: кадры (WebKit без WebGL) ---------- */

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
      const iw = img.videoWidth || img.naturalWidth || img.width, ih = img.videoHeight || img.naturalHeight || img.height;
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
