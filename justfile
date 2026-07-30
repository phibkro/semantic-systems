set positional-arguments

default:
    @just --list

install:
    bun install --frozen-lockfile --ignore-scripts
    bun run effect:setup
    bun run hooks:install

validate:
    bun run semproj -- validate

generate:
    bun run semproj -- generate

report:
    bun run semproj -- report

test:
    bun test

fast:
    bun scripts/check-fast.ts

check:
    bun scripts/check.ts

references:
    bun scripts/check-references.ts

accept feature:
    bun scripts/run-feature-acceptance.ts --mode direct --feature "$1"
