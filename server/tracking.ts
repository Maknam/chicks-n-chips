// Server-side tracking code generation. Unbiased rejection sampling over crypto RNG.
import { randomBytes } from "node:crypto";
import { ALPHABET, CODE_LENGTH } from "@/lib/tracking";

export function generateTrackingCode(): string {
  // Largest multiple of 31 below 256: bytes ≥ 248 are rejected so every symbol is equally likely.
  const limit = 256 - (256 % ALPHABET.length);
  let out = "";
  while (out.length < CODE_LENGTH) {
    for (const byte of randomBytes(16)) {
      if (byte >= limit) continue;
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === CODE_LENGTH) break;
    }
  }
  return out;
}
