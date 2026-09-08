/* Game ids are the invite link, so they must not be guessable by counting. Six
   characters from a 32-symbol alphabet is ~1.07e9 combinations — enough that
   scanning for a live game is pointless, short enough to read down a phone line.

   Crockford's base32: no I, L, O or U. The first three because they are unreadable
   next to 1 and 0 in most fonts, and U so the generator cannot spell anything a
   player would rather not send to a friend. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function gameId(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

/** Case-insensitive: a link typed by hand should still work. */
export function normaliseGameId(raw: string): string {
  return raw.trim().toUpperCase();
}

export function looksLikeGameId(raw: string): boolean {
  const id = normaliseGameId(raw);
  return id.length >= 4 && id.length <= 12 && [...id].every((c) => ALPHABET.includes(c));
}
