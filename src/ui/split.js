/*
  Разбивка текста на буквы — основа всех текстовых эффектов (как StringTune у референса).
  --i — номер буквы, --c — расстояние до середины слова (волна от центра),
  --r — случайное число 0..10 (заголовки появляются в случайном порядке).
  Экранные чтилки получают целое слово через aria-label или скрытую копию.
*/
const rand = () => Math.floor(Math.random() * 11);
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function splitChars(el) {
  if (el.dataset.splitDone) return [...el.querySelectorAll(".ch")];
  const text = el.textContent.replace(/\s+/g, " ").trim();
  el.textContent = "";
  // Скрытая копия, а не aria-label: на обычном span aria-label скринридеры игнорируют.
  const sr = document.createElement("span");
  sr.className = "sr-only";
  sr.textContent = text;
  el.append(sr);
  const chars = [...text];
  const mid = (chars.length - 1) / 2;
  const out = [];
  // Буквы собраны в неразрывные слова: иначе браузер переносит строку посреди слова.
  let word = null;
  chars.forEach((ch, i) => {
    if (ch === " ") { word = null; el.append(" "); return; }
    if (!word) {
      word = document.createElement("span");
      word.className = "wd";
      word.setAttribute("aria-hidden", "true");
      el.append(word);
    }
    const s = document.createElement("span");
    s.className = "ch";
    s.style.setProperty("--i", i);
    s.style.setProperty("--c", Math.round(Math.abs(i - mid)));
    s.style.setProperty("--r", rand());
    s.textContent = ch;
    word.append(s);
    out.push(s);
  });
  el.dataset.splitDone = "1";
  return out;
}

/*
  Кнопка как у референса: каждая буква уходит вверх на половину высоты, а её копия
  (::after с тем же символом) выезжает снизу, уменьшаясь до нормы. Копия берёт
  символ из data-ch, поэтому текст в разметке один.
*/
export function splitButton(el) {
  if (el.dataset.btnDone) return;
  const textNode = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
  if (!textNode) return;
  const text = textNode.textContent.trim();
  const wrap = document.createElement("span");
  wrap.className = "btn__text";
  wrap.setAttribute("aria-hidden", "true");
  const mid = ([...text].length - 1) / 2;
  [...text].forEach((ch, i) => {
    const s = document.createElement("span");
    s.className = "bch";
    s.dataset.ch = ch === " " ? " " : ch;
    s.style.setProperty("--c", Math.round(Math.abs(i - mid)));
    s.textContent = ch === " " ? " " : ch;
    wrap.append(s);
  });
  const sr = document.createElement("span");
  sr.className = "sr-only";
  sr.textContent = text;
  textNode.replaceWith(sr, wrap);
  el.dataset.btnDone = "1";
}

/*
  Разбивка абзаца на строки по фактическому переносу: слова раскладываются,
  затем группируются по offsetTop. Каждая строка — маска + сдвиг снизу.
  При изменении ширины разбивка пересобирается.
*/
export function splitLines(el) {
  const original = el.dataset.linesText || el.textContent.trim().replace(/\s+/g, " ");
  el.dataset.linesText = original;
  el.innerHTML = original.split(" ").map((w) => `<span class="lw" aria-hidden="true">${esc(w)}</span>`).join(" ");
  const words = [...el.querySelectorAll(".lw")];
  const lines = [];
  let top = null;
  words.forEach((w) => {
    if (top === null || Math.abs(w.offsetTop - top) > 4) { lines.push([]); top = w.offsetTop; }
    lines[lines.length - 1].push(w.textContent);
  });
  el.innerHTML = `<span class="sr-only">${esc(original)}</span>` +
    lines.map((l, i) => `<span class="ln" aria-hidden="true" style="--l:${i}"><span class="ln__in">${esc(l.join(" "))}</span></span>`).join("");
  return lines.length;
}
