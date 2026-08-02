{
  description = "Semantic Systems research and development monorepo";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.bun
              pkgs.actionlint
              # Atomic same-filesystem no-replace publication for reference
              # custody (`mv --update=none-fail --no-copy`).
              pkgs.coreutils
              pkgs.git
              pkgs.jq
              pkgs.just
              # `node`, not just `bun`: the materialized .githooks/* scripts
              # are byte-identical to Clamor's ConventionalCommits block,
              # which hardcodes `#!/usr/bin/env node` shebangs for
              # ./node_modules/.bin/{commitlint,oxfmt,oxlint}.
              pkgs.nodejs
              pkgs.playwright-test
            ]
            ++ pkgs.lib.optionals pkgs.stdenv.isLinux [
              # Kernel advisory locking shared by Bun and Node live layers.
              pkgs.util-linux
            ];

            env.PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
            env.TZ = "UTC";
            env.LC_ALL = "C.UTF-8";
          };
        }
      );

      formatter = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        pkgs.nixfmt
      );

      # Real repository-validation checks, not just devShell evaluation.
      # Checks needing npm-fetched devDependencies remain in `just fast` /
      # `just check` until node_modules has a fixed-output derivation.
      checks = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          src = builtins.path {
            path = ./.;
            name = "semantic-systems-src";
            filter =
              path: _type:
              let
                name = baseNameOf path;
              in
              !(
                name == "node_modules"
                || name == ".git"
                || name == ".references"
                || name == ".research-cache"
                || name == ".venv"
                || name == "__pycache__"
                || pkgs.lib.hasPrefix ".py" name
                || pkgs.lib.hasSuffix "_cache" name
                || name == "build"
                || name == "dist"
                || pkgs.lib.hasPrefix "bun-debug-" name
              );
          };
        in
        {
          source-invariants = pkgs.stdenv.mkDerivation {
            name = "semantic-systems-source-invariants-check";
            inherit src;
            dontConfigure = true;
            dontBuild = true;
            nativeBuildInputs = [
              pkgs.actionlint
              pkgs.findutils
            ];
            doCheck = true;
            checkPhase = ''
              export HOME="$TMPDIR"
              export TZ="UTC"
              export LC_ALL="C.UTF-8"
              actionlint .github/workflows/check.yml
              test ! -e pyproject.toml
              for directory in src tests scripts; do
                test -d "$directory"
              done
              legacy_sources="$(find src tests scripts -type f -name '*.py' -print)" || exit 1
              test -z "$legacy_sources"
            '';
            installPhase = "mkdir -p $out && echo ok > $out/result";
          };

          commit-policy-conformance = pkgs.stdenv.mkDerivation {
            name = "semantic-systems-commit-policy-conformance-check";
            inherit src;
            dontConfigure = true;
            dontBuild = true;
            nativeBuildInputs = [ pkgs.bun ];
            doCheck = true;
            checkPhase = ''
              export HOME="$TMPDIR"
              export TZ="UTC"
              export LC_ALL="C.UTF-8"
              bun run scripts/check-commit-policy.ts
            '';
            installPhase = "mkdir -p $out && echo ok > $out/result";
          };
        }
      );
    };
}
