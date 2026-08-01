/**
 * Bounded reachability over one caller-declared graph and one semantic-store
 * observation. The caller owns edge authority; this module owns only strict
 * admission, normalization, traversal, and content-addressed receipts.
 */
import { Crypto, Data, Effect, Schema } from "effect";
import {
  canonicalBytes,
  scanJson,
  trustedUint8ArrayCopy,
  type CanonicalJsonValue,
} from "../normalized-core/canonical.ts";
import type { Identity } from "../normalized-core/index.ts";
import { SemanticStore, type SemanticStoreSnapshot } from "./semantic-store.ts";

const IdentitySchema = Schema.String.check(Schema.isPattern(/^sha256:[0-9a-f]{64}$/));
const CountSchema = Schema.Finite.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
);

export const reachabilityBounds = Object.freeze({
  maximumBytes: 1_048_576,
  maximumDepth: 64,
  maximumJsonValues: 16_384,
  maximumNodes: 1_024,
  maximumEdges: 4_096,
} as const);

export const reachabilityIdentityDomains = Object.freeze({
  graph: "semantic.language-build/runtime-dependency-graph/v1",
  receipt: "semantic.language-build/reachability-receipt/v1",
} as const);

export const reachabilityProcedureIdentity =
  "semantic.language-build/reachability/0030/v1" as const;

export const DeclaredDependencyNodeSchema = Schema.Struct({
  semantic_identity: IdentitySchema,
  runtime_dependencies: Schema.Array(IdentitySchema),
});

export const DeclaredDependencyGraphSchema = Schema.Struct({
  format: Schema.Literal("semantic.declared-dependency-graph"),
  version: Schema.Literal(1),
  root_semantic_identity: IdentitySchema,
  nodes: Schema.Array(DeclaredDependencyNodeSchema),
});

export const RuntimeDependencyNodeSchema = Schema.Struct({
  semantic_identity: IdentitySchema,
  runtime_dependencies: Schema.Array(IdentitySchema),
});

export const RuntimeDependencyGraphSchema = Schema.Struct({
  format: Schema.Literal("semantic.runtime-dependency-graph"),
  version: Schema.Literal(1),
  graph_identity: IdentitySchema,
  nodes: Schema.Array(RuntimeDependencyNodeSchema),
});

export const ReachabilityReceiptSchema = Schema.Struct({
  format: Schema.Literal("semantic.reachability-receipt"),
  version: Schema.Literal(1),
  status: Schema.Literal("analyzed"),
  procedure_identity: Schema.Literal(reachabilityProcedureIdentity),
  edge_authority: Schema.Literal("caller-declared"),
  graph: RuntimeDependencyGraphSchema,
  root_semantic_identity: IdentitySchema,
  reachable_semantic_identities: Schema.Array(IdentitySchema),
  unreachable_semantic_identities: Schema.Array(IdentitySchema),
  node_count: CountSchema,
  edge_count: CountSchema,
  receipt_identity: IdentitySchema,
});

export type DeclaredDependencyNode = typeof DeclaredDependencyNodeSchema.Type;
export type DeclaredDependencyGraph = typeof DeclaredDependencyGraphSchema.Type;
export type RuntimeDependencyNode = typeof RuntimeDependencyNodeSchema.Type;
export type RuntimeDependencyGraph = typeof RuntimeDependencyGraphSchema.Type;
export type ReachabilityReceipt = typeof ReachabilityReceiptSchema.Type;

export interface ReachabilityAnalysisArtifact {
  readonly receipt: ReachabilityReceipt;
  readonly bytes: Uint8Array;
}

export class ReachabilityInputRejected extends Data.TaggedError("ReachabilityInputRejected")<{
  readonly reason: string;
}> {}

export class ReachabilityGraphRejected extends Data.TaggedError("ReachabilityGraphRejected")<{
  readonly reason: string;
}> {}

export class ReachabilityReceiptRejected extends Data.TaggedError("ReachabilityReceiptRejected")<{
  readonly reason: string;
}> {}

export class ReachabilityDigestFailure extends Data.TaggedError("ReachabilityDigestFailure")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

const compareStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const immutable = <Value extends object>(value: Value): Readonly<Value> => Object.freeze(value);

const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);

const toHex = (bytes: Uint8Array): string => {
  let output = "";
  for (let index = 0; index < bytes.byteLength; index += 1) {
    output += bytes[index]!.toString(16).padStart(2, "0");
  }
  return output;
};

const deriveIdentity = (
  domain: (typeof reachabilityIdentityDomains)[keyof typeof reachabilityIdentityDomains],
  payload: CanonicalJsonValue,
): Effect.Effect<Identity, ReachabilityDigestFailure, Crypto.Crypto> =>
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
          new ReachabilityDigestFailure({
            message: `cannot compute ${domain} identity`,
            cause,
          }),
      ),
    );
    const trustedDigest = trustedUint8ArrayCopy(digest);
    if (trustedDigest === undefined || trustedDigest.byteLength !== 32) {
      return yield* new ReachabilityDigestFailure({
        message: `invalid SHA-256 digest length for ${domain}`,
        cause: { expectedBytes: 32, actualBytes: trustedDigest?.byteLength },
      });
    }
    return `sha256:${toHex(trustedDigest)}` as Identity;
  });

const decodeJsonText = <S extends Schema.Constraint>(
  schema: S,
  input: unknown,
  rejection: (reason: string) => ReachabilityInputRejected | ReachabilityReceiptRejected,
): Effect.Effect<
  S["Type"],
  ReachabilityInputRejected | ReachabilityReceiptRejected,
  S["DecodingServices"]
> =>
  Effect.gen(function* () {
    if (typeof input !== "string") return yield* rejection("input must be a primitive JSON string");
    const encodedLength = new TextEncoder().encode(input).byteLength;
    if (encodedLength > reachabilityBounds.maximumBytes) {
      return yield* rejection(`input exceeds ${reachabilityBounds.maximumBytes} UTF-8 bytes`);
    }
    const scanIssue = scanJson(
      input,
      reachabilityBounds.maximumDepth,
      reachabilityBounds.maximumJsonValues,
    );
    if (scanIssue !== undefined) return yield* rejection(scanIssue.message);
    const parsed = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(input).pipe(
      Effect.mapError((cause) => rejection(cause.message)),
      Effect.catchDefect(() => Effect.fail(rejection("JSON input could not be decoded"))),
    );
    return yield* Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })(parsed).pipe(
      Effect.mapError((cause) => rejection(cause.message)),
      Effect.catchDefect(() => Effect.fail(rejection("JSON value could not be decoded"))),
    );
  });

const decodeDeclaredGraph = (
  input: unknown,
): Effect.Effect<DeclaredDependencyGraph, ReachabilityInputRejected> =>
  decodeJsonText(
    DeclaredDependencyGraphSchema,
    input,
    (reason) => new ReachabilityInputRejected({ reason }),
  ) as Effect.Effect<DeclaredDependencyGraph, ReachabilityInputRejected>;

const graphPayload = (nodes: ReadonlyArray<RuntimeDependencyNode>): CanonicalJsonValue => ({
  format: "semantic.runtime-dependency-graph",
  version: 1,
  nodes: nodes.map((node) => ({
    semantic_identity: node.semantic_identity,
    runtime_dependencies: [...node.runtime_dependencies],
  })),
});

const receiptPayload = (
  graph: RuntimeDependencyGraph,
  root: string,
  reachable: ReadonlyArray<string>,
  unreachable: ReadonlyArray<string>,
  edgeCount: number,
): CanonicalJsonValue => ({
  format: "semantic.reachability-receipt",
  version: 1,
  status: "analyzed",
  procedure_identity: reachabilityProcedureIdentity,
  edge_authority: "caller-declared",
  graph: {
    format: graph.format,
    version: graph.version,
    graph_identity: graph.graph_identity,
    nodes: graph.nodes.map((node) => ({
      semantic_identity: node.semantic_identity,
      runtime_dependencies: [...node.runtime_dependencies],
    })),
  },
  root_semantic_identity: root,
  reachable_semantic_identities: [...reachable],
  unreachable_semantic_identities: [...unreachable],
  node_count: graph.nodes.length,
  edge_count: edgeCount,
});

const receiptDocument = (
  payload: CanonicalJsonValue,
  receiptIdentity: Identity,
): CanonicalJsonValue => ({
  ...(payload as Readonly<Record<string, CanonicalJsonValue>>),
  receipt_identity: receiptIdentity,
});

interface NormalizedGraph {
  readonly nodes: ReadonlyArray<RuntimeDependencyNode>;
  readonly nodeIdentities: ReadonlySet<string>;
  readonly edgeCount: number;
}

const normalizeNodes = (
  nodes: ReadonlyArray<DeclaredDependencyNode | RuntimeDependencyNode>,
): Effect.Effect<NormalizedGraph, ReachabilityGraphRejected> =>
  Effect.gen(function* () {
    if (nodes.length > reachabilityBounds.maximumNodes) {
      return yield* new ReachabilityGraphRejected({
        reason: `graph exceeds ${reachabilityBounds.maximumNodes} nodes`,
      });
    }
    const nodeIdentities = new Set<string>();
    let edgeCount = 0;
    const normalized: RuntimeDependencyNode[] = [];
    for (const node of nodes) {
      if (nodeIdentities.has(node.semantic_identity)) {
        return yield* new ReachabilityGraphRejected({
          reason: `duplicate graph node ${node.semantic_identity}`,
        });
      }
      nodeIdentities.add(node.semantic_identity);
      const dependencies = new Set<string>();
      for (const dependency of node.runtime_dependencies) {
        if (dependencies.has(dependency)) {
          return yield* new ReachabilityGraphRejected({
            reason: `duplicate runtime dependency ${node.semantic_identity} -> ${dependency}`,
          });
        }
        dependencies.add(dependency);
        edgeCount += 1;
        if (edgeCount > reachabilityBounds.maximumEdges) {
          return yield* new ReachabilityGraphRejected({
            reason: `graph exceeds ${reachabilityBounds.maximumEdges} runtime edges`,
          });
        }
      }
      normalized.push(
        immutable({
          semantic_identity: node.semantic_identity,
          runtime_dependencies: Object.freeze(
            [...dependencies].sort(compareStrings) as Array<Identity>,
          ),
        }),
      );
    }
    normalized.sort((left, right) =>
      compareStrings(left.semantic_identity, right.semantic_identity),
    );
    return immutable({
      nodes: Object.freeze(normalized),
      nodeIdentities,
      edgeCount,
    });
  });

const validateGraphUniverse = (
  normalized: NormalizedGraph,
  root: string,
  snapshot: SemanticStoreSnapshot,
): Effect.Effect<void, ReachabilityGraphRejected> =>
  Effect.gen(function* () {
    const stored = new Set(snapshot.semantic_values.map((value) => value.semantic_identity));
    for (const node of normalized.nodes) {
      if (!stored.has(node.semantic_identity)) {
        return yield* new ReachabilityGraphRejected({
          reason: `graph subject ${node.semantic_identity} is absent from the captured store`,
        });
      }
    }
    if (!normalized.nodeIdentities.has(root)) {
      return yield* new ReachabilityGraphRejected({
        reason: `root ${root} is absent from the declared graph`,
      });
    }
    for (const node of normalized.nodes) {
      for (const dependency of node.runtime_dependencies) {
        if (!normalized.nodeIdentities.has(dependency)) {
          return yield* new ReachabilityGraphRejected({
            reason: `runtime dependency endpoint ${dependency} is absent from the declared graph`,
          });
        }
      }
    }
  });

interface Closure {
  readonly reachable: ReadonlyArray<string>;
  readonly unreachable: ReadonlyArray<string>;
}

const deriveClosure = (normalized: NormalizedGraph, root: string): Closure => {
  const byIdentity = new Map(normalized.nodes.map((node) => [node.semantic_identity, node]));
  const visited = new Set<string>();
  const pending: string[] = [root];
  while (pending.length > 0) {
    const identity = pending.pop()!;
    if (visited.has(identity)) continue;
    visited.add(identity);
    const node = byIdentity.get(identity)!;
    for (let index = node.runtime_dependencies.length - 1; index >= 0; index -= 1) {
      const dependency = node.runtime_dependencies[index]!;
      if (!visited.has(dependency)) pending.push(dependency);
    }
  }
  const reachable = normalized.nodes
    .map((node) => node.semantic_identity)
    .filter((identity) => visited.has(identity));
  const unreachable = normalized.nodes
    .map((node) => node.semantic_identity)
    .filter((identity) => !visited.has(identity));
  return immutable({
    reachable: Object.freeze(reachable),
    unreachable: Object.freeze(unreachable),
  });
};

const buildArtifact = (
  normalized: NormalizedGraph,
  root: string,
): Effect.Effect<ReachabilityAnalysisArtifact, ReachabilityDigestFailure, Crypto.Crypto> =>
  Effect.gen(function* () {
    const graphIdentity = yield* deriveIdentity(
      reachabilityIdentityDomains.graph,
      graphPayload(normalized.nodes),
    );
    const graph = immutable({
      format: "semantic.runtime-dependency-graph" as const,
      version: 1 as const,
      graph_identity: graphIdentity,
      nodes: normalized.nodes,
    });
    const closure = deriveClosure(normalized, root);
    const payload = receiptPayload(
      graph,
      root,
      closure.reachable,
      closure.unreachable,
      normalized.edgeCount,
    );
    const receiptIdentity = yield* deriveIdentity(reachabilityIdentityDomains.receipt, payload);
    const receipt = immutable({
      format: "semantic.reachability-receipt" as const,
      version: 1 as const,
      status: "analyzed" as const,
      procedure_identity: reachabilityProcedureIdentity,
      edge_authority: "caller-declared" as const,
      graph,
      root_semantic_identity: root,
      reachable_semantic_identities: closure.reachable,
      unreachable_semantic_identities: closure.unreachable,
      node_count: normalized.nodes.length,
      edge_count: normalized.edgeCount,
      receipt_identity: receiptIdentity,
    });
    const custodiedBytes = canonicalBytes(receiptDocument(payload, receiptIdentity));
    return immutable({
      receipt,
      get bytes(): Uint8Array {
        return custodiedBytes.slice();
      },
    });
  });

export const analyzeJson = (
  input: unknown,
): Effect.Effect<
  ReachabilityAnalysisArtifact,
  ReachabilityInputRejected | ReachabilityGraphRejected | ReachabilityDigestFailure,
  SemanticStore | Crypto.Crypto
> =>
  Effect.gen(function* () {
    const declared = yield* decodeDeclaredGraph(input);
    const store = yield* SemanticStore;
    const snapshot = yield* store.snapshot;
    const normalized = yield* normalizeNodes(declared.nodes);
    yield* validateGraphUniverse(normalized, declared.root_semantic_identity, snapshot);
    return yield* buildArtifact(normalized, declared.root_semantic_identity);
  });

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayTag = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)?.get;
const typedArrayLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteLength")?.get;

const snapshotReceiptBytes = (
  input: unknown,
): Effect.Effect<Uint8Array, ReachabilityReceiptRejected> =>
  Effect.try({
    try: () => {
      if (
        typedArrayTag === undefined ||
        typedArrayLength === undefined ||
        typedArrayTag.call(input) !== "Uint8Array"
      ) {
        throw new TypeError("receipt input must be a Uint8Array");
      }
      const length = typedArrayLength.call(input) as number;
      if (length > reachabilityBounds.maximumBytes) {
        throw new RangeError(`receipt exceeds ${reachabilityBounds.maximumBytes} bytes`);
      }
      const output = new Uint8Array(length);
      Uint8Array.prototype.set.call(output, input as Uint8Array);
      return output;
    },
    catch: (cause) =>
      new ReachabilityReceiptRejected({
        reason: cause instanceof Error ? cause.message : "receipt bytes could not be captured",
      }),
  });

export interface PreparedReachabilityReceipt {
  readonly receipt: ReachabilityReceipt;
  readonly bytes: Uint8Array;
}

/** @internal Shared representation-admission seam for language-build features. */
export const prepareReachabilityReceiptBytes = (
  input: unknown,
): Effect.Effect<PreparedReachabilityReceipt, ReachabilityReceiptRejected> =>
  Effect.gen(function* () {
    const bytes = yield* snapshotReceiptBytes(input);
    const text = yield* Effect.try({
      try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      catch: () => new ReachabilityReceiptRejected({ reason: "receipt is not valid UTF-8" }),
    });
    const receipt = yield* decodeJsonText(
      ReachabilityReceiptSchema,
      text,
      (reason) => new ReachabilityReceiptRejected({ reason }),
    ) as Effect.Effect<ReachabilityReceipt, ReachabilityReceiptRejected>;
    return immutable({ receipt, bytes });
  });

const validatePreparedReachabilityReceipt = (
  prepared: PreparedReachabilityReceipt,
  snapshot: SemanticStoreSnapshot,
): Effect.Effect<
  ReachabilityReceipt,
  ReachabilityReceiptRejected | ReachabilityGraphRejected | ReachabilityDigestFailure,
  Crypto.Crypto
> =>
  Effect.gen(function* () {
    const normalized = yield* normalizeNodes(prepared.receipt.graph.nodes);
    yield* validateGraphUniverse(normalized, prepared.receipt.root_semantic_identity, snapshot);
    const expected = yield* buildArtifact(normalized, prepared.receipt.root_semantic_identity);
    if (!bytesEqual(prepared.bytes, expected.bytes)) {
      return yield* new ReachabilityReceiptRejected({
        reason: "receipt bytes are not the canonical recomputed receipt",
      });
    }
    return expected.receipt;
  });

/**
 * @internal Receipt-owned orchestration seam for language-build composition.
 * The caller can use the accepted snapshot, but cannot supply one directly.
 */
export const withValidatedReceiptSnapshot = <Value, Error, Requirements>(
  receiptBytes: unknown,
  use: (
    receipt: ReachabilityReceipt,
    snapshot: SemanticStoreSnapshot,
  ) => Effect.Effect<Value, Error, Requirements>,
): Effect.Effect<
  Value,
  ReachabilityReceiptRejected | ReachabilityGraphRejected | ReachabilityDigestFailure | Error,
  SemanticStore | Crypto.Crypto | Requirements
> =>
  Effect.gen(function* () {
    const prepared = yield* prepareReachabilityReceiptBytes(receiptBytes);
    const store = yield* SemanticStore;
    const snapshot = yield* store.snapshot;
    const receipt = yield* validatePreparedReachabilityReceipt(prepared, snapshot);
    return yield* use(receipt, snapshot);
  });

export const validateReceiptBytes = (
  input: unknown,
): Effect.Effect<
  ReachabilityReceipt,
  ReachabilityReceiptRejected | ReachabilityGraphRejected | ReachabilityDigestFailure,
  SemanticStore | Crypto.Crypto
> => withValidatedReceiptSnapshot(input, Effect.succeed);
