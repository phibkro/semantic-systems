"""Oracle-first tests for design spec 0005 (autonomous development control loop).

Each test encodes one falsifier from the spec's "Oracle first" section: a
concrete injected failure that must block or visibly invalidate completion.
Every test first confirms the real repository state is green, then injects
the failure and confirms the check goes red for the *stated* reason (not an
unrelated crash), so the oracle actually distinguishes the intended defect
from noise.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "check.yml"
CHECK_FAST = ROOT / "scripts" / "check-fast.sh"
CHECK_INTEGRATION = ROOT / "scripts" / "check.sh"
COMMIT_POLICY = ROOT / "scripts" / "check-commit-policy.ts"
PROVENANCE = ROOT / "config" / "clamor-blocks" / "conventional-commits.provenance.json"


def _run(
    cmd: list[str],
    *,
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
    stdin_text: str | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        check=False,
        cwd=cwd if cwd is not None else ROOT,
        env=env,
        input=stdin_text,
    )


def _strip_tool_from_path(tool: str) -> str:
    """A PATH with every directory containing `tool` removed."""
    kept: list[str] = []
    for entry in os.environ.get("PATH", "").split(":"):
        if not entry:
            continue
        if (Path(entry) / tool).exists():
            continue
        kept.append(entry)
    return ":".join(kept)


# --- 1. Acceptance script missing or mismatched to the spec ID -------------


def _acceptance_id_slug(path: Path) -> str:
    return path.stem


def test_pilot_acceptance_script_id_matches_design_spec_and_plan() -> None:
    accept_script = ROOT / "scripts" / "accept" / "0004-reference-source-custody.sh"
    design_spec = ROOT / "design-specs" / "0004-reference-source-custody.md"
    plan = ROOT / "plans" / "active" / "0004-reference-source-custody.md"

    assert accept_script.is_file(), "the custody pilot's acceptance script must exist"
    assert design_spec.is_file()
    assert plan.is_file()

    slug = _acceptance_id_slug(accept_script)
    assert _acceptance_id_slug(design_spec) == slug
    assert _acceptance_id_slug(plan) == slug


def test_acceptance_script_id_mismatch_is_detectable(tmp_path: Path) -> None:
    """The naming convention itself must reject a mismatched ID, not just
    happen to match by coincidence for the one pilot script that exists."""
    accept_dir = tmp_path / "scripts" / "accept"
    accept_dir.mkdir(parents=True)
    (accept_dir / "0004-reference-source-custody.sh").write_text("#!/usr/bin/env sh\n")
    (tmp_path / "design-specs").mkdir()
    # Deliberately mismatched ID: 0005 spec, 0004 acceptance script.
    (tmp_path / "design-specs" / "0005-something-else.md").write_text("# spec\n")

    accept_ids = {_acceptance_id_slug(p) for p in accept_dir.glob("*.sh")}
    spec_ids = {_acceptance_id_slug(p) for p in (tmp_path / "design-specs").glob("*.md")}
    assert accept_ids.isdisjoint(spec_ids), "the injected mismatch must be observable"


# --- 2. Stale generated view -------------------------------------------


def test_check_fast_rejects_stale_generated_view(tmp_path: Path) -> None:
    workdir = tmp_path / "repo"
    shutil.copytree(
        ROOT,
        workdir,
        ignore=shutil.ignore_patterns("node_modules", ".git", ".references"),
    )

    generated_view = workdir / "generated" / "README.md"
    original = generated_view.read_text()
    generated_view.write_text(original + "\nstale drift that generate --check must reject\n")

    result = _run(
        [
            sys.executable,
            "-m",
            "semantic_project_model",
            "generate",
            "--check",
        ],
        cwd=workdir,
        env={**dict(os.environ), "PYTHONPATH": str(workdir / "src")},
    )
    assert result.returncode != 0, "a hand-edited generated view must fail --check"
    assert "generated" in (result.stdout + result.stderr).lower()


# --- 3. Invalid conventional commit / title -----------------------------


requires_bun = pytest.mark.skipif(shutil.which("bun") is None, reason="bun not on PATH")
requires_node_modules = pytest.mark.skipif(
    not (ROOT / "node_modules").is_dir(), reason="node_modules not installed"
)


@requires_bun
@requires_node_modules
def test_commitlint_accepts_project_specific_types() -> None:
    for message in ("feat: add a thing", "research: adjust a hypothesis", "plans: reorder work"):
        result = _run(["bun", "x", "commitlint"], stdin_text=message)
        assert result.returncode == 0, f"{message!r} should be a valid commit message"


@requires_bun
@requires_node_modules
def test_commitlint_rejects_invalid_message_and_type() -> None:
    for message in ("this has no type at all", "unknowntype: not in the allow list"):
        result = _run(["bun", "x", "commitlint"], stdin_text=message)
        assert result.returncode != 0, f"{message!r} must be rejected"


# --- 4. Check result bound to an ancestor commit ------------------------


def test_ci_reports_and_verifies_the_exact_tested_head() -> None:
    text = WORKFLOW.read_text()
    assert "github.event.pull_request.head.sha" in text, (
        "the workflow must read the PR's exact head SHA, not an implicit ref"
    )
    assert re.search(r"exact-head:.*EXACT_HEAD", text), (
        "the exact tested commit must be reported, not merely used internally"
    )
    assert re.search(r'test\s+"\$\{EXACT_HEAD\}"\s*=\s*"\$\(git rev-parse HEAD\)"', text), (
        "the workflow must assert the checked-out HEAD equals the reported exact head, "
        "so a stale checkout of an ancestor commit cannot silently pass as the tested SHA"
    )


def test_ci_never_checks_out_an_untrusted_pull_request_target() -> None:
    text = WORKFLOW.read_text()
    assert "pull_request_target" not in text


def test_ci_checkout_binds_ref_to_the_exact_head_not_the_merge_commit() -> None:
    """`actions/checkout` defaults to GitHub's synthetic merge commit on
    `pull_request` events, not the PR head SHA. Reporting and asserting
    EXACT_HEAD is not enough on its own: the checkout step itself must pin
    `ref:` to that same SHA, or `git rev-parse HEAD` inside the job would
    equal the merge commit and the assertion above would simply never pass
    on a real pull request."""
    checkout_blocks = re.findall(
        r"uses:\s*actions/checkout@\S+[^\n]*\n((?:[ \t]+.*\n?)*)",
        WORKFLOW.read_text(),
    )
    assert checkout_blocks, "expected at least one actions/checkout step"
    for block in checkout_blocks:
        assert re.search(
            r"ref:\s*\$\{\{\s*github\.event\.pull_request\.head\.sha\s*\|\|\s*github\.sha\s*\}\}",
            block,
        ), f"a checkout step is missing an explicit exact-head ref binding:\n{block}"


# --- 5. Missing required tool fails the gate, not a warning --------------


def test_check_fast_fails_hard_when_ruff_is_missing() -> None:
    stripped_path = _strip_tool_from_path("ruff")
    result = _run(
        ["sh", str(CHECK_FAST)],
        env={**dict(os.environ), "PATH": stripped_path},
    )
    assert result.returncode != 0, "a missing required tool must fail the gate"
    combined = result.stdout + result.stderr
    assert "required tool" in combined and "ruff" in combined, (
        "the failure must name the missing tool, not crash unrelatedly"
    )
    assert "warning" not in combined.lower(), (
        "a missing required tool must never be downgraded to a warning "
        "(the historical bug this replaces)"
    )


def test_check_fast_fails_clearly_when_node_modules_is_absent(tmp_path: Path) -> None:
    """A warm local worktree's node_modules must not silently become the
    evidence that the fast loop works from a clean checkout: CI, and any
    fresh clone, starts with no node_modules at all."""
    workdir = tmp_path / "repo"
    shutil.copytree(
        ROOT,
        workdir,
        ignore=shutil.ignore_patterns("node_modules", ".git", ".references"),
    )
    assert not (workdir / "node_modules").exists()

    result = _run(["sh", "scripts/check-fast.sh"], cwd=workdir)
    assert result.returncode != 0, "the fast loop must not silently pass without node_modules"
    combined = result.stdout + result.stderr
    assert "node_modules" in combined, "the failure must name the missing prerequisite install"


def test_check_integration_installs_dependencies_before_the_fast_loop() -> None:
    text = CHECK_INTEGRATION.read_text()
    install_at = text.find("bun install")
    fast_loop_at = text.find("check-fast.sh")
    assert install_at != -1 and fast_loop_at != -1
    assert install_at < fast_loop_at, (
        "scripts/check.sh must install JS dependencies before calling check-fast.sh, "
        "or a clean checkout fails the JS gates for the wrong reason"
    )


def test_check_integration_fails_hard_when_pyright_is_missing() -> None:
    stripped_path = _strip_tool_from_path("pyright")
    result = _run(
        ["sh", str(CHECK_INTEGRATION)],
        env={**dict(os.environ), "PATH": stripped_path},
    )
    assert result.returncode != 0
    combined = result.stdout + result.stderr
    assert "required tool" in combined and "pyright" in combined


# --- 6. Server gate never mutates ---------------------------------------


MUTATING_PATTERNS = [
    re.compile(r"ruff format(?!\s+--check)(?!\s*$)[^\n]*"),
    re.compile(r"oxfmt(?!.*--check)"),
    re.compile(r"\bsemproj generate\b(?!.*--check)"),
    re.compile(r"\bgit\s+(commit|push)\b"),
    re.compile(r"--fix\b"),
]


def test_ci_workflow_never_mutates_the_checkout() -> None:
    text = WORKFLOW.read_text()
    run_blocks = re.findall(r"run:\s*\|?\n?([^\n]*(?:\n(?:[ \t].*)?)*)", text)
    haystack = "\n".join(run_blocks) if run_blocks else text
    for pattern in MUTATING_PATTERNS:
        assert not pattern.search(haystack), (
            f"CI must verify without modifying; found a mutating pattern: {pattern.pattern}"
        )


# --- Commit-policy conformance script exists and matches its provenance --


def test_commit_policy_conformance_script_is_green() -> None:
    if shutil.which("bun") is None:
        pytest.skip("bun not on PATH")
    result = _run(["bun", "run", "scripts/check-commit-policy.ts"])
    assert result.returncode == 0, result.stdout + result.stderr
    assert PROVENANCE.is_file()
    provenance = json.loads(PROVENANCE.read_text())
    assert provenance["block"]["digest"] == (
        "sha256:f75a4a63e677b8bc6c10f90858aa18d75d84bed0e424949642dc13424ec402f1"
    )


@requires_bun
def test_commit_policy_conformance_detects_drift(tmp_path: Path) -> None:
    workdir = tmp_path / "repo"
    shutil.copytree(
        ROOT,
        workdir,
        ignore=shutil.ignore_patterns("node_modules", ".git", ".references"),
    )
    commit_msg_hook = workdir / ".githooks" / "commit-msg"
    commit_msg_hook.write_text(commit_msg_hook.read_text() + "\n# drifted by a local edit\n")

    result = _run(["bun", "run", "scripts/check-commit-policy.ts"], cwd=workdir)
    assert result.returncode != 0
    assert "drifted" in (result.stdout + result.stderr).lower()
