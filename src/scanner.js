// /src/scanner.js
// ✅ ZXing UMD compatible
// ✅ NO usa BrowserCodeReader.listVideoInputDevices (porque puede no existir)
// ✅ Usa enumerateDevices + preferencia cámara trasera
// ✅ Cooldown lo controlas en app.js (ya lo tienes)

let reader = null;
let running = false;

async function warmupPermissions() {
  // Esto hace que algunos navegadores revelen los labels de cámaras
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    stream.getTracks().forEach(t => t.stop());
  } catch {
    // si el usuario aún no dio permiso, igual continuamos
  }
}

async function getVideoInputs() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  await warmupPermissions();

  const devices = await navigator.mediaDevices.enumerateDevices();
  return (devices || []).filter(d => d.kind === "videoinput");
}

function pickBackCamera(devices) {
  if (!devices.length) return null;

  // intenta elegir trasera por label
  const back = devices.find(d => /back|rear|environment|trasera/i.test(d.label || ""));
  if (back) return back.deviceId;

  // heurística: a veces la trasera es la última
  return devices[devices.length - 1].deviceId || devices[0].deviceId;
}

export async function startScan({ videoEl, statusEl, onText }) {
  if (!window.ZXing) throw new Error("ZXing no cargado (CDN falló)");
  if (!videoEl) throw new Error("Falta <video>");

  if (!reader) reader = new window.ZXing.BrowserMultiFormatReader();

  running = true;
  videoEl.style.display = "block";

  statusEl && (statusEl.textContent = "⏳ Buscando cámaras...");

  const cams = await getVideoInputs();
  const deviceId = pickBackCamera(cams);

  // Si no detecta deviceId, probamos constraints directo (mejor en móviles)
  if (!deviceId) {
    statusEl && (statusEl.textContent = "📷 Activando cámara (environment)...");
    try {
      await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        videoEl,
        (result) => {
          if (!running) return;
          if (result) {
            const text = result.getText?.() || String(result);
            statusEl && (statusEl.textContent = `✅ QR detectado: ${text}`);
            onText?.(text);
          }
        }
      );
      statusEl && (statusEl.textContent = "📷 Escaneando... apunta al QR");
      return;
    } catch (e) {
      console.error(e);
      throw new Error("No se pudo activar la cámara");
    }
  }

  // Con deviceId seleccionado
  statusEl && (statusEl.textContent = "📷 Activando cámara seleccionada...");

  await reader.decodeFromVideoDevice(
    deviceId,
    videoEl,
    (result) => {
      if (!running) return;
      if (result) {
        const text = result.getText?.() || String(result);
        statusEl && (statusEl.textContent = `✅ QR detectado: ${text}`);
        onText?.(text);
      }
    }
  );

  statusEl && (statusEl.textContent = "📷 Escaneando... apunta al QR");
}

export function stopScan({ videoEl, statusEl }) {
  running = false;

  try {
    if (reader) reader.reset();
  } catch {}

  // Apaga stream si existe
  try {
    const stream = videoEl?.srcObject;
    if (stream && stream.getTracks) {
      stream.getTracks().forEach(t => t.stop());
    }
  } catch {}

  if (videoEl) {
    videoEl.srcObject = null;
    videoEl.style.display = "none";
  }
  statusEl && (statusEl.textContent = "⏹ Scanner detenido");
}
