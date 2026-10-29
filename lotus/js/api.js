/* ---------- LOTUS CLINIC — real backend client ----------
   Thin fetch wrapper (credentials + CSRF) + a one-shot loader that replaces
   the static LOTUS.doctors / LOTUS.departments arrays from js/data.js with
   live data from the database, so every page reads the same source the
   booking/auth/admin flows write to.

   Load order on every page: data.js, ui-icons.js, app.js, staff-link.js,
   api.js — then the page's own trailing <script> should do:
     lotusReady.then(() => { ...existing rendering code... });
   so it never runs before the live data (or the offline fallback) is ready.
*/
(function () {
  const API_BASE = (window.LOTUS && window.LOTUS.apiBase) || ((window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:4000/api" : "https://lotus-clinic-api.onrender.com/api");
  let csrfToken = null;

  async function ensureCsrf() {
    if (csrfToken) return csrfToken;
    const res = await fetch(API_BASE + "/auth/csrf", { credentials: "include" });
    if (!res.ok) throw new Error("Could not obtain a CSRF token");
    const data = await res.json();
    csrfToken = data.csrfToken;
    return csrfToken;
  }

  class ApiClientError extends Error {
    constructor(message, status, data) {
      super(message);
      this.status = status;
      this.data = data;
    }
  }

  async function api(path, { method = "GET", body } = {}) {
    const opts = { method, credentials: "include", headers: {} };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    if (!["GET", "HEAD"].includes(method)) {
      opts.headers["X-CSRF-Token"] = await ensureCsrf();
    }

    let res;
    try {
      res = await fetch(API_BASE + path, opts);
    } catch (networkErr) {
      throw new ApiClientError("Сервер недоступен. Проверьте подключение к интернету.", 0, null);
    }

    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      /* empty body, e.g. some 204s */
    }

    if (!res.ok) {
      throw new ApiClientError((data && data.error) || `HTTP ${res.status}`, res.status, data);
    }
    return data;
  }

  window.lotusApi = api;
  window.LotusApiError = ApiClientError;

  // Resolved once the live doctors/departments are in (or the fallback kicked
  // in). Every page's trailing script should wait on this before rendering
  // anything that reads LOTUS.doctors / LOTUS.departments.
  window.lotusReady = (async function loadLiveData() {
    try {
      const [docsRes, depsRes] = await Promise.all([api("/doctors"), api("/departments")]);
      window.LOTUS.doctors = docsRes.doctors;
      window.LOTUS.departments = depsRes.departments;
      window.LOTUS.liveData = true;
    } catch (e) {
      // Graceful degradation: keep showing the static demo content from
      // data.js rather than a blank page, but say so — never silently pass
      // off demo content as live.
      window.LOTUS.liveData = false;
      // eslint-disable-next-line no-console
      console.error("LOTUS API unreachable, showing offline demo data:", e);
      setTimeout(() => {
        if (typeof window.toast === "function") {
          window.toast("Не удалось связаться с сервером клиники. Показаны демонстрационные данные.");
        }
      }, 300);
    }
    return window.LOTUS;
  })();

  // Current session user (patient or staff), fetched once per page load.
  // null while loading; becomes {role, ...} or null once resolved.
  window.lotusSession = api("/auth/me")
    .then((d) => d.user)
    .catch(() => null);
})();

