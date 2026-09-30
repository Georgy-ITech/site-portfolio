# Georgy_Tech — личный сайт

Сайт разработчика сайтов под ключ: первый экран с часовым механизмом, отрендеренным
трассировкой лучей, закреплённая галерея из 19 работ, светлая «бумажная» часть с составом
работы, условиями, ценами и вопросами. Тёмная сцена, сдержанное латунное золото.

**Live:** https://georgy-tech.ru/

## Стек

- Vite, vanilla JS (ES-модули), SCSS
- GSAP + ScrollTrigger — закреплённая галерея, проявление текста, разъезд заголовков
- Lenis — плавная прокрутка (отключается при `prefers-reduced-motion`)
- Шрифты локально через Fontsource: Cormorant Garamond (заголовки), Geist (текст), Martian Mono (служебный слой)

## Механизм

Три зацеплённых колеса построены кодом (эвольвентный профиль зуба, реальные передаточные
числа) и отрендерены трассировкой лучей в `brand/preview/gear-render.html`
(three-gpu-pathtracer, студийное окружение Poly Haven, CC0). Цикл бесшовный: за 120 кадров
большое колесо проходит 60° и совпадает само с собой.

- `public/mech/mech-800.webm`, `mech-520.webm` — VP9 с прозрачностью (Chrome, Яндекс Браузер, Firefox, Edge)
- `public/mech/frames/` — 60 WebP-кадров для Safari и iPhone (там прозрачность VP9 не поддерживается)
- `public/mech/still.webp` — одиночный кадр для меню

## Разработка

```bash
npm install
npm run dev      # разработка
npm run build    # сборка в dist/
npm run preview  # проверка собранного dist на http://localhost:5548/
```

Деплой — GitHub Actions (`.github/workflows/deploy.yml`) при пуше в `main`.
В настройках репозитория: **Settings → Pages → Source: GitHub Actions**.

## Статистика

Яндекс Метрика подключается по той же схеме, что на doctorgabriel.ru: скрипт не грузится
до согласия, есть баннер, политика и отдельное согласие. Всё выключено, пока в
`src/data/analytics.js` не заполнены номер счётчика, ФИО и почта оператора: без них не
собираются ни баннер, ни страницы `/privacy/` и `/consent/`, ни ссылки в подвале.

Цели для Метрики («JavaScript-событие»): `kwork_open`, `telegram_open`, `github_open`, `work_open`,
`viewer_next`, `price_view`, `menu_open`.

Ссылки с метками — чтобы видеть, откуда пришли:

| Где стоит ссылка | Адрес |
|---|---|
| Профиль Kwork | `https://georgy-tech.ru/?utm_source=kwork&utm_medium=profile` |
| Telegram-канал | `https://georgy-tech.ru/?utm_source=telegram&utm_medium=social` |
| GitHub-профиль | `https://georgy-tech.ru/?utm_source=github&utm_medium=profile` |

## Структура

```
index.html            разметка главной
privacy/, consent/    политика и согласие (собираются только со статистикой)
src/main.js           сборка модулей: прокрутка, заставка, первый экран, вкладки, часы
src/ui/               mechanism, gallery, menu, split, consent
src/data/             works.js (19 работ, вопросы), analytics.js
src/styles/           tokens, base, controls, chrome, hero, works, paper, final
public/               снимки работ, механизм, favicon, robots, sitemap, llms.txt
```
