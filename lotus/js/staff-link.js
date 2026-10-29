/* Adds a "Для врачей" link to the shared header on every patient-facing page.
   Keeps staff access separate from the patient "Войти / Регистрация" links.
   Works with the header rendered into #site-header by app.js. */
(function () {
  var HREF = "doctor-cabinet.html";

  function inject() {
    var host = document.getElementById("site-header");
    if (!host) return true;
    if (host.querySelector("[data-staff-link]")) return true;

    var nav = host.querySelector(".nav-links");
    if (!nav) return false;

    var a = document.createElement("a");
    a.href = HREF;
    a.textContent = "Для врачей";
    a.setAttribute("data-staff-link", "");
    a.style.marginLeft = "auto";
    a.style.opacity = "0.75";
    a.style.fontSize = "15px";

    nav.appendChild(a);
    if (/doctor-cabinet\.html$/.test(location.pathname)) {
      a.classList.add("active");
      a.setAttribute("aria-current", "page");
    }
    return true;
  }

  function start() {
    if (inject()) return;
    var host = document.getElementById("site-header");
    if (!host) return;
    var mo = new MutationObserver(function () { if (inject()) mo.disconnect(); });
    mo.observe(host, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
