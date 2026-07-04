# Georgy — Frontend Developer · Portfolio

Личный сайт-портфолио фронтенд-разработчика. Тёмный премиум-минимализм: glassmorphism,
свечение сквозь стекло, один цветовой акцент, продуманные микро-взаимодействия.
Тёмная и светлая темы, адаптив, доступность, ноль зависимостей.

**Live:** https://georgy-itech.github.io/site-portfolio/

## Возможности

- Тёмная / светлая тема с переключателем и сохранением в `localStorage`
- Scroll-reveal анимации на `IntersectionObserver`
- Индикатор прогресса прокрутки
- Мобильное бургер-меню, плавные якорные переходы
- Секция работ с карточками проектов и акцентом каждого проекта
- Форма связи через Formspree (AJAX, состояния success / error, без `alert()`)
- `prefers-reduced-motion`, семантичная разметка, aria-атрибуты

## Стек

- HTML5 (семантика, полная мета-разметка, og / twitter card)
- SCSS (BEM, архитектура `global/` + `blocks/`, CSS custom properties, темы)
- Vanilla JavaScript (ES6+, без фреймворков и библиотек)
- Formspree (обработка формы)
- GitHub Pages (деплой)

## Структура

```
site-portfolio/
├── index.html
├── favicon.svg
├── og-image.png
├── css/            # скомпилированный style.css
├── scss/
│   ├── global/     # variables, mixins, fonts, reboot, container…
│   └── blocks/     # header, hero, about, services, skills, works, contacts…
├── js/main.js      # тема, reveal, меню, форма, scroll-progress
├── fonts/          # Noto Sans (self-hosted)
└── images/         # sprite.svg + превью работ
```

## Локальный запуск

Статический сайт — открыть `index.html` или поднять любой статик-сервер:

```bash
npx serve .
```

Сборка стилей (если правишь SCSS):

```bash
sass scss/style.scss css/style.css --style=expanded
```

## Контакты

- GitHub: [Georgy-ITech](https://github.com/Georgy-ITech)
- Kwork: [georgy_tech](https://kwork.ru/user/georgy_tech)
