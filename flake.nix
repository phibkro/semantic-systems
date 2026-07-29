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
          python = pkgs.python312.withPackages (pythonPackages: [ pythonPackages.pytest ]);
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.bun
              python
              pkgs.actionlint
              pkgs.git
              pkgs.jq
              # `node`, not just `bun`: the materialized .githooks/* scripts
              # are byte-identical to Clamor's ConventionalCommits block,
              # which hardcodes `#!/usr/bin/env node` shebangs for
              # ./node_modules/.bin/{commitlint,oxfmt,oxlint}.
              pkgs.nodejs
              pkgs.playwright-test
              pkgs.pyright
              pkgs.ruff
              pkgs.uv
            ];

            env = {
              PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
              PYTHONPATH = "src";
              TZ = "UTC";
              LC_ALL = "C.UTF-8";
              PYTHONHASHSEED = "0";
            };
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

      # Real repository-validation checks, not just devShell evaluation:
      # `nix flake check` actually runs the fast/integration Python gates
      # (ruff, pyright, pytest, model validate/generate) and the
      # network-free commit-policy conformance script inside sandboxed
      # derivations. Checks that need npm-fetched devDependencies (oxfmt,
      # oxlint, tsc, commitlint) cannot run hermetically here without a
      # vendored node_modules fixed-output derivation, so they stay in
      # `scripts/check-fast.sh` / `scripts/check.sh` under `nix develop`
      # rather than being silently claimed as sandboxed `nix flake check`
      # coverage.
      checks = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          python = pkgs.python312.withPackages (pythonPackages: [ pythonPackages.pytest ]);
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
                || name == ".pyright"
                || name == ".pytest_cache"
                || name == ".ruff_cache"
                || name == "__pycache__"
                || name == "build"
                || name == "dist"
                || pkgs.lib.hasPrefix "bun-debug-" name
              );
          };
        in
        {
          python-integration = pkgs.stdenv.mkDerivation {
            name = "semantic-systems-python-integration-check";
            inherit src;
            dontConfigure = true;
            dontBuild = true;
            nativeBuildInputs = [
              python
              pkgs.ruff
              pkgs.pyright
              pkgs.actionlint
              pkgs.git
              # `bun` only, deliberately with no `bun install`: this keeps the
              # node_modules-absent oracle test
              # (test_check_fast_fails_clearly_when_node_modules_is_absent)
              # exercising the real "tool present, dependencies absent" path
              # hermetically, without fetching npm packages in the sandbox.
              pkgs.bun
            ];
            doCheck = true;
            checkPhase = ''
              export PYTHONPATH=src
              export HOME="$TMPDIR"
              export TZ="UTC"
              export LC_ALL="C.UTF-8"
              export PYTHONHASHSEED="0"
              ruff check .
              ruff format --check .
              actionlint .github/workflows/check.yml
              python -m semantic_project_model validate
              python -m semantic_project_model generate --check
              pyright
              pytest -p no:cacheprovider
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
              export PYTHONHASHSEED="0"
              bun run scripts/check-commit-policy.ts
            '';
            installPhase = "mkdir -p $out && echo ok > $out/result";
          };
        }
      );
    };
}
