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
              python
              pkgs.git
              pkgs.jq
              pkgs.pyright
              pkgs.ruff
              pkgs.uv
            ];

            env.PYTHONPATH = "src";
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
    };
}
