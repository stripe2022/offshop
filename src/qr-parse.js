// /src/qr-parse.js
// QR esperado: LB|<receipt_id>|<token>

export function parseLazyQR(text) {
  const raw = String(text || "").trim();
  const parts = raw.split("|");

  if (parts.length !== 3 || parts[0] !== "LB") {
    throw new Error("QR inválido. Formato esperado: LB|<receipt_id>|<token>");
  }

  const receipt_id = (parts[1] || "").trim();
  const token = (parts[2] || "").trim();

  if (!receipt_id || !token) {
    throw new Error("QR incompleto: falta receipt_id o token");
  }

  return { receipt_id, token, raw };
}
