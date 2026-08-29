/* =========================================================================
   Reserva de cita — modal de 4 pasos sobre la portada, nunca navega fuera.
   La disponibilidad y la reserva pasan por el bot (mismo motor que WhatsApp),
   así una reserva web y una por WhatsApp compiten por el mismo horario real.

   Contrato del bot (ya validado en dos despliegues):
     GET  /public/disponibilidad?servicio_ids=<csv>&fecha_desde=&fecha_hasta=
          -> [{fecha:"YYYY-MM-DD", horas:["10:00", ...]}]
     POST /public/reservas  {servicio_ids, fecha, hora, nombre, telefono,
                             primera_visita?, comentario?}
          -> 200 creada | 409 el horario se acaba de ocupar
   ========================================================================= */
(function () {
  "use strict";

  const BOT_API_URL = window.AURA_BOT_API || "https://bot.aurastudio.pe";
  const WA_NUMERO = "51934641018";
  const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  const $ = (s, c) => (c || document).querySelector(s);
  const body = $("#bkBody");
  const foot = $("#bkFoot");
  const stepsEl = $("#bkSteps");
  const backBtn = $("#bkBack");
  const nextBtn = $("#bkNext");
  const summaryEl = $("#bkSummary");
  if (!body) return;

  const state = {
    step: 1,
    categorias: [], servicios: [], cargandoCatalogo: true,
    filtro: "todos", serviceIds: [],
    dayOffset: 0, dateIdx: null, time: null, firstVisit: null,
    nombre: "", telefono: "", comentario: "",
    disponibilidad: {}, dispLoading: false, dispError: false,
    enviando: false, error: null, confirmada: false
  };

  /* ------------------------------ datos ------------------------------ */
  /** Catálogo local generado desde la migración 0007. Se usa mientras el
   *  Supabase de Aura no esté sembrado, y como respaldo si deja de responder. */
  function catalogoLocal() {
    state.categorias = (window.AURA_CATEGORIAS || []).slice();
    state.servicios = (window.AURA_SERVICIOS || []).slice();
  }

  async function cargarCatalogo() {
    catalogoLocal();
    // Si algún día el sitio expone el catálogo desde Supabase, se engancha acá
    // (fetchServiceGroups) y el local queda solo como respaldo.
    state.cargandoCatalogo = false;
  }

  async function cargarDisponibilidad() {
    if (!state.serviceIds.length) return;
    state.dispLoading = true;
    state.dispError = false;
    render();
    const days = getDays();
    const desde = toISO(days[0]);
    const hasta = toISO(days[days.length - 1]);
    try {
      const url = `${BOT_API_URL}/public/disponibilidad`
        + `?servicio_ids=${encodeURIComponent(state.serviceIds.join(","))}`
        + `&fecha_desde=${desde}&fecha_hasta=${hasta}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("bad_status");
      const data = await res.json();
      const mapa = {};
      data.forEach((d) => { mapa[d.fecha] = d.horas; });
      state.disponibilidad = mapa;
    } catch (e) {
      state.dispError = true;
    }
    state.dispLoading = false;
    render();
  }

  async function enviarReserva() {
    state.enviando = true;
    state.error = null;
    render();
    const days = getDays();
    try {
      const res = await fetch(`${BOT_API_URL}/public/reservas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          servicio_ids: state.serviceIds,
          fecha: toISO(days[state.dateIdx]),
          hora: state.time,
          nombre: state.nombre.trim(),
          telefono: normalizarTelefono(state.telefono.trim()),
          primera_visita: state.firstVisit === "si" ? true : state.firstVisit === "no" ? false : null,
          comentario: state.comentario || undefined
        })
      });
      if (res.status === 409) {
        // Alguien tomó ese horario mientras la clienta llenaba el formulario.
        state.enviando = false;
        state.error = "Ese horario se acaba de ocupar. Elige otro, por favor.";
        state.step = 2;
        state.time = null;
        await cargarDisponibilidad();
        return;
      }
      if (!res.ok) throw new Error("bad_status");
    } catch (e) {
      state.enviando = false;
      state.error = "No pudimos enviar tu solicitud. Revisa tu conexión e inténtalo de nuevo.";
      render();
      return;
    }
    state.enviando = false;
    state.confirmada = true;
    render();
  }

  /* ------------------------------ utilidades ------------------------------ */
  function serviciosElegidos() {
    return state.serviceIds
      .map((id) => state.servicios.find((s) => s.id === id))
      .filter(Boolean);
  }
  function total() {
    return serviciosElegidos().reduce((t, s) => t + (parseFloat(s.precio) || 0), 0);
  }
  function duracionTotal() {
    return serviciosElegidos().reduce((t, s) => t + (s.min || 0), 0);
  }
  function fmtDur(n) {
    const h = Math.floor(n / 60), m = n % 60;
    if (h && m) return `${h} h ${m} min`;
    if (h) return `${h} h`;
    return `${m} min`;
  }
  function getDays() {
    const hoy = new Date();
    const days = [];
    for (let i = 0; i < 10; i++) {
      const d = new Date(hoy);
      d.setDate(hoy.getDate() + state.dayOffset + i);
      days.push(d);
    }
    return days;
  }
  function toISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function normalizarTelefono(raw) {
    const soloDigitos = raw.replace(/\D/g, "");
    return soloDigitos.startsWith("51") ? soloDigitos : `51${soloDigitos}`;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  /** Respaldo: si el motor de agenda no responde, la clienta igual puede
   *  reservar por WhatsApp con su selección ya escrita en el mensaje. */
  function waLink(extra) {
    const nombres = serviciosElegidos().map((s) => s.nombre).join(", ");
    const texto = extra || (nombres
      ? `Hola, quisiera agendar una cita en Aura Studio para: ${nombres}`
      : "Hola, quisiera agendar una cita en Aura Studio");
    return `https://wa.me/${WA_NUMERO}?text=${encodeURIComponent(texto)}`;
  }
  function precio(p) {
    const n = parseFloat(p);
    return isNaN(n) ? "Consultar" : "S/ " + n;
  }

  /* ------------------------------ pasos ------------------------------ */
  function paso1() {
    if (state.cargandoCatalogo) return '<p class="loading">Cargando la carta…</p>';

    const chips = [{ id: "todos", icon: "", titulo: "Todos" }]
      .concat(state.categorias)
      .map((c) => `<button class="chip${state.filtro === c.id ? " on" : ""}" data-filtro="${esc(c.id)}">${
        c.icon ? esc(c.icon) + " " : ""}${esc(c.titulo)}</button>`).join("");

    const cats = state.filtro === "todos"
      ? state.categorias
      : state.categorias.filter((c) => c.id === state.filtro);

    const bloques = cats.map((c) => {
      const svcs = state.servicios.filter((s) => s.cat === c.id);
      if (!svcs.length) return "";
      return `
        <p class="grp-t">${esc(c.titulo)}</p>
        <div class="svc-list">
          ${svcs.map((s) => `
            <button class="svc${state.serviceIds.includes(s.id) ? " on" : ""}" data-servicio="${esc(s.id)}">
              <span>
                <span class="svc-n">${esc(s.nombre)}</span>
                <span class="svc-d">${esc(s.duracion)}${s.desc ? " · " + esc(s.desc) : ""}</span>
              </span>
              <span class="svc-p">${precio(s.precio)}</span>
            </button>`).join("")}
        </div>`;
    }).join("");

    return `
      <h2 class="bk-h">Elige tu servicio</h2>
      <p class="bk-sub">Puedes combinar varios; sumamos la duración para buscarte un horario que alcance.</p>
      <div class="chips">${chips}</div>
      ${bloques}`;
  }

  function paso2() {
    const days = getDays();
    const tarjetas = days.map((d, i) => {
      const iso = toISO(d);
      const horas = state.disponibilidad[iso];
      const sinCupo = !state.dispLoading && Array.isArray(horas) && horas.length === 0;
      return `
        <button class="day${state.dateIdx === i ? " on" : ""}${sinCupo ? " off" : ""}" data-dia="${i}">
          <span class="dw">${WEEKDAYS[d.getDay()]}</span>
          <span class="dd">${d.getDate()}</span>
          <span class="dm">${MONTHS[d.getMonth()]}</span>
        </button>`;
    }).join("");

    let horasHtml = '<p class="loading">Elige un día para ver los horarios libres.</p>';
    if (state.dispLoading) {
      horasHtml = '<p class="loading">Consultando horarios…</p>';
    } else if (state.dispError) {
      horasHtml = `
        <div class="alert">No pudimos consultar la agenda en este momento.</div>
        <div class="bk-actions" style="justify-content:flex-start">
          <button class="chip" data-reintentar>Reintentar</button>
          <a class="btn btn-solid" href="${waLink()}" target="_blank" rel="noopener">Reservar por WhatsApp</a>
        </div>`;
    } else if (state.dateIdx != null) {
      const horas = state.disponibilidad[toISO(days[state.dateIdx])] || [];
      horasHtml = horas.length
        ? `<div class="times">${horas.map((h) =>
            `<button class="time${state.time === h ? " on" : ""}" data-hora="${esc(h)}">${esc(h)}</button>`).join("")}</div>`
        : '<p class="loading">Ese día ya no tiene cupos. Prueba con otro.</p>';
    }

    return `
      <h2 class="bk-h">Fecha y hora</h2>
      <p class="bk-sub">Horarios reales: lo que ves libre es lo que hay. Tu cita ocupa ${esc(fmtDur(duracionTotal()))}.</p>
      ${state.error ? `<div class="alert" style="margin-top:16px">${esc(state.error)}</div>` : ""}
      <div class="days-row">
        <button class="chip" data-nav="-1"${state.dayOffset === 0 ? " disabled" : ""}>←</button>
        <div class="days">${tarjetas}</div>
        <button class="chip" data-nav="1">→</button>
      </div>
      ${horasHtml}`;
  }

  function paso3() {
    return `
      <h2 class="bk-h">Cuéntanos</h2>
      <p class="bk-sub">¿Es tu primera vez en Aura Studio?</p>
      <div class="pick" style="margin:18px 0 28px">
        <button data-visita="si" class="${state.firstVisit === "si" ? "on" : ""}">Sí, primera vez</button>
        <button data-visita="no" class="${state.firstVisit === "no" ? "on" : ""}">Ya vine antes</button>
      </div>
      <div class="field">
        <label for="bkComentario">¿Algo que debamos saber? (opcional)</label>
        <textarea id="bkComentario" rows="4" placeholder="Ej. tengo el cabello teñido, soy alérgica a…">${esc(state.comentario)}</textarea>
      </div>`;
  }

  function paso4() {
    const days = getDays();
    const fecha = state.dateIdx != null ? days[state.dateIdx] : null;
    const servicios = serviciosElegidos();
    return `
      <h2 class="bk-h">Tus datos</h2>
      <p class="bk-sub">Te confirmamos la cita por WhatsApp.</p>
      ${state.error ? `<div class="alert" style="margin-top:16px">${esc(state.error)}
        <a href="${waLink()}" target="_blank" rel="noopener">Reservar por WhatsApp</a></div>` : ""}
      <div style="display:flex;gap:28px;flex-wrap:wrap;margin-top:22px">
        <div style="flex:1;min-width:260px">
          <div class="field">
            <label for="bkNombre">Nombre y apellido</label>
            <input id="bkNombre" type="text" autocomplete="name" value="${esc(state.nombre)}" placeholder="Ej. Laura Ballena">
          </div>
          <div class="field">
            <label for="bkTelefono">WhatsApp</label>
            <input id="bkTelefono" type="tel" inputmode="numeric" autocomplete="tel" value="${esc(state.telefono)}" placeholder="987 654 321">
          </div>
        </div>
        <div style="flex:1;min-width:260px">
          <div class="resume">
            ${servicios.map((s) => `<div class="r"><span>${esc(s.nombre)}</span><span>${precio(s.precio)}</span></div>`).join("")}
            <div class="r"><span>Duración</span><span>${esc(fmtDur(duracionTotal()))}</span></div>
            <div class="r"><span>Fecha</span><span>${fecha ? `${WEEKDAYS[fecha.getDay()]} ${fecha.getDate()} ${MONTHS[fecha.getMonth()]}` : "—"}</span></div>
            <div class="r"><span>Hora</span><span>${esc(state.time || "—")}</span></div>
            <div class="r tot"><span>Total</span><span>S/ ${total()}</span></div>
          </div>
          <p class="bk-sub" style="margin-top:12px;font-size:12.5px">Si necesitas cancelar, avísanos con anticipación por WhatsApp.</p>
        </div>
      </div>`;
  }

  function confirmacion() {
    const days = getDays();
    const fecha = days[state.dateIdx];
    return `
      <div class="ok-box">
        <div class="tick">✓</div>
        <h2 class="bk-h">Cita solicitada</h2>
        <p class="bk-sub" style="max-width:46ch">
          Te escribiremos al <strong>${esc(state.telefono)}</strong> para confirmar tu cita del
          ${fecha ? `${WEEKDAYS[fecha.getDay()]} ${fecha.getDate()} de ${MONTHS[fecha.getMonth()]}` : ""}
          a las ${esc(state.time || "")}.
        </p>
        <div class="bk-actions">
          <a class="btn btn-solid" target="_blank" rel="noopener"
             href="${waLink("Hola, acabo de reservar una cita en la web a nombre de " + state.nombre)}">Escribir por WhatsApp</a>
          <button class="btn btn-quiet" data-close-modal>Listo</button>
        </div>
      </div>`;
  }

  /* ------------------------------ render ------------------------------ */
  function puedeAvanzar() {
    if (state.step === 1) return state.serviceIds.length > 0;
    if (state.step === 2) return state.dateIdx != null && !!state.time;
    if (state.step === 3) return !!state.firstVisit;
    if (state.step === 4) {
      return state.nombre.trim().length > 1
        && state.telefono.replace(/\D/g, "").length >= 6
        && !state.enviando;
    }
    return false;
  }

  function render() {
    if (state.confirmada) {
      stepsEl.innerHTML = "";
      foot.style.display = "none";
      body.innerHTML = confirmacion();
      return;
    }
    foot.style.display = "";
    stepsEl.innerHTML = [1, 2, 3, 4].map((n) => `<i class="${n <= state.step ? "on" : ""}"></i>`).join("");
    body.innerHTML = [paso1, paso2, paso3, paso4][state.step - 1]();
    body.scrollTop = 0;

    backBtn.style.visibility = state.step === 1 ? "hidden" : "visible";
    nextBtn.disabled = !puedeAvanzar();
    nextBtn.textContent = state.enviando ? "Enviando…" : state.step === 4 ? "Confirmar cita" : "Continuar";

    const n = state.serviceIds.length;
    summaryEl.textContent = n
      ? `${n} servicio${n > 1 ? "s" : ""} · ${fmtDur(duracionTotal())} · S/ ${total()}`
      : "";
  }

  /* ------------------------------ eventos ------------------------------ */
  body.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-filtro]");
    if (chip) { state.filtro = chip.dataset.filtro; render(); return; }

    const svc = e.target.closest("[data-servicio]");
    if (svc) {
      const id = svc.dataset.servicio;
      state.serviceIds = state.serviceIds.includes(id)
        ? state.serviceIds.filter((x) => x !== id)
        : state.serviceIds.concat(id);
      render();
      return;
    }

    const nav = e.target.closest("[data-nav]");
    if (nav) {
      const dir = Number(nav.dataset.nav);
      state.dayOffset = Math.max(0, state.dayOffset + dir * 6);
      state.dateIdx = null; state.time = null;
      cargarDisponibilidad();
      return;
    }

    const dia = e.target.closest("[data-dia]");
    if (dia) { state.dateIdx = Number(dia.dataset.dia); state.time = null; render(); return; }

    if (e.target.closest("[data-reintentar]")) { cargarDisponibilidad(); return; }

    const hora = e.target.closest("[data-hora]");
    if (hora) { state.time = hora.dataset.hora; render(); return; }

    const visita = e.target.closest("[data-visita]");
    if (visita) { state.firstVisit = visita.dataset.visita; render(); return; }
  });

  body.addEventListener("input", (e) => {
    if (e.target.id === "bkNombre") state.nombre = e.target.value;
    if (e.target.id === "bkTelefono") state.telefono = e.target.value;
    if (e.target.id === "bkComentario") state.comentario = e.target.value;
    if (e.target.id === "bkNombre" || e.target.id === "bkTelefono") {
      nextBtn.disabled = !puedeAvanzar();
    }
  });

  backBtn.addEventListener("click", () => {
    state.step = Math.max(1, state.step - 1);
    state.error = null;
    render();
  });

  nextBtn.addEventListener("click", () => {
    if (!puedeAvanzar()) return;
    if (state.step === 1) { state.step = 2; render(); cargarDisponibilidad(); return; }
    if (state.step === 4) { enviarReserva(); return; }
    state.step += 1;
    render();
  });

  /* ------------------------------ apertura ------------------------------ */
  function abrir(ids) {
    if (state.confirmada) {
      state.confirmada = false;
      state.step = 1; state.serviceIds = []; state.dateIdx = null; state.time = null;
      state.firstVisit = null; state.comentario = ""; state.error = null;
    }
    // Solo se preselecciona lo que existe en el catálogo real: el bot valida
    // los ids contra su tabla `services` y rechaza lo que no reconoce.
    const validos = state.servicios.map((s) => s.id);
    (ids || []).filter((id) => validos.includes(id) && !state.serviceIds.includes(id))
      .forEach((id) => state.serviceIds.push(id));
    window.AURA.openModal("bookingModal");
    render();
  }

  window.addEventListener("aura:reservar", (e) => {
    const d = e.detail || {};
    abrir(d.servicios || (d.servicio ? [d.servicio] : []));
  });

  cargarCatalogo().then(() => {
    const params = new URLSearchParams(location.search);
    const pedidos = (params.get("servicios") || "").split(",").map((x) => x.trim()).filter(Boolean);
    if (location.hash === "#reservar" || pedidos.length) abrir(pedidos);
  });
})();
