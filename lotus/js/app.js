(function () {
  const path = location.pathname.split("/").pop() || "index.html";
  const B = LOTUS.brand;

  /* Логотип — контур цветка лотоса из фирменного знака клиники (img/lotus-logo.png).
     В тёмной теме перекрашивается в белый через CSS-фильтр (см. styles.css),
     чтобы не хранить два файла. Название клиники — LOTUS CLINIC, шрифт Tenor Sans. */
  const LOGO_IMG = `<img class="wm-f lotus-logo-icon" src="img/lotus-logo.png" alt="" aria-hidden="true">`;

  const wordmark = () =>
    `<span class="wm" aria-hidden="true">${LOGO_IMG}<span class="wm-t"><span class="wm-grad">LOTUS</span><small>Clinic</small></span></span>`;
  window.lotusWordmark = wordmark;
  window.lotusLogoIcon = () => LOGO_IMG;

  document.querySelectorAll("[data-wordmark]").forEach((el) => {
    el.innerHTML = wordmark(el.hasAttribute("data-wordmark-full"));
    el.setAttribute("aria-label", B.name);
  });
  document.querySelectorAll("[data-logo-icon]").forEach((el) => {
    el.innerHTML = LOGO_IMG;
    el.setAttribute("aria-hidden", "true");
  });

  document.title = document.title; // no-op, titles are set per page
  if (!document.querySelector('meta[name="theme-color"]')) {
    const m = document.createElement("meta");
    m.name = "theme-color";
    m.content = "#5b3a7a";
    document.head.appendChild(m);
  }

  /* ---------- Patient navigation: use the real backend session ----------
     Staff login is intentionally separate. Never read legacy localStorage demo
     accounts to decide whether the current visitor is authenticated. */
  function authLinksHtml() {
    return `<a href="cabinet.html?auth=login" data-auth-nav="login" data-page="cabinet.html">Войти</a>
            <a href="cabinet.html?auth=register" data-auth-nav="register" data-page="cabinet.html">Регистрация</a>`;
  }

  function renderAuthNav(user) {
    const host = document.querySelector("#site-header .nav-links");
    if (!host) return;
    host.querySelectorAll("[data-auth-nav]").forEach((node) => node.remove());
    const staffLink = host.querySelector("[data-staff-link]");
    function createLink(href, label, type) {
      const link = document.createElement("a");
      link.href = href;
      link.textContent = label; // never interpolate user-provided names into HTML
      link.dataset.authNav = type;
      link.dataset.page = "cabinet.html";
      if (path === "cabinet.html") link.setAttribute("aria-current", "page");
      host.insertBefore(link, staffLink || null);
    }
    if (user && user.role === "patient" && user.patient) {
      const name = String(user.patient.firstName || "Пациент").slice(0, 35);
      createLink("cabinet.html", "Кабинет · " + name, "cabinet");
    } else {
      createLink("cabinet.html?auth=login", "Войти", "login");
      createLink("cabinet.html?auth=register", "Регистрация", "register");
    }
  }

  let navRefreshSequence = 0;
  window.lotusRefreshAuthNav = async function () {
    const request = ++navRefreshSequence;
    if (typeof window.lotusApi !== "function") return;
    let user = null;
    try {
      const result = await window.lotusApi("/auth/me");
      user = result && result.user;
    } catch (e) {
      // A guest or an offline demo visitor should always see the sign-in links.
    }
    if (request === navRefreshSequence) renderAuthNav(user);
  };

  const header = document.getElementById("site-header");
  if (header) {
    const authLinks = authLinksHtml();

    header.innerHTML = `
      <a class="skip" href="#main">К содержанию</a>
      <nav class="nav" aria-label="Главная навигация">
        <div class="nav-inner">
          <a class="logo" href="index.html" aria-label="${B.name} — на главную">${wordmark()}</a>
          <div class="nav-links" id="nav-links">
            <a href="index.html" data-page="index.html">Главная</a>
            <a href="departments.html" data-page="departments.html">Отделения</a>
            <a href="doctors.html" data-page="doctors.html">Врачи</a>
            <a href="appointment.html" data-page="appointment.html">Запись</a>
            <a href="about.html" data-page="about.html">О клинике</a>
            <a href="contacts.html" data-page="contacts.html">Контакты</a>
            ${authLinks}
          </div>
          <div class="nav-actions">
            <button class="icon-btn burger" id="burger" type="button" aria-label="Открыть меню" aria-controls="nav-links" aria-expanded="false">${window.lotusIcon('menu')}</button>
            <button class="icon-btn theme-btn" id="theme" type="button" aria-label="Включить тёмную тему" aria-pressed="false" title="Переключить тему">◐</button>
            <a class="btn gold nav-book" href="appointment.html">Записаться ${window.lotusIcon('arrow')}</a>
          </div>
        </div>
      </nav>`;
    header.querySelectorAll("[data-page]").forEach((a) => {
      if (a.dataset.page === path) {
        if (!a.dataset.auth) a.classList.add("active");
      }
    });
  }

  const footer = document.getElementById("site-footer");
  if (footer) {
    footer.innerHTML = `
      <footer class="footer">
        <div class="wrap footer-grid">
          <div class="footer-brand">
            <a class="logo" href="index.html" aria-label="На главную">${wordmark(true)}</a>
            <p>Современная медицина. Забота о людях.</p>
          </div>
          <div>
            <b>Пациентам</b>
            <div class="footer-links"><a href="index.html">Главная</a><a href="appointment.html">Онлайн-запись</a><a href="cabinet.html">Личный кабинет</a><a href="doctors.html">Наши врачи</a><a href="departments.html">Отделения</a></div>
          </div>
          <div>
            <b>Контакты</b>
            <div class="footer-contact"><p>${window.lotusIcon('pin')}<a href="${B.mapsUrl}" target="_blank" rel="noopener">${B.address}</a></p><p>${window.lotusIcon('phone')}<a href="tel:${B.phoneTel}">${B.phone}</a></p><p>${window.lotusIcon('mail')}<a href="mailto:${B.email}">${B.email}</a></p></div>
            <div class="social-row"><a class="icon-btn" href="${B.whatsapp}" target="_blank" rel="noopener" aria-label="WhatsApp">WA</a><a class="icon-btn" href="${B.telegram}" target="_blank" rel="noopener" aria-label="Telegram">TG</a></div>
          </div>
          <div>
            <b>Режим работы</b>
            <div class="footer-contact"><p>${window.lotusIcon('clock')}<span>Пн–Пт: ${B.hoursWeekday}<br>Сб–Вс: ${B.hoursWeekend}<br>Лаборатория: ${B.hoursLab}</span></p></div>
            <a class="footer-emergency" href="tel:103">${window.lotusIcon('ambulance')} Экстренная помощь · 103</a>
          </div>
        </div>
        <div class="wrap footer-legal">
          <span>© ${new Date().getFullYear()} ${B.name}. Демонстрационный проект: не вводите настоящие медицинские данные.</span>
          <span><a href="contacts.html">Контакты и обратная связь</a></span>
        </div>
      </footer>
      <button class="sos" id="sos" type="button" aria-label="Информация об экстренной помощи">${window.lotusIcon('phone')} SOS 24/7</button>
      <div class="chat">
        <div class="chat-box" id="chat-box" role="region" aria-label="Чат с цифровым координатором">
          <div class="chat-head">
            <span class="chat-avatar" aria-hidden="true">✿</span>
            <div class="chat-head-text"><b>Флора</b><span class="chat-status"><span class="pulse-dot"></span>цифровой координатор «Lotus Clinic»</span></div>
            <button class="icon-btn chat-close" id="chat-close" type="button" aria-label="Закрыть чат">×</button>
          </div>
          <div class="chat-log" id="chat-log" role="log" aria-live="polite" aria-relevant="additions" aria-label="Сообщения чата"></div>
          <form class="chat-form" id="chat-form"><input id="chat-input" placeholder="Симптомы, отделение, запись…" autocomplete="off" aria-label="Сообщение"><button class="btn gold" type="submit" aria-label="Отправить">→</button></form>
        </div>
        <button class="chat-toggle" id="chat-toggle" type="button" aria-label="Открыть чат с Флорой" aria-expanded="false" aria-controls="chat-box">${window.lotusIcon('chat')}</button>
      </div>
      <div class="toast" id="toast" role="status"></div>`;
  }

  /* Theme switch is keyboard accessible and reflects persisted state. */
  const root = document.documentElement;
  const themeButton = document.getElementById("theme");
  function updateThemeControl() {
    if (!themeButton) return;
    const isDark = root.getAttribute("data-theme") === "dark";
    themeButton.setAttribute("aria-pressed", String(isDark));
    themeButton.setAttribute("aria-label", isDark ? "Включить светлую тему" : "Включить тёмную тему");
    themeButton.title = isDark ? "Светлая тема" : "Тёмная тема";
  }
  try {
    if (localStorage.getItem("lotus-theme") === "dark") root.setAttribute("data-theme", "dark");
  } catch (e) {}
  updateThemeControl();
  themeButton?.addEventListener("click", () => {
    const toDark = root.getAttribute("data-theme") !== "dark";
    if (toDark) root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    try {
      localStorage.setItem("lotus-theme", toDark ? "dark" : "light");
    } catch (e) {}
    updateThemeControl();
  });

  /* Mobile menu: Escape, outside click, navigation and desktop resize. */
  const menu = document.getElementById("nav-links");
  const burger = document.getElementById("burger");
  function setMenuOpen(open, restoreFocus = false) {
    if (!menu || !burger) return;
    menu.classList.toggle("open", open);
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
    if (restoreFocus) burger.focus();
  }
  burger?.addEventListener("click", () => setMenuOpen(!menu.classList.contains("open")));
  menu?.addEventListener("click", (event) => {
    if (event.target.closest("a")) setMenuOpen(false);
  });
  document.addEventListener("pointerdown", (event) => {
    if (menu?.classList.contains("open") && !event.target.closest("#site-header .nav")) {
      setMenuOpen(false);
    }
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 980 && menu?.classList.contains("open")) setMenuOpen(false);
  });
  document.getElementById("sos")?.addEventListener("click", () => {
    toast("Экстренная линия: 103 или " + B.phone + ".");
  });

  /* Async script api.js is loaded after app.js; by DOMContentLoaded its
     session helper exists. Refresh the header whenever the backend is ready. */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.lotusRefreshAuthNav(), { once: true });
  } else {
    queueMicrotask(() => window.lotusRefreshAuthNav());
  }

  /* ---------- Флора — цифровой координатор «Lotus Clinic» ----------
     Простой движок на ключевых словах и подборе отделения по симптому
     (через lotusTextMatch/lotusDeptMatch выше). Не заменяет врача —
     подсказывает, куда обратиться, и подталкивает к записи. */
  const log = document.getElementById("chat-log");
  const GREETING = "Здравствуйте! Я Флора, цифровой координатор «Lotus Clinic» 🌸 Опишите, что беспокоит — голова, живот, сердце, давление и т.д. — подскажу отделение и врача. Также могу помочь с записью, ценами, часами работы и адресом.";

  function addMsg(text, who) {
    if (!log) return;
    const el = document.createElement("div");
    el.className = "msg " + who;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  }

  function floraReply(raw) {
    const q = raw.toLowerCase().replace(/ё/g, "е").trim();

    if (/боль в груд|инсульт|кровотеч|задыха|не дыш|потерял сознан|сильная боль/.test(q)) {
      return "Это похоже на экстренную ситуацию — звоните 103 или 112 прямо сейчас, не дожидаясь онлайн-записи. Приёмный покой и лаборатория работают 24/7: " + B.phone + ".";
    }
    if (/^(привет|здравств|добрый день|добрый вечер|доброе утро|хай|hello)/.test(q)) {
      return "Здравствуйте! Расскажите, что вас беспокоит, или спросите про запись, цены, часы работы — помогу.";
    }
    if (/спасибо|благодар/.test(q)) {
      return "Пожалуйста! Если понадоблюсь ещё — я здесь. Хорошего дня 🌸";
    }
    if (/час|режим работ|во сколько|когда открыт|график работ/.test(q)) {
      return `Мы принимаем Пн–Пт ${B.hoursWeekday}, Сб–Вс ${B.hoursWeekend}. Лаборатория и приёмный покой — ${B.hoursLab}.`;
    }
    if (/адрес|наход|доехать|локац|куда прийти|куда идти/.test(q)) {
      return `Мы находимся по адресу: ${B.address}. Схема проезда есть на странице «Контакты».`;
    }
    if (/телефон|позвонить|номер|whatsapp|ватсап|телеграм|telegram/.test(q)) {
      return `Телефон: ${B.phone}. Также можно написать в WhatsApp или Telegram — ссылки в подвале сайта.`;
    }
    if (/цена|стоимост|сколько стоит|прайс|почем/.test(q)) {
      return "Цены свои у каждого отделения — полный прайс-лист и check-up программы смотрите на странице отделения. Скажите, что вас интересует, и я подскажу, куда зайти.";
    }
    if (/запис|слот|забронир|как попасть|отменить визит/.test(q)) {
      return "Запись займёт меньше минуты: раздел «Запись» → отделение → врач → удобное время. Подтверждение придёт в личный кабинет, отменить или перенести визит можно там же.";
    }
    if (/анализ|лаборатор|узи\b|мрт\b|\bкт\b|рентген/.test(q)) {
      return "Лаборатория работает 24/7, большинство результатов анализов готовы за 40–90 минут и сразу появляются в личном кабинете. УЗИ, рентген и МРТ/КТ — тоже в отделении «Лаборатория и диагностика».";
    }
    if (/отзыв/.test(q)) {
      return "Отзывы пациентов есть на странице каждого врача и в разделе отзывов на главной. Своим мнением тоже можно поделиться там после приёма.";
    }
    if (/для врач|кабинет врача|персонал|сотрудник/.test(q)) {
      return "Вход для врачей и персонала — отдельная страница «Для врачей» в меню. Кнопки «Войти»/«Регистрация» в шапке — только для пациентов.";
    }

    // Поиск конкретного врача по имени
    const doc = LOTUS.doctors.find((d) => window.lotusTextMatch(d.name, q) && q.length > 2);
    if (doc) {
      return `${doc.name} — ${doc.title}, стаж ${doc.exp} лет, рейтинг ★ ${doc.rating}. Свободные слоты и запись — на странице врача в разделе «Врачи».`;
    }

    // Подбор отделения по симптому
    const depts = LOTUS.departments.filter((d) => window.lotusDeptMatch(d, q));
    if (depts.length) {
      const d = depts[0];
      const doc2 = LOTUS.doctors.find((x) => x.dept === d.id);
      return `Похоже, вам подойдёт отделение «${d.name}»${doc2 ? ` — например, ${doc2.name} (${doc2.title})` : ""}. Открыть запись туда можно в разделе «Отделения» или сразу в «Записи».`;
    }

    return "Уточните, пожалуйста: опишите симптом (например «болит голова» или «живот»), название отделения, или спросите про запись, цены, часы работы — подскажу, куда обратиться.";
  }

  if (log) addMsg(GREETING, "bot");
  const chatButton = document.getElementById("chat-toggle");
  const chatPanel = document.getElementById("chat-box");
  function setChatOpen(open, restoreFocus = false) {
    if (!chatButton || !chatPanel) return;
    chatPanel.classList.toggle("open", open);
    chatButton.setAttribute("aria-expanded", String(open));
    chatButton.setAttribute("aria-label", open ? "Закрыть чат с Флорой" : "Открыть чат с Флорой");
    if (open) document.getElementById("chat-input")?.focus();
    else if (restoreFocus) chatButton.focus();
  }
  chatButton?.addEventListener("click", () => setChatOpen(!chatPanel?.classList.contains("open")));
  document.getElementById("chat-close")?.addEventListener("click", () => setChatOpen(false, true));
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (chatPanel?.classList.contains("open")) {
      setChatOpen(false, true);
    } else if (menu?.classList.contains("open")) {
      setMenuOpen(false, true);
    }
  });
  document.getElementById("chat-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("chat-input");
    const q = input.value.trim();
    if (!q) return;
    addMsg(q, "me");
    input.value = "";
    const ans = floraReply(q);
    setTimeout(() => addMsg(ans, "bot"), 450);
  });

  window.toast = function (text) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = text;
    t.style.display = "block";
    setTimeout(() => (t.style.display = "none"), 4800);
  };

  window.lotusDept = (id) => LOTUS.departments.find((d) => d.id === id);
  window.lotusDoc = (id) => LOTUS.doctors.find((d) => d.id === id);

  /* ---------- Умный текстовый поиск (симптомы, отделения, чат Флоры) ----------
     Люди часто пишут в одном слове и без окончаний: «голова», «живот», «понос».
     Сначала пробуем точное вхождение фразы, затем — посл овно, сравнивая
     «корень» слова (первые 4 буквы с заменой ё→е), чтобы «голова» находило
     «головные», «живот» — «животе» и т.д. */
  function lotusNorm(s) {
    return String(s || "").toLowerCase().replace(/ё/g, "е");
  }
  function lotusStem(w) {
    return w.length > 4 ? w.slice(0, 4) : w;
  }
  window.lotusTextMatch = function (haystack, query) {
    const h = lotusNorm(haystack);
    const q = lotusNorm(query).trim();
    if (!q) return false;
    if (h.includes(q)) return true;
    const qWords = q.split(/[^а-я0-9]+/i).filter(Boolean).map(lotusStem);
    const hWords = h.split(/[^а-я0-9]+/i).filter(Boolean).map(lotusStem);
    if (!qWords.length) return false;
    return qWords.every((qw) => hWords.some((hw) => hw.startsWith(qw) || qw.startsWith(hw)));
  };
  window.lotusDeptMatch = function (dept, query) {
    const hay = [dept.name, dept.tag, dept.desc, (dept.services || []).join(" "), (dept.symptoms || []).join(" ")].join(" ");
    return window.lotusTextMatch(hay, query);
  };

  /* ---------- Утилита: эффект «стопки» из glass-card.html ----------
     Добавляет классу .stagger-list плавное появление строк сверху вниз
     и подсветку, скользящую под курсором (используем на списках и сетках). */
  window.lotusAnimateList = function (container) {
    if (!container) return;
    const items = Array.from(container.children).filter((el) => !el.classList.contains("stagger-hl"));
    const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    items.forEach((el, i) => {
      if (reducedMotion) { el.classList.add("stagger-item", "in"); return; }
      el.classList.add("stagger-item");
      el.style.setProperty("--i", i);
      el.classList.remove("in");
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("in")));
    });
    if (!reducedMotion && window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches && !container.querySelector(".stagger-hl")) {
      const hl = document.createElement("div");
      hl.className = "stagger-hl";
      container.prepend(hl);
      container.addEventListener("mousemove", (e) => {
        const row = e.target.closest(".stagger-item");
        if (!row) return;
        hl.style.height = row.offsetHeight + "px";
        hl.style.transform = `translate(${row.offsetLeft}px, ${row.offsetTop}px)`;
        hl.style.width = row.offsetWidth + "px";
      });
    }
  };
})();
