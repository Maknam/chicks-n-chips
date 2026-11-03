// Private receipt capabilities. A guest can view/track an order only with its token.
// Tokens are derived (HMAC of the order id), so nothing secret is stored in the database
// and a retried checkout can return the same link. Rotating RECEIPT_SECRET invalidates all links.
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config";

const key = () => process.env.RECEIPT_SECRET || `receipt:${config.authSecret()}`;

export const receiptToken = (orderId: string) =>
  createHmac("sha256", key()).update(`receipt:${orderId}`).digest("base64url");

export function validReceiptToken(orderId: string, token: string | null) {
  if (!token) return false;
  const expected = Buffer.from(receiptToken(orderId));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
