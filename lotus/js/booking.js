(function () {
  const params = new URLSearchParams(location.search);
  const state = {
    step: 0,
    dept: params.get("dept") || "",
    doc: params.get("doc") || "",
    slotId: params.get("slotId") || "", // from doctor.html "nearest free slot" links
    selectedSlot: null, // { id, slotAt }
    reason: ""
  };
  const labels = ["Отделение", "Врач", "Слот", "Подтверждение"];

  function setStep(n) {
    state.step = n;
    draw();
  }
  function updateKicker() {
    const k = document.querySelector(".kicker");
    if (k) k.textContent = `Шаг ${state.step + 1} из 4`;
  }

  function fmtSlot(iso) {
    const dt = new Date(iso);
    return dt.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" }) +
      " · " + dt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }

  async function draw() {
    updateKicker();
    document.getElementById("steps").innerHTML = labels
      .map((l, i) => `<button class="step ${i === state.step ? "on" : ""}" type="button">${i + 1}. ${l}</button>`)
      .join("");
    document.querySelectorAll(".step").forEach((b, i) => b.addEventListener("click", () => setStep(i)));

    const pane = document.getElementById("pane");

    if (state.step === 0) {
      pane.innerHTML = `<h3>Куда идём</h3><div class="grid-2" id="opt-dept" style="margin-top:16px"></div>`;
      const grid = document.getElementById("opt-dept");
      grid.innerHTML = LOTUS.departments
        .map((d) => `<button class="dept stagger-item" type="button" data-id="${d.id}"><b>${d.name}</b><div class="muted">${d.tag} · ожидание ${d.wait}</div></button>`)
        .join("");
      lotusAnimateList(grid);
      grid.querySelectorAll("[data-id]").forEach((b) =>
        b.addEventListener("click", () => {
          state.dept = b.dataset.id;
          state.doc = "";
          setStep(1);
        })
      );
    }

    if (state.step === 1) {
      const docs = LOTUS.doctors.filter((d) => !state.dept || d.dept === state.dept);
      pane.innerHTML = `<h3>Кто принимает</h3><div id="opt-doc"></div><p><button class="btn ghost" type="button" id="back">Назад</button></p>`;
      const host = document.getElementById("opt-doc");
      host.innerHTML = docs.length
        ? `<div class="grid-2" style="margin-top:16px">${docs
            .map((d) => `<button class="doc stagger-item" type="button" data-id="${d.id}"><b>${d.name}</b><div class="muted">${d.title} · ★ ${d.rating}</div></button>`)
            .join("")}</div>`
        : `<p class="muted" style="margin-top:16px">В этом отделении онлайн-запись к врачу пока недоступна. Позвоните: ${LOTUS.brand.phone}.</p>`;
      if (docs.length) lotusAnimateList(host.firstElementChild);
      host.querySelectorAll("[data-id]").forEach((b) =>
        b.addEventListener("click", () => {
          state.doc = b.dataset.id;
          state.slotId = "";
          setStep(2);
        })
      );
      document.getElementById("back")?.addEventListener("click", () => setStep(0));
    }

    if (state.step === 2) {
      const doc = LOTUS.doctors.find((d) => d.id === state.doc);
      pane.innerHTML = `<h3>${doc ? doc.name : "Слот"}</h3><div id="slot-pane"><p class="muted">Загружаем свободные окна…</p></div>
        <button class="btn ghost" type="button" id="back" style="margin-top:12px">Назад</button>`;
      document.getElementById("back")?.addEventListener("click", () => setStep(1));

      try {
        const res = await lotusApi(`/doctors/${encodeURIComponent(state.doc)}/available-slots?days=21`);
        const slots = res.slots || [];
        const slotPane = document.getElementById("slot-pane");
        if (!slots.length) {
          slotPane.innerHTML = `<p class="muted">У этого врача пока нет открытых окон на ближайшие 3 недели. Позвоните, чтобы уточнить: ${LOTUS.brand.phone}.</p>`;
          return;
        }
        // Group by calendar day so the picker still reads like "date -> times".
        const byDay = new Map();
        slots.forEach((s) => {
          const dayKey = s.slotAt.slice(0, 10);
          if (!byDay.has(dayKey)) byDay.set(dayKey, []);
          byDay.get(dayKey).push(s);
        });
        slotPane.innerHTML = Array.from(byDay.entries())
          .map(([day, daySlots]) => {
            const dayLabel = new Date(day).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
            return `<div style="margin-bottom:18px">
              <div class="muted" style="margin-bottom:8px;text-transform:capitalize">${dayLabel}</div>
              <div class="slots">${daySlots
                .map((s) => `<button type="button" class="chip slot" data-slot-id="${s.id}">${new Date(s.slotAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</button>`)
                .join("")}</div>
            </div>`;
          })
          .join("");
        slotPane.querySelectorAll("[data-slot-id]").forEach((b) => {
          const match = slots.find((s) => String(s.id) === b.dataset.slotId);
          b.addEventListener("click", () => {
            state.selectedSlot = match;
            setStep(3);
          });
        });
      } catch (e) {
        document.getElementById("slot-pane").innerHTML = `<p class="muted">Не удалось загрузить расписание. Попробуйте обновить страницу.</p>`;
      }
    }

    if (state.step === 3) {
      if (!state.selectedSlot) { setStep(2); return; }
      const doc = LOTUS.doctors.find((d) => d.id === state.doc);
      const dept = LOTUS.departments.find((d) => d.id === state.dept);
      const session = await window.lotusSession;

      if (!session || session.role !== "patient") {
        // Booking is tied to a real patient record (medical history, "my
        // appointments"), so we require login — same as a real clinic's
        // patient portal. Carry the chosen slot through to the login page.
        const resume = new URLSearchParams({ resumeSlotId: state.selectedSlot.id, resumeDoc: state.doc }).toString();
        pane.innerHTML = `
          <h3>${doc ? doc.name : ""} — ${fmtSlot(state.selectedSlot.slotAt)}</h3>
          <p class="lead" style="margin-top:12px">Чтобы подтвердить визит, войдите в личный кабинет или зарегистрируйтесь — это займёт меньше минуты. Мы сохраним выбранное время.</p>
          <div style="display:flex;gap:10px;margin-top:16px">
            <a class="btn gold" href="cabinet.html?auth=login&${resume}">Войти</a>
            <a class="btn ghost" href="cabinet.html?auth=register&${resume}">Регистрация</a>
          </div>
          <p style="margin-top:14px"><button class="btn ghost" type="button" id="back">Назад, выбрать другое время</button></p>`;
        document.getElementById("back")?.addEventListener("click", () => setStep(2));
        return;
      }

      pane.innerHTML = `
        <h3>${doc ? doc.name : ""} — ${fmtSlot(state.selectedSlot.slotAt)}</h3>
        <form class="form-grid" id="final" style="margin-top:16px">
          <label style="grid-column:1/-1">Повод обращения<textarea id="note" placeholder="Коротко опишите, что беспокоит (необязательно)">${state.reason}</textarea></label>
          <div style="grid-column:1/-1;display:flex;gap:10px">
            <button class="btn ghost" type="button" id="back">Назад</button>
            <button class="btn gold" type="submit">Подтвердить визит</button>
          </div>
          <p class="auth-error" id="book-error" role="alert" style="grid-column:1/-1"></p>
        </form>`;
      document.getElementById("back")?.addEventListener("click", () => setStep(2));
      document.getElementById("final").addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = e.target.querySelector("button[type=submit]");
        const errEl = document.getElementById("book-error");
        state.reason = document.getElementById("note").value.trim();
        submitBtn.disabled = true;
        submitBtn.textContent = "Сохраняем…";
        try {
          const res = await lotusApi("/appointments", { method: "POST", body: { slotId: state.selectedSlot.id, reason: state.reason || undefined } });
          const appt = res.appointment;
          pane.innerHTML = `
            <h3>Визит забронирован</h3>
            <p class="lead">${fmtSlot(appt.scheduledAt)} · ${appt.doctor ? appt.doctor.name : doc?.name || ""}.</p>
            <p class="muted">Приходите за 15 минут. ${LOTUS.brand.address}.</p>
            <a class="btn gold" href="cabinet.html">Открыть личный кабинет</a>`;
          toast("Запись подтверждена");
        } catch (err) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Подтвердить визит";
          if (err.status === 409) {
            errEl.textContent = "Это время уже заняли. Пожалуйста, выберите другое.";
            setTimeout(() => setStep(2), 1600);
          } else if (err.status === 401) {
            errEl.textContent = "Сессия истекла. Войдите снова.";
          } else {
            errEl.textContent = err.message || "Не удалось сохранить запись. Попробуйте ещё раз.";
          }
        }
      });
    }
  }

  // Resume a booking after the user was sent to log in/register mid-flow.
  async function resumeFromLoginRedirect() {
    const resumeSlotId = params.get("resumeSlotId");
    const resumeDoc = params.get("resumeDoc");
    if (!resumeSlotId || !resumeDoc) return;
    const session = await window.lotusSession;
    if (!session || session.role !== "patient") return; // still not logged in; ignore
    state.doc = resumeDoc;
    const doc = LOTUS.doctors.find((d) => d.id === resumeDoc);
    if (doc) state.dept = doc.dept;
    state.selectedSlot = { id: resumeSlotId, slotAt: new Date().toISOString() };
    try {
      // Re-fetch the slot's real time (we only carried its id through the redirect).
      const res = await lotusApi(`/doctors/${encodeURIComponent(resumeDoc)}/available-slots?days=30`);
      const match = (res.slots || []).find((s) => String(s.id) === String(resumeSlotId));
      if (match) state.selectedSlot = match;
    } catch (e) {
      /* fall through with the placeholder time; booking call will still validate server-side */
    }
    setStep(3);
  }

  lotusReady.then(async () => {
    if (state.doc && !state.slotId) {
      const d = LOTUS.doctors.find((x) => x.id === state.doc);
      if (d) state.dept = d.dept;
    }
    if (params.get("resumeSlotId")) {
      await resumeFromLoginRedirect();
    } else if (state.slotId) {
      // Came from a "nearest free slot" link on doctor.html.
      try {
        const res = await lotusApi(`/doctors/${encodeURIComponent(state.doc)}/available-slots?days=30`);
        const match = (res.slots || []).find((s) => String(s.id) === String(state.slotId));
        if (match) { state.selectedSlot = match; setStep(3); return; }
      } catch (e) { /* ignore and fall through to normal flow */ }
      setStep(2);
    } else if (state.doc) {
      setStep(2);
    } else if (state.dept) {
      setStep(1);
    } else {
      draw();
    }
  });
})();
