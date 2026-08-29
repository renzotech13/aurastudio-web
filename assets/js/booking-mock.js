/* =========================================================================
   SIMULADOR DEL BOT — solo para desarrollo.

   Se activa únicamente con ?mock=1 en la URL; en producción no hace nada.
   Sirve para probar el modal completo mientras bot.aurastudio.pe no exista.
   BORRAR este archivo (y su <script>) cuando el bot esté desplegado.

   Reproduce el contrato real:
     GET  /public/disponibilidad -> [{fecha, horas:[...]}]
     POST /public/reservas       -> 200 | 409
   respetando el horario de Aura (10:00–21:00 todos los días) y las políticas
   de bot/src/config/business.ts (buffer 15 min, 2 h de anticipación, slots
   cada 30 min).

   Con ?mock=409 la primera reserva siempre choca, para probar ese camino.
   ========================================================================= */
(function () {
  "use strict";
  const params = new URLSearchParams(location.search);
  if (params.get("mock") !== "1" && params.get("mock") !== "409") return;

  const FORZAR_409 = params.get("mock") === "409";
  const ABRE = 10 * 60, CIERRA = 21 * 60;      // 10:00–21:00
  const BUFFER = 15, LEAD = 120, PASO = 30;    // = config/business.ts
  let yaChoco = false;

  const durDe = (ids) => (ids || []).reduce((t, id) => {
    const s = (window.AURA_SERVICIOS || []).find((x) => x.id === id);
    return t + (s ? s.min : 60);
  }, 0);

  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  /** Ocupación pseudoaleatoria pero estable por fecha, para que recargar no
   *  cambie los huecos y se vea como una agenda de verdad. */
  function ocupado(fecha, minuto) {
    let h = 0;
    const clave = fecha + ":" + minuto;
    for (let i = 0; i < clave.length; i++) h = (h * 31 + clave.charCodeAt(i)) >>> 0;
    return (h % 100) < 45;
  }

  function horasDe(fecha, dur) {
    const hoy = new Date();
    const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    const minAhora = hoy.getHours() * 60 + hoy.getMinutes();

    // un día de cada siete sin cupos, para ver el estado "día lleno"
    const d = new Date(fecha + "T12:00:00");
    if (d.getDay() === 2) return [];

    const out = [];
    for (let m = ABRE; m + dur + BUFFER <= CIERRA; m += PASO) {
      if (fecha === iso && m < minAhora + LEAD) continue;   // anticipación mínima
      if (fecha < iso) continue;
      if (ocupado(fecha, m)) continue;
      out.push(hhmm(m));
    }
    return out;
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";

    if (url.includes("/public/disponibilidad")) {
      const u = new URL(url, location.origin);
      const ids = (u.searchParams.get("servicio_ids") || "").split(",").filter(Boolean);
      const desde = u.searchParams.get("fecha_desde");
      const hasta = u.searchParams.get("fecha_hasta");
      const dur = durDe(ids);

      const out = [];
      for (let d = new Date(desde + "T12:00:00"); ; d.setDate(d.getDate() + 1)) {
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        out.push({ fecha: iso, horas: horasDe(iso, dur) });
        if (iso >= hasta) break;
      }
      await new Promise((r) => setTimeout(r, 420));       // latencia realista
      console.info("[mock] disponibilidad", { ids, dur, dias: out.length });
      return new Response(JSON.stringify(out), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (url.includes("/public/reservas")) {
      await new Promise((r) => setTimeout(r, 600));
      if (FORZAR_409 && !yaChoco) {
        yaChoco = true;
        console.info("[mock] reserva -> 409 (horario ocupado)");
        return new Response(JSON.stringify({ error: "slot_taken" }), { status: 409 });
      }
      console.info("[mock] reserva -> 200", init && init.body);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    return originalFetch(input, init);
  };

  console.info("%c[mock] Simulador del bot activo — ?mock=1", "color:#C89116;font-weight:600");
})();
