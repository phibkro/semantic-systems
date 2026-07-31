import { Effect, Layer } from "effect";
import { TomlParser, TomlSyntaxError } from "./toml.ts";

/**
 * Bun's native TOML decoder. Kept in its own runtime-specific module (rather
 * than inline in main-bun.ts) so it composes the same way the official
 * `@effect/platform-bun` layers do: a live layer selected only at the
 * composition entrypoint, never imported by the portable catalog boundary.
 */
export const layer = Layer.succeed(TomlParser, {
  parse: (text: string) =>
    Effect.try({
      try: () => Bun.TOML.parse(text),
      catch: (cause) => new TomlSyntaxError({ message: "catalog is not valid TOML", cause }),
    }),
});
