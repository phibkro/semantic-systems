import { Effect, Layer } from "effect";
import * as TOML from "toml";
import { TomlParser, TomlSyntaxError } from "./toml.ts";

/**
 * Node has no built-in TOML decoder, so the Node live layer uses the pure
 * JS `toml` package (already an exact-pinned dependency; see package.json).
 * Kept in its own runtime-specific module, mirroring `toml-bun.ts`, so the
 * portable catalog boundary never imports it directly.
 */
export const layer = Layer.succeed(TomlParser, {
  parse: (text: string) =>
    Effect.try({
      try: () => TOML.parse(text),
      catch: (cause) => new TomlSyntaxError({ message: "catalog is not valid TOML", cause }),
    }),
});
