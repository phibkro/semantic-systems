set positional-arguments

default:
    @just --list

setup:
    bun scripts/check.ts setup

check:
    bun scripts/check.ts check

verify feature="":
    bun scripts/check.ts verify "$feature"

start feature:
    bun scripts/check.ts start "$1"
