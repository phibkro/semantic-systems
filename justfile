set positional-arguments

default:
    @just --list

setup:
    bun scripts/check.ts setup

check:
    bun scripts/check.ts check

verify:
    bun scripts/check.ts verify

start feature:
    bun scripts/check.ts start "$1"
