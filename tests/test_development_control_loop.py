"""Executable behavior oracles for design spec 0005's repository sensors.

These tests cover only observations the checked-in repository can make:
feature-contract identity, acceptance dispatch, exact-head CI configuration,
commit metadata, materialization provenance, and tracked-artifact preservation.
Independent review resolution, branch protection, operator notification, and
Herdr cleanup remain external gates and are not falsely represented here.
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
FEATURE_POLICY = ROOT / "scripts" / "check-feature-contract.ts"
FEATURE_RUNNER = ROOT / "scripts" / "run-feature-acceptance.ts"
PROVENANCE = ROOT / "config" / "clamor-blocks" / "conventional-commits.provenance.json"
RED_ACCEPTANCE_EXIT = 23

requires_bun = pytest.mark.skipif(shutil.which("bun") is None, reason="bun not on PATH")
requires_node_modules = pytest.mark.skipif(
    not (ROOT / "node_modules" / ".bin" / "commitlint").is_file(),
    reason="the exact local commitlint executable is not installed",
)


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


def _git(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return _run(["git", *args], cwd=repo)


def _commit(repo: Path, message: str) -> str:
    result = _run(
        [
            "git",
            "-c",
            "user.name=Feature Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "commit",
            "-am",
            message,
        ],
        cwd=repo,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    return _git(repo, "rev-parse", "HEAD").stdout.strip()


def _valid_pr_body(feature_id: str) -> str:
    return f"""Feature-ID: {feature_id}

## Design spec and semantic claim
The feature claim is falsifiable.

## User-visible preview
`./scripts/accept/{feature_id}.sh` prints the observed acceptance result.

## Semantic diff
The fixture adds one bounded process feature.

## Checks run on this exact PR head
The exact acceptance script and integration checks passed.

## Evidence categories and artifacts
Runtime validation from the acceptance script.

## Assumptions and unsupported claims
The fixture does not claim proof.

## Independent reviewer / counterexamples considered
Missing and duplicated markers were considered.

## Deviations and next uncertainty
No deviations; branch protection remains external.

## Cleanup
Cleanup occurs after merge.
"""


def _feature_repo(tmp_path: Path, feature_id: str = "0005-fixture") -> tuple[Path, Path, str, str]:
    repo = tmp_path / "repo"
    repo.mkdir()
    assert _git(repo, "init").returncode == 0
    (repo / "README.md").write_text("baseline\n")
    assert _git(repo, "add", "README.md").returncode == 0
    base = _commit(repo, "docs: establish fixture")

    for directory in ("design-specs", "plans/active", "scripts/accept"):
        (repo / directory).mkdir(parents=True, exist_ok=True)
    (repo / "design-specs" / f"{feature_id}.md").write_text("# frozen feature\n")
    (repo / "plans" / "active" / f"{feature_id}.md").write_text("# active plan\n")
    accept = repo / "scripts" / "accept" / f"{feature_id}.sh"
    accept.write_text("#!/usr/bin/env sh\nset -eu\nprintf 'fixture accepted\\n'\n")
    accept.chmod(0o755)
    assert _git(repo, "add", ".").returncode == 0
    head = _commit(repo, "test: add feature fixture")

    event = tmp_path / "event.json"
    event.write_text(
        json.dumps(
            {
                "pull_request": {
                    "base": {"sha": base},
                    "head": {"sha": head},
                    "body": _valid_pr_body(feature_id),
                }
            }
        )
    )
    return repo, event, base, head


def _run_feature_tool(
    script: Path,
    repo: Path,
    *args: str,
) -> subprocess.CompletedProcess[str]:
    return _run(["bun", str(script), "--root", str(repo), *args], cwd=repo)


# --- 1. Acceptance script missing or mismatched to the spec ID -------------


def test_control_loop_has_production_feature_validator_runner_and_acceptance() -> None:
    assert FEATURE_POLICY.is_file()
    assert FEATURE_RUNNER.is_file()
    accept_script = ROOT / "scripts" / "accept" / "0005-autonomous-development-control-loop.sh"
    assert accept_script.is_file()
    assert os.access(accept_script, os.X_OK)


def test_pull_request_template_has_one_machine_readable_feature_marker() -> None:
    template = (ROOT / ".github" / "PULL_REQUEST_TEMPLATE.md").read_text()
    markers = re.findall(r"^Feature-ID:\s*.+$", template, flags=re.MULTILINE)
    assert markers == ["Feature-ID: <NNNN-slug>"]


@requires_bun
def test_feature_contract_accepts_one_complete_feature(tmp_path: Path) -> None:
    repo, event, _, _ = _feature_repo(tmp_path)
    result = _run_feature_tool(FEATURE_POLICY, repo, "--event", str(event))
    assert result.returncode == 0, result.stdout + result.stderr
    assert "0005-fixture" in result.stdout


@requires_bun
@pytest.mark.parametrize(
    ("body", "reason"),
    [
        ("## Design spec and semantic claim\nmissing marker\n", "exactly one feature-id"),
        (
            _valid_pr_body("0005-fixture") + "\nFeature-ID: 0006-duplicate\n",
            "exactly one feature-id",
        ),
        (_valid_pr_body("<NNNN-slug>"), "malformed"),
    ],
)
def test_feature_contract_rejects_missing_duplicate_or_placeholder_marker(
    tmp_path: Path, body: str, reason: str
) -> None:
    repo, event, _, _ = _feature_repo(tmp_path)
    payload = json.loads(event.read_text())
    payload["pull_request"]["body"] = body
    event.write_text(json.dumps(payload))
    result = _run_feature_tool(FEATURE_POLICY, repo, "--event", str(event))
    assert result.returncode != 0
    assert reason in (result.stdout + result.stderr).lower()


@requires_bun
def test_feature_contract_rejects_empty_report_section(tmp_path: Path) -> None:
    repo, event, _, _ = _feature_repo(tmp_path)
    payload = json.loads(event.read_text())
    payload["pull_request"]["body"] = _valid_pr_body("0005-fixture").replace(
        "## Semantic diff\nThe fixture adds one bounded process feature.",
        "## Semantic diff\n<!-- placeholder -->",
    )
    event.write_text(json.dumps(payload))
    result = _run_feature_tool(FEATURE_POLICY, repo, "--event", str(event))
    assert result.returncode != 0
    assert "semantic diff" in (result.stdout + result.stderr).lower()


@requires_bun
def test_feature_contract_rejects_missing_or_nonexecutable_acceptance(tmp_path: Path) -> None:
    repo, event, _, _ = _feature_repo(tmp_path)
    accept = repo / "scripts" / "accept" / "0005-fixture.sh"
    accept.chmod(0o644)
    result = _run_feature_tool(FEATURE_POLICY, repo, "--event", str(event))
    assert result.returncode != 0
    assert "executable" in (result.stdout + result.stderr).lower()


@requires_bun
def test_feature_contract_requires_plan_change_in_pr_range(tmp_path: Path) -> None:
    repo, event, _, head = _feature_repo(tmp_path)
    (repo / "README.md").write_text("maintenance after feature\n")
    assert _git(repo, "add", "README.md").returncode == 0
    maintenance_head = _commit(repo, "docs: change only readme")
    payload = json.loads(event.read_text())
    payload["pull_request"]["base"]["sha"] = head
    payload["pull_request"]["head"]["sha"] = maintenance_head
    event.write_text(json.dumps(payload))
    result = _run_feature_tool(FEATURE_POLICY, repo, "--event", str(event))
    assert result.returncode != 0
    assert "plan" in (result.stdout + result.stderr).lower()
    assert "range" in (result.stdout + result.stderr).lower()


@requires_bun
def test_feature_contract_rejects_multiple_feature_identities(tmp_path: Path) -> None:
    repo, event, _, _ = _feature_repo(tmp_path)
    (repo / "design-specs" / "0006-second.md").write_text("# second feature\n")
    (repo / "plans" / "active" / "0006-second.md").write_text("# second plan\n")
    second_accept = repo / "scripts" / "accept" / "0006-second.sh"
    second_accept.write_text("#!/usr/bin/env sh\nexit 0\n")
    second_accept.chmod(0o755)
    assert _git(repo, "add", ".").returncode == 0
    second_head = _commit(repo, "feat: add a second feature")
    payload = json.loads(event.read_text())
    payload["pull_request"]["head"]["sha"] = second_head
    event.write_text(json.dumps(payload))
    result = _run_feature_tool(FEATURE_POLICY, repo, "--event", str(event))
    assert result.returncode != 0
    assert "multiple feature identities" in (result.stdout + result.stderr).lower()


@requires_bun
def test_trivial_marker_allows_readme_but_rejects_implementation(tmp_path: Path) -> None:
    repo, event, _, feature_head = _feature_repo(tmp_path)
    (repo / "README.md").write_text("trivial documentation correction\n")
    assert _git(repo, "add", "README.md").returncode == 0
    trivial_head = _commit(repo, "docs: adjust readme")
    payload = json.loads(event.read_text())
    payload["pull_request"] = {
        "base": {"sha": feature_head},
        "head": {"sha": trivial_head},
        "body": _valid_pr_body("trivial"),
    }
    event.write_text(json.dumps(payload))
    allowed = _run_feature_tool(FEATURE_POLICY, repo, "--event", str(event))
    assert allowed.returncode == 0, allowed.stdout + allowed.stderr

    (repo / "src").mkdir()
    (repo / "src" / "semantic.ts").write_text("export const meaning = 1;\n")
    assert _git(repo, "add", "src/semantic.ts").returncode == 0
    nontrivial_head = _commit(repo, "feat: add implementation")
    payload["pull_request"]["head"]["sha"] = nontrivial_head
    event.write_text(json.dumps(payload))
    rejected = _run_feature_tool(FEATURE_POLICY, repo, "--event", str(event))
    assert rejected.returncode != 0
    assert "trivial" in (rejected.stdout + rejected.stderr).lower()


@requires_bun
def test_feature_runner_dispatches_pr_and_range_acceptance(tmp_path: Path) -> None:
    repo, event, base, head = _feature_repo(tmp_path)
    pr = _run_feature_tool(FEATURE_RUNNER, repo, "--mode", "pr", "--event", str(event))
    assert pr.returncode == 0, pr.stdout + pr.stderr
    assert "fixture accepted" in pr.stdout
    assert head in pr.stdout

    ranged = _run_feature_tool(
        FEATURE_RUNNER,
        repo,
        "--mode",
        "range",
        "--base",
        base,
        "--head",
        head,
    )
    assert ranged.returncode == 0, ranged.stdout + ranged.stderr
    assert "0005-fixture" in ranged.stdout


@requires_bun
def test_range_runner_reports_zero_plan_maintenance(tmp_path: Path) -> None:
    repo, _, _, feature_head = _feature_repo(tmp_path)
    (repo / "README.md").write_text("maintenance range\n")
    assert _git(repo, "add", "README.md").returncode == 0
    maintenance_head = _commit(repo, "docs: maintenance range")
    result = _run_feature_tool(
        FEATURE_RUNNER,
        repo,
        "--mode",
        "range",
        "--base",
        feature_head,
        "--head",
        maintenance_head,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "zero changed feature plans" in result.stdout


@requires_bun
def test_release_runner_does_not_skip_red_acceptance(tmp_path: Path) -> None:
    repo, _, _, _ = _feature_repo(tmp_path)
    red = repo / "scripts" / "accept" / "0006-red.sh"
    red.write_text(f"#!/usr/bin/env sh\nexit {RED_ACCEPTANCE_EXIT}\n")
    red.chmod(0o755)
    result = _run_feature_tool(FEATURE_RUNNER, repo, "--mode", "release")
    assert result.returncode == RED_ACCEPTANCE_EXIT
    assert "0006-red" in (result.stdout + result.stderr)


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


@requires_bun
@requires_node_modules
def test_commitlint_accepts_project_specific_types() -> None:
    for message in ("feat: add a thing", "research: adjust a hypothesis", "plans: reorder work"):
        result = _run(["./node_modules/.bin/commitlint"], stdin_text=message)
        assert result.returncode == 0, f"{message!r} should be a valid commit message"


@requires_bun
@requires_node_modules
def test_commitlint_rejects_invalid_message_and_type() -> None:
    for message in (
        "this has no type at all",
        "unknowntype: not in the allow list",
        "Merge branch main",
        'Revert "not conventional"',
        "v1.2.3",
    ):
        result = _run(["./node_modules/.bin/commitlint"], stdin_text=message)
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


def test_ci_revalidates_mutable_pr_metadata_and_runs_feature_authority() -> None:
    text = WORKFLOW.read_text()
    for activity in (
        "opened",
        "synchronize",
        "reopened",
        "edited",
        "ready_for_review",
        "labeled",
        "unlabeled",
    ):
        assert activity in text
    assert "run-feature-acceptance.ts" in text
    assert "check-feature-contract.ts" in text
    assert "pull_request_target" not in text


def test_ci_uses_pinned_runtimes_local_tools_and_hardened_checkout() -> None:
    text = WORKFLOW.read_text()
    package = json.loads((ROOT / "package.json").read_text())
    assert package["packageManager"] == "bun@1.3.13"
    assert package["devDependencies"]["typescript"] == "7.0.2"
    assert "runs-on: ubuntu-24.04" in text
    assert "bun-version: 1.3.13" in text
    assert "source-tag: v3.21.8" in text
    assert "nix-2.34.8-x86_64-linux.tar.xz" in text
    assert "persist-credentials: false" in text
    assert "timeout-minutes:" in text
    assert "bun x commitlint" not in text
    assert "./node_modules/.bin/commitlint" in text


def test_ci_covers_main_release_schedule_and_manual_transitions() -> None:
    text = WORKFLOW.read_text()
    for trigger in ("merge_group:", "release:", "schedule:", "workflow_dispatch:"):
        assert trigger in text
    assert "refs/tags/" in text or "startsWith(github.ref, 'refs/tags/')" in text
    assert "tracked artifacts changed during verification" in text


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


# --- 6. Lifecycle hooks and honest tracked-artifact preservation ----------


def test_local_hooks_cover_fast_and_pinned_integration_loops() -> None:
    pre_commit = (ROOT / ".githooks" / "pre-commit").read_text()
    pre_push = ROOT / ".githooks" / "pre-push"
    assert "./scripts/check-fast.sh" in pre_commit
    assert pre_push.is_file()
    assert os.access(pre_push, os.X_OK)
    assert "nix develop --command ./scripts/check.sh" in pre_push.read_text()


def test_fast_loop_uses_actionlint_without_writing_python_bytecode() -> None:
    text = CHECK_FAST.read_text()
    assert "actionlint" in text
    assert "compileall" not in text
    assert "PYTHONPYCACHEPREFIX" in text


def test_ci_claims_and_checks_tracked_artifacts_not_zero_filesystem_writes() -> None:
    text = WORKFLOW.read_text()
    assert "tracked artifacts" in text
    assert "git diff --exit-code" in text
    assert "never mutates the checkout" not in (ROOT / "CONTRIBUTING.md").read_text()


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


@requires_bun
def test_commit_policy_rejects_executable_mode_drift(tmp_path: Path) -> None:
    workdir = tmp_path / "repo"
    shutil.copytree(ROOT, workdir, ignore=shutil.ignore_patterns("node_modules", ".git"))
    hook = workdir / ".githooks" / "commit-msg"
    hook.chmod(0o644)
    result = _run(["bun", "run", "scripts/check-commit-policy.ts"], cwd=workdir)
    assert result.returncode != 0
    assert "executable" in (result.stdout + result.stderr).lower()


@requires_bun
def test_commit_policy_rejects_declared_source_glob_drift(tmp_path: Path) -> None:
    workdir = tmp_path / "repo"
    shutil.copytree(ROOT, workdir, ignore=shutil.ignore_patterns("node_modules", ".git"))
    provenance_path = workdir / PROVENANCE.relative_to(ROOT)
    provenance = json.loads(provenance_path.read_text())
    provenance["configuration"]["sourceGlobs"] = ["*.ts"]
    provenance_path.write_text(json.dumps(provenance))
    result = _run(["bun", "run", "scripts/check-commit-policy.ts"], cwd=workdir)
    assert result.returncode != 0
    assert "sourceglobs" in (result.stdout + result.stderr).lower()


@requires_bun
def test_commit_policy_rejects_malformed_upstream_provenance(tmp_path: Path) -> None:
    workdir = tmp_path / "repo"
    shutil.copytree(ROOT, workdir, ignore=shutil.ignore_patterns("node_modules", ".git"))
    provenance_path = workdir / PROVENANCE.relative_to(ROOT)
    provenance = json.loads(provenance_path.read_text())
    provenance["upstream"]["commit"] = "not-a-commit"
    provenance_path.write_text(json.dumps(provenance))
    result = _run(["bun", "run", "scripts/check-commit-policy.ts"], cwd=workdir)
    assert result.returncode != 0
    assert "upstream" in (result.stdout + result.stderr).lower()


def test_provenance_records_local_hardening_adaptations() -> None:
    provenance = json.loads(PROVENANCE.read_text())
    adaptation_ids = {item["id"] for item in provenance["adaptations"]}
    assert {
        "commitlint-default-ignores-disabled",
        "pre-commit-fast-loop",
        "pre-push-integration",
    } <= adaptation_ids


def test_nix_source_filter_excludes_root_cache_directories() -> None:
    text = (ROOT / "flake.nix").read_text()
    for directory in ("node_modules", ".git", ".references", ".pytest_cache", ".ruff_cache"):
        assert f'name == "{directory}"' in text
