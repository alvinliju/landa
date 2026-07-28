{
  description = "landa — agent computer control plane (dev = deploy shape)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        node = pkgs.nodejs_22;
        deployScript = pkgs.writeShellApplication {
          name = "landa-deploy";
          runtimeInputs = with pkgs; [
            openssh
            git
            coreutils
            bash
          ];
          text = ''
            exec ${./scripts/landa-deploy} "$@"
          '';
        };
      in
      {
        packages.deploy = deployScript;
        packages.default = deployScript;

        apps.deploy = {
          type = "app";
          program = "${deployScript}/bin/landa-deploy";
        };
        apps.default = {
          type = "app";
          program = "${deployScript}/bin/landa-deploy";
        };

        devShells.default = pkgs.mkShell {
          name = "landa";
          packages = with pkgs; [
            node
            nodePackages.npm
            postgresql_16
            curl
            jq
            git
            openssh
            deployScript
          ]
          ++ pkgs.lib.optionals pkgs.stdenv.isLinux [ firecracker ];

          shellHook = ''
            export LANDA_ROOT="$(pwd)"
            export LANDA_DATA="''${LANDA_DATA:-$LANDA_ROOT/.data}"
            export PGDATA="''${PGDATA:-$LANDA_DATA/pg}"
            export PGHOST="''${PGHOST:-127.0.0.1}"
            export PGPORT="''${PGPORT:-5433}"
            export PGUSER="''${PGUSER:-landa}"
            export PGPASSWORD="''${PGPASSWORD:-landa}"
            export PGDATABASE="''${PGDATABASE:-landa}"
            export DATABASE_URL="''${DATABASE_URL:-postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE}"
            export LANDA_API_PORT="''${LANDA_API_PORT:-8787}"
            export PATH="$LANDA_ROOT/scripts:$PATH"

            mkdir -p "$LANDA_DATA"

            echo "landa dev shell"
            echo "  DATABASE_URL=$DATABASE_URL"
            echo "  API port     $LANDA_API_PORT"
            echo ""
            echo "  landa-pg start | stop | status | reset"
            echo "  landa-migrate"
            echo "  landa-dev          # migrate + api watch"
            echo "  landa-deploy       # push live API to DEPLOY_HOST (default edge)"
            echo "  nix run .#deploy   # same"
            echo ""
          '';
        };
      }
    );
}
