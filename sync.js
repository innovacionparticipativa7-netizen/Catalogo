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

  async function actualizarUsuariosOffline() {
    if (typeof firebase === "undefined") return;
    const db = firebase.firestore();

    try {
      const snapshot = await db.collection("usuarios").get();
      const usuarios = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          controlNormalizado: String(data.control || "").trim().replace(/\D/g, "").replace(/^0+/, "")
        };
      });
      localStorage.setItem("usuariosOffline", JSON.stringify(usuarios));
      localStorage.setItem("usuariosOfflineFecha", new Date().toLocaleString());
      console.log(`[App] ${usuarios.length} usuario(s) guardados offline ✅`);
    } catch (err) {
      console.warn("[App] No se pudo actualizar usuarios offline:", err);
    }
  }

  window.addEventListener("load", () => {
    if (navigator.onLine) {
      subirIngresosPendientes();
      actualizarUsuariosOffline();
    }
  });

})();