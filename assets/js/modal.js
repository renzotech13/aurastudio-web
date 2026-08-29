/* =========================================================================
   Modales — Aura Studio no tenía ninguno, así que este es el sistema base.
   Expone window.AURA.openModal / closeModal, y escucha el evento
   'aura:reservar' para abrir la reserva desde cualquier botón del sitio.
   ========================================================================= */
(function () {
  "use strict";

  const abiertos = [];

  function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add("open");
    document.body.classList.add("is-locked");
    if (!abiertos.includes(id)) abiertos.push(id);
    // Lenis sigue capturando la rueda mientras el modal está abierto: si no se
    // detiene, el scroll dentro del modal mueve la página de atrás.
    if (window.auraLenis) window.auraLenis.stop();
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove("open");
    const i = abiertos.indexOf(id);
    if (i >= 0) abiertos.splice(i, 1);
    if (!abiertos.length) {
      document.body.classList.remove("is-locked");
      if (window.auraLenis) window.auraLenis.start();
    }
  }

  window.AURA = { openModal, closeModal };

  document.addEventListener("click", (e) => {
    const closer = e.target.closest("[data-close-modal]");
    if (closer) {
      const modal = closer.closest(".modal");
      if (modal) closeModal(modal.id);
      return;
    }
    // clic en el fondo cierra
    if (e.target.classList && e.target.classList.contains("modal")) {
      closeModal(e.target.id);
      return;
    }
    // cualquier botón/enlace marcado abre la reserva, con servicio opcional
    const trigger = e.target.closest("[data-open-booking]");
    if (trigger) {
      e.preventDefault();
      const svc = trigger.getAttribute("data-servicio");
      window.dispatchEvent(new CustomEvent("aura:reservar", {
        detail: svc ? { servicio: svc } : {}
      }));
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && abiertos.length) closeModal(abiertos[abiertos.length - 1]);
  });
})();
