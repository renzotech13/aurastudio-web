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

  /* Íconos de categoría — Lucide 1.31.0 (lucide.dev), trazado tal cual,
   * copiado a mano de node_modules/lucide-react (sin depender del paquete:
   * este sitio es estático, sin build).
   *
   * La clave es el NOMBRE del ícono ("Scissors", "Palette"…), el mismo que
   * guarda service_categories.icon (ver migración 0013) y el mismo que
   * admin/src/lib/categoryIcons.tsx usa para dibujar el ícono en el panel.
   * Antes la clave era el id de la categoría ("cabello", "color"…): con eso,
   * una categoría nueva creada desde el panel nunca mostraba ícono acá
   * (categoryIcon devolvía ""), aunque en el panel sí se hubiera elegido
   * uno. Si agregas un ícono nuevo al selector del panel, agrégalo también
   * acá con el mismo trazo exacto para que panel y sitio dibujen lo mismo. */
  const CATEGORY_ICONS = {
    Scissors: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
    Palette: '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>',
    Hand: '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    Footprints: '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/>',
    Eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
    Feather: '<path d="M14.086 18.412A2 2 0 0112.67 19H5v-7.672a2 2 0 01.586-1.414L11.75 3.75a6 6 0 118.49 8.49z"/><path d="M16 8 2 22"/><path d="M17.488 15H9"/>',
    Sparkles: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
    Paintbrush: '<path d="m14.622 17.897-10.68-2.913"/><path d="M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z"/><path d="M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15"/>',
    Leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
    Droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
    Flower: '<circle cx="12" cy="12" r="3"/><path d="M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5"/><path d="M12 7.5V9"/><path d="M7.5 12H9"/><path d="M16.5 12H15"/><path d="M12 16.5V15"/><path d="m8 8 1.88 1.88"/><path d="M14.12 9.88 16 8"/><path d="m8 16 1.88-1.88"/><path d="M14.12 14.12 16 16"/>',
    Gem: '<path d="M10.5 3 8 9l4 13 4-13-2.5-6"/><path d="M17 3a2 2 0 0 1 1.6.8l3 4a2 2 0 0 1 .013 2.382l-7.99 10.986a2 2 0 0 1-3.247 0l-7.99-10.986A2 2 0 0 1 2.4 7.8l2.998-3.997A2 2 0 0 1 7 3z"/><path d="M2 9h20"/>',
    SprayCan: '<path d="M3 3h.01"/><path d="M7 5h.01"/><path d="M11 7h.01"/><path d="M3 7h.01"/><path d="M7 9h.01"/><path d="M3 11h.01"/><rect width="4" height="4" x="15" y="5"/><path d="m19 9 2 2v10c0 .6-.4 1-1 1h-6c-.6 0-1-.4-1-1V11l2-2"/><path d="m13 14 8-2"/><path d="m13 19 8-2"/>'
  };
  function categoryIcon(iconKey) {
    const paths = CATEGORY_ICONS[iconKey];
    if (!paths) return "";
    return `<svg class="chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  }

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

    const chips = [{ id: "todos", titulo: "Todos" }]
      .concat(state.categorias)
      .map((c) => `<button class="chip${state.filtro === c.id ? " on" : ""}" data-filtro="${esc(c.id)}">${
        categoryIcon(c.icon)}${esc(c.titulo)}</button>`).join("");

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
        <div class="tick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></div>
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
