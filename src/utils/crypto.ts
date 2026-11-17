/**
 * Hachage sécurisé des mots de passe par SHA-256 avec sel aléatoire par utilisateur.
 * Utilise Web Crypto API en priorité et inclut une implémentation SHA-256 pure TS
 * afin de garantir un fonctionnement fiable hors ligne même en contexte HTTP local.
 */

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateSalt(length = 16): string {
  const bytes = new Uint8Array(length);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytesToHex(bytes);
}

function pureSha256(ascii: string): string {
  const rightRotate = (value: number, amount: number) =>
    (value >>> amount) | (value << (32 - amount));

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += '\x80';
  while ((ascii.length % 64) - 56) ascii += '\x00';
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    if (j >> 8) return '';
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];

      const a = hash[0];
      const e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash.unshift((temp1 + temp2) | 0);
      hash[4] = (hash[4] + temp1) | 0;
      hash.pop();
    }

    for (let i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(input);
      const digest = await window.crypto.subtle.digest('SHA-256', data);
      return bytesToHex(new Uint8Array(digest));
    } catch {
      // Fallback if subtle crypto fails in non-secure context
    }
  }
  // Encode UTF-8 string cleanly for pure JS fallback
  const utf8Bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  return pureSha256(binary);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = generateSalt(16);
  // Key stretching via iterated SHA-256 (1 000 rounds) for stronger offline protection
  let current = `${salt}:${password}`;
  for (let i = 0; i < 1000; i++) {
    current = await sha256Hex(current);
  }
  return `sha256$${salt}$${current}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  if (!storedHash) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'sha256') {
    return false;
  }
  const [, salt, expected] = parts;
  let current = `${salt}:${password}`;
  for (let i = 0; i < 1000; i++) {
    current = await sha256Hex(current);
  }
  if (current.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < current.length; i++) {
    diff |= current.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
