// /src/receipt-scans.js
// Inserta en public.lb_receipt_scans y evita duplicados

import { SB } from "./supabase.js";

function headers() {
  return {
    apikey: SB.ANON,
    Authorization: `Bearer ${SB.ANON}`,
    "Content-Type": "application/json",
    Prefer: "return=representation"
  };
}

export function getDeviceId() {
  const KEY = "OFFSHOP_DEVICE_ID";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto?.randomUUID ? crypto.randomUUID() : `dev_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

// ✅ Verifica si ya existe scan para ese receipt_id
export async function wasReceiptScanned(receipt_id) {
  const url =
    `${SB.URL}/rest/v1/lb_receipt_scans` +
    `?receipt_id=eq.${encodeURIComponent(receipt_id)}` +
    `&select=id,scanned_at,device_id` +
    `&limit=1`;

  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`No se pudo verificar scans: ${res.status} ${t}`);
  }

  const rows = await res.json();
  return rows?.[0] || null; // null si no existe
}

// ✅ Inserta el scan (si tu tabla tiene default en scanned_at, no lo mandes)
export async function insertReceiptScan({ receipt_id, token, meta = {} }) {
  const device_id = getDeviceId();

  const payload = {
    receipt_id,
    device_id,
    meta: {
      source_app: "offshop",
      token, // útil para auditoría (si no quieres guardarlo, quítalo)
      ...meta
    }
    // scanned_at: lo deja default NOW() si tu columna tiene default
  };

  const url = `${SB.URL}/rest/v1/lb_receipt_scans`;

  const res = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`No se pudo registrar scan: ${res.status} ${t}`);
  }

  const rows = await res.json().catch(() => []);
  return rows?.[0] || null;
}
