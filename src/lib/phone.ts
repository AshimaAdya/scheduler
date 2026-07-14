/**
 * Phone normalization to E.164 (e.g. +16045551234).
 *
 * Lightweight and North-America-first (the pilot business is in BC): a bare
 * 10-digit number is assumed +1. An 11-digit number starting with 1 is treated
 * as North American. Input already in +<country><number> form is validated and
 * kept. Anything else is rejected with a clear message. If the app ever goes
 * multi-region, swap this for libphonenumber-js behind the same interface.
 */
export type PhoneResult =
  | { ok: true; e164: string }
  | { ok: false; error: string };

const E164 = /^\+[1-9]\d{7,14}$/;

export function normalizeToE164(input: string): PhoneResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "Enter a phone number." };

  const hadPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");

  if (digits.length === 0) {
    return { ok: false, error: "Enter a valid phone number." };
  }

  let candidate: string;
  if (hadPlus) {
    // Already international — keep the country code as given.
    candidate = `+${digits}`;
  } else if (digits.length === 10) {
    // North American local number.
    candidate = `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith("1")) {
    candidate = `+${digits}`;
  } else {
    return {
      ok: false,
      error:
        "Enter a 10-digit number, or include a country code like +1 604 555 1234.",
    };
  }

  if (!E164.test(candidate)) {
    return { ok: false, error: "Enter a valid phone number." };
  }
  return { ok: true, e164: candidate };
}
