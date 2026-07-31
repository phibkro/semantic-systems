import { Context, Data, type Effect } from "effect";

export class TomlSyntaxError extends Data.TaggedError("TomlSyntaxError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

interface TomlParserShape {
  readonly parse: (text: string) => Effect.Effect<unknown, TomlSyntaxError>;
}

/**
 * Portable TOML-decoding capability. Live layers (Bun's native parser, a pure
 * JS parser under Node) are composed only at the Bun/Node entrypoints, so the
 * catalog boundary never imports a runtime-specific TOML implementation.
 */
export class TomlParser extends Context.Service<TomlParser, TomlParserShape>()(
  "references/TomlParser",
) {}
