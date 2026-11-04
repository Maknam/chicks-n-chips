// QR codes as inline SVG, generated synchronously in the browser (no network, nothing stored).
// Used on the confirmation screen, the receipt page and printed receipts.
import QRCode from "qrcode";

/** SVG markup for `text`. Dark modules as one path; a 4-module quiet zone as the spec requires. */
export function qrSvg(text: string, opts: { size?: number; label?: string } = {}) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = modules.size;
  const quiet = 4;
  const total = n + quiet * 2;
  let d = "";
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) if (modules.get(y, x)) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
  const size = opts.size ?? 160;
  const label = (opts.label ?? "QR code").replace(/[<>&"]/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" role="img" aria-label="${label}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
