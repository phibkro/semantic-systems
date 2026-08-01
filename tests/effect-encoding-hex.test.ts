import { describe, expect, test } from "bun:test";
import { Encoding } from "effect";

const hexadecimalDigits = "0123456789abcdef";

/** Independent specification oracle; it intentionally shares no production helper. */
const legacyHexOracle = (bytes: Uint8Array): string => {
  let output = "";
  for (const byte of bytes) {
    output += hexadecimalDigits[Math.floor(byte / 16)]!;
    output += hexadecimalDigits[byte % 16]!;
  }
  return output;
};

describe("Effect hexadecimal encoding consolidation", () => {
  test("matches the independent legacy oracle for every one-byte value", () => {
    for (let byte = 0; byte <= 0xff; byte += 1) {
      const input = Uint8Array.of(byte);
      expect(Encoding.encodeHex(input)).toBe(legacyHexOracle(input));
    }
  });

  test("preserves empty, leading-zero, nibble-boundary, and mixed vectors", () => {
    const vectors = [
      new Uint8Array(),
      Uint8Array.of(0x00, 0x00, 0x01),
      Uint8Array.of(0x0f, 0x10, 0x7f, 0x80, 0xfe, 0xff),
      Uint8Array.of(0xde, 0xad, 0xbe, 0xef),
    ] as const;

    for (const input of vectors) {
      const encoded = Encoding.encodeHex(input);
      expect(encoded).toBe(legacyHexOracle(input));
      expect(encoded).toHaveLength(input.byteLength * 2);
      expect(encoded).toMatch(/^[0-9a-f]*$/);
    }
  });
});
