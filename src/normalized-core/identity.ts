import { Crypto, Data, Effect } from "effect";
import { canonicalBytes, trustedUint8ArrayCopy, type CanonicalJsonValue } from "./canonical.ts";
import type { Identity } from "./schema.ts";

export const identityDomains = Object.freeze({
  operation: "semantic.normalized-core/operation/v1",
  assumption: "semantic.normalized-core/assumption/v1",
  sourceUnit: "semantic.normalized-core/source-unit/v1",
  semantic: "semantic.normalized-core/semantic/v1",
  artifact: "semantic.normalized-core/artifact/v1",
} as const);

export class NormalizedCoreDigestFailure extends Data.TaggedError("NormalizedCoreDigestFailure")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

const toHex = (bytes: Uint8Array): string => {
  let output = "";
  for (let index = 0; index < bytes.byteLength; index += 1) {
    output += bytes[index]!.toString(16).padStart(2, "0");
  }
  return output;
};

export const deriveIdentity = (
  domain: (typeof identityDomains)[keyof typeof identityDomains],
  payload: CanonicalJsonValue,
): Effect.Effect<Identity, NormalizedCoreDigestFailure, Crypto.Crypto> =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const domainBytes = new TextEncoder().encode(domain);
    const payloadBytes = canonicalBytes(payload, false);
    const preimage = new Uint8Array(domainBytes.length + 1 + payloadBytes.length);
    preimage.set(domainBytes);
    preimage[domainBytes.length] = 0;
    preimage.set(payloadBytes, domainBytes.length + 1);
    const digest = yield* crypto.digest("SHA-256", preimage).pipe(
      Effect.mapError(
        (cause) =>
          new NormalizedCoreDigestFailure({
            message: `cannot compute ${domain} identity`,
            cause,
          }),
      ),
    );
    const trustedDigest = trustedUint8ArrayCopy(digest);
    if (trustedDigest === undefined || trustedDigest.byteLength !== 32) {
      return yield* new NormalizedCoreDigestFailure({
        message: `invalid SHA-256 digest length for ${domain}`,
        cause: { expectedBytes: 32, actualBytes: trustedDigest?.byteLength },
      });
    }
    return `sha256:${toHex(trustedDigest)}` as Identity;
  });
