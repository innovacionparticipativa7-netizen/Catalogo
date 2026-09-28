(function () {

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js")
      .then(reg => {
        console.log("[App] PWA activa ✅");
        navigator.serviceWorker.addEventListener("message", e => {
          if (e.data?.tipo === "sincronizar") {
            subirIngresosPendientes();
          }
        });
      })
      .catch(err => console.error("[App] Error PWA:", err));
  }

  window.addEventListener("online", () => {
    console.log("[App] Internet restaurado, sincronizando...");
    subirIngresosPendientes();
    actualizarUsuariosOffline();

    if ("serviceWorker" in navigator && "SyncManager" in window) {
      navigator.serviceWorker.ready.then(reg => {
        reg.sync.register("sync-ingresos").catch(() => {});
      });
    }
  });

  async function subirIngresosPendientes() {
    const pendientes = JSON.parse(localStorage.getItem("ingresosPendientes") || "[]");
    if (!pendientes.length) return;
    if (typeof firebase === "undefined") return;

    const db = firebase.firestore();
    const exitosos = [];

    for (const ingreso of pendientes) {
      try {
        await db.collection("ingresos").add({
          empleadoId: ingreso.empleadoId,
          nombre: ingreso.nombre,
          fecha: new Date(ingreso.fecha || Date.now()),
          origen: ingreso.origen || "offline",
          modo: ingreso.modo || "pendiente"
        });
        exitosos.push(ingreso);
      } catch (err) {
        console.warn("[App] No se pudo subir ingreso:", err);
      }
    }

    const restantes = pendientes.filter(p => !exitosos.includes(p));
    localStorage.setItem("ingresosPendientes", JSON.stringify(restantes));

    if (exitosos.length > 0) {
      console.log(`[App] ${exitosos.length} ingreso(s) sincronizado(s) ✅`);
    }
  }

let actualizandoUsuariosOffline = false;

// Renovar el respaldo offline como máximo una vez por hora.
const INTERVALO_USUARIOS_OFFLINE = 60 * 60 * 1000;

async function actualizarUsuariosOffline() {
  if (actualizandoUsuariosOffline) return;
  if (!navigator.onLine) return;
  if (typeof firebase === "undefined") return;
  if (!firebase.apps.length) return;

  actualizandoUsuariosOffline = true;

  try {
    const ultimaActualizacion = Number(
      localStorage.getItem("usuariosOfflineActualizadoMs") || 0
    );

    const respaldo = localStorage.getItem("usuariosOffline");

    let respaldoValido = false;

    if (respaldo) {
      try {
        respaldoValido = Array.isArray(JSON.parse(respaldo));
      } catch {
        respaldoValido = false;
      }
    }

    const tiempoTranscurrido =
      Date.now() - ultimaActualizacion;

    if (
      respaldoValido &&
      ultimaActualizacion > 0 &&
      tiempoTranscurrido >= 0 &&
      tiempoTranscurrido < INTERVALO_USUARIOS_OFFLINE
    ) {
      console.log(
        "[App] Respaldo de usuarios reciente; se omite la descarga."
      );
      return;
    }

    const db = firebase.firestore();

    const snapshot = await db
      .collection("usuarios")
      .get({ source: "server" });

    const usuarios = snapshot.docs.map(doc => {
      const data = doc.data();

      return {
        ...data,
        id: doc.id,
        controlNormalizado: String(data.control || "")
          .trim()
          .replace(/\D/g, "")
          .replace(/^0+/, "")
      };
    });

    localStorage.setItem(
      "usuariosOffline",
      JSON.stringify(usuarios)
    );

    localStorage.setItem(
      "usuariosOfflineFecha",
      new Date().toLocaleString()
    );

    localStorage.setItem(
      "usuariosOfflineActualizadoMs",
      String(Date.now())
    );

    console.log(
      `[App] ${usuarios.length} usuarios guardados offline.`
    );
  } catch (error) {
    console.warn(
      "[App] No se pudo actualizar el respaldo offline:",
      error
    );
  } finally {
    actualizandoUsuariosOffline = false;
  }
}

  window.addEventListener("load", () => {
    if (navigator.onLine) {
      subirIngresosPendientes();
      actualizarUsuariosOffline();
    }
  });

})();
