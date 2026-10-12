/* IP — reducción de lecturas, 2026-10-12.
 * Sin descargas automáticas de la colección usuarios.
 * El login consulta directamente al empleado; el respaldo anterior se conserva.
 */
(function () {
  'use strict';
  if (window.IPSync) return;
  const CLAVE_PENDIENTES = 'ingresosPendientes';
  const INTERVALO_USUARIOS_OFFLINE = 24 * 60 * 60 * 1000;
  let sincronizando = false;
  let actualizandoUsuariosOffline = false;

  function baseDisponible() {
    return navigator.onLine && typeof firebase !== 'undefined' && firebase.apps.length > 0;
  }
  function leerPendientes() {
    const lista = JSON.parse(localStorage.getItem(CLAVE_PENDIENTES) || '[]');
    if (!Array.isArray(lista)) throw new Error('La lista de ingresos pendientes no es válida. Se conserva para revisión.');
    return lista;
  }
  function guardarPendientes(lista) {
    localStorage.setItem(CLAVE_PENDIENTES, JSON.stringify(lista));
  }
  function nuevoId() {
    if (typeof crypto.randomUUID === 'function') return 'offline_' + crypto.randomUUID();
    return 'offline_' + Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  }
  async function subirIngresosPendientes() {
    if (sincronizando || !baseDisponible()) return;
    sincronizando = true;
    try {
      if (!leerPendientes().length) return;
      // Un bloqueo compartido evita que dos pestañas envíen la misma cola.
      if (!navigator.locks?.request) {
        console.warn('[App] Este navegador no admite sincronización segura entre pestañas. Los pendientes se conservan; abre la página en Edge o Chrome actualizado.');
        return;
      }
      await navigator.locks.request('ip-ingresos-pendientes-v2', {ifAvailable:true}, async lock => {
        if (!lock || !baseDisponible()) return;
        const pendientes = leerPendientes();
        if (!pendientes.length) return;
        const ids = new Set();
        for (const ingreso of pendientes) {
          if (!ingreso || typeof ingreso !== 'object' || Array.isArray(ingreso)) throw new Error('Ingreso pendiente inválido; no se modificó la cola.');
          if (!/^offline_[a-zA-Z0-9-]{16,}$/.test(ingreso._ipSyncId || '') || ids.has(ingreso._ipSyncId)) ingreso._ipSyncId = nuevoId();
          ids.add(ingreso._ipSyncId);
          if (!ingreso.fecha) ingreso.fecha = new Date().toISOString();
        }
        // Persistir ID ANTES del envío permite reintentar sin crear otro documento.
        guardarPendientes(pendientes);
        const db = firebase.firestore();
        let exitosos = 0;
        for (const ingreso of pendientes) {
          if (!navigator.onLine) break;
          const fecha = new Date(ingreso.fecha);
          if (Number.isNaN(fecha.getTime()) || !String(ingreso.empleadoId || '').trim()) {
            console.warn('[App] Ingreso pendiente sin fecha o empleado válido. Se conserva para revisión.');
            continue;
          }
          try {
            await db.collection('ingresos').doc(ingreso._ipSyncId).set({
              empleadoId: ingreso.empleadoId,
              nombre: ingreso.nombre || '',
              fecha,
              origen: ingreso.origen || 'offline',
              modo: ingreso.modo || 'pendiente'
            });
            // Releer: no sobrescribir ingresos añadidos mientras esperábamos a Firebase.
            guardarPendientes(leerPendientes().filter(p => p._ipSyncId !== ingreso._ipSyncId));
            exitosos++;
          } catch (error) {
            console.warn('[App] Sincronización detenida; el ingreso se conserva para reintentar con el mismo ID.', error);
            break;
          }
        }
        if (exitosos) console.log(`[App] ${exitosos} ingreso(s) sincronizado(s).`);
      });
    } catch (error) {
      console.warn('[App] No se pudo sincronizar; no se descartan pendientes.', error);
    } finally { sincronizando = false; }
  }

  // Respaldo opcional, exclusivamente manual. Nunca se invoca en load/online.
  // Mantiene las claves existentes por compatibilidad con otras páginas.
  async function actualizarUsuariosOffline() {
    if (actualizandoUsuariosOffline || !baseDisponible()) return;
    let usuario;
    try { usuario = JSON.parse(sessionStorage.getItem('usuario') || 'null'); } catch { return; }
    if (usuario?.rol !== 'admin') return;
    if (!navigator.locks?.request) return;
    if (!window.confirm('Actualizar el respaldo offline descarga TODOS los usuarios y consume lecturas de Firebase. El ingreso normal no necesita este respaldo. ¿Continuar?')) return;
    actualizandoUsuariosOffline = true;
    try {
      await navigator.locks.request('ip-respaldo-usuarios-v2', {ifAvailable:true}, async lock => {
        if (!lock) return;
        const ultima = Number(localStorage.getItem('usuariosOfflineActualizadoMs') || 0);
        let respaldo;
        try { respaldo = JSON.parse(localStorage.getItem('usuariosOffline') || 'null'); } catch {}
        const edad = Date.now() - ultima;
        if (Array.isArray(respaldo) && ultima > 0 && edad >= 0 && edad < INTERVALO_USUARIOS_OFFLINE) {
          console.log('[App] Ya existe un respaldo de menos de 24 horas. No se descargaron usuarios.');
          return;
        }
        const snapshot = await firebase.firestore().collection('usuarios').get({source:'server'});
        const usuarios = snapshot.docs.map(doc => {
          const data = doc.data();
          return {...data, id:doc.id, controlNormalizado:String(data.control || '').trim().replace(/\D/g, '').replace(/^0+/, '')};
        });
        localStorage.setItem('usuariosOffline', JSON.stringify(usuarios));
        localStorage.setItem('usuariosOfflineFecha', new Date().toLocaleString());
        localStorage.setItem('usuariosOfflineActualizadoMs', String(Date.now()));
        console.log(`[App] Respaldo manual: ${usuarios.length} usuarios.`);
      });
    } catch (error) { console.warn('[App] No se pudo actualizar el respaldo offline.', error); }
    finally { actualizandoUsuariosOffline = false; }
  }

  window.IPSync = Object.freeze({subirIngresosPendientes, actualizarUsuariosOffline});
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.tipo === 'sincronizar') void subirIngresosPendientes();
    });
    navigator.serviceWorker.register('./service-worker.js')
      .then(() => console.log('[App] PWA activa.'))
      .catch(error => console.warn('[App] No se pudo registrar la PWA.', error));
  }
  window.addEventListener('online', () => {
    void subirIngresosPendientes();
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then(reg => {
        if (reg.sync) return reg.sync.register('sync-ingresos');
      }).catch(error => console.warn('[App] Sincronización de fondo no disponible.', error));
    }
  });
  if (document.readyState === 'complete') void subirIngresosPendientes();
  else window.addEventListener('load', () => { void subirIngresosPendientes(); }, {once:true});
})();
