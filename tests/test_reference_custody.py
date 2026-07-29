"""Adversarial local-Git corpus for design spec 0004 (reference-source custody).

Every test builds its own temporary Git repositories; none needs network.
These are ``example_test`` evidence per the spec's evidence-limits section,
not a claim of remote-transport behavior.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
import os
import subprocess
from pathlib import Path

import pytest

from semantic_references import acquire, cli, curator, gitutil, status
from semantic_references import materialize as materialize_mod
from semantic_references.catalog import CatalogSource, parse_catalog_text
from semantic_references.errors import (
    AcquisitionError,
    CatalogError,
    CuratorLockedError,
    LockFileError,
    NotLockableError,
)
from semantic_references.lockfile import (
    LicenseObservation,
    Lock,
    LockEntry,
    load_lock,
    parse_lock_text,
    write_lock,
)

# --------------------------------------------------------------------------
# Git fixture helpers
# --------------------------------------------------------------------------


def _git(*args: str, cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True)


def _init_repo(path: Path, branch: str = "main") -> Path:
    path.mkdir(parents=True, exist_ok=True)
    _git("init", "-q", "-b", branch, ".", cwd=path)
    return path


def _commit_all(path: Path, message: str) -> str:
    _git("add", "-A", cwd=path)
    _git(
        "-c",
        "user.email=custody@example.com",
        "-c",
        "user.name=Custody Test",
        "commit",
        "-q",
        "-m",
        message,
        cwd=path,
    )
    return _git("rev-parse", "HEAD", cwd=path).stdout.strip()


def _add_remote(path: Path, url: str, name: str = "origin") -> None:
    _git("remote", "add", name, url, cwd=path)


def make_source(
    *,
    source_id: str = "local.demo",
    origin: str = "https://example.com/demo.git",
    local_hint: str | None = "../sibling",
    origin_aliases: tuple[str, ...] = (),
    track: str | None = "HEAD",
    license_paths: tuple[str, ...] = ("LICENSE",),
) -> CatalogSource:
    raw: dict[str, object] = {"id": source_id, "kind": "local-git", "origin": origin}
    if local_hint is not None:
        raw["local_hint"] = local_hint
    if origin_aliases:
        raw["origin_aliases"] = list(origin_aliases)
    if track is not None:
        raw["track"] = track
    if license_paths:
        raw["license_paths"] = list(license_paths)
    return CatalogSource(
        id=source_id,
        kind="local-git",
        origin=origin,
        local_hint=local_hint,
        origin_aliases=origin_aliases,
        track=track,
        license_paths=license_paths,
        classes=(),
        questions=(),
        raw=raw,
    )


@pytest.fixture
def sibling(tmp_path: Path) -> Path:
    repo = _init_repo(tmp_path / "sibling")
    (repo / "LICENSE").write_text("MIT\n")
    _commit_all(repo, "init")
    _add_remote(repo, "https://example.com/demo.git")
    return repo


# --------------------------------------------------------------------------
# Required positive scenario
# --------------------------------------------------------------------------


def test_positive_scenario_lock_advance_materialize_offline(tmp_path: Path, sibling: Path) -> None:
    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source()

    entry_a = acquire.lock_source(
        source,
        project_root=project_root,
        references_root=references_root,
        generator="test/1",
        offline=True,
        existing_entry=None,
    )
    commit_a = _git("rev-parse", "HEAD", cwd=sibling).stdout.strip()
    assert entry_a.commit == commit_a

    (sibling / "extra.txt").write_text("more\n")
    commit_b = _commit_all(sibling, "advance")
    assert commit_b != commit_a

    target = materialize_mod.materialize_source(
        source,
        entry_a,
        project_root=project_root,
        references_root=references_root,
        offline=True,
        allow_history_fallback=False,
    )
    assert gitutil.head_commit(target) == commit_a
    assert gitutil.is_detached_head(target)
    assert gitutil.is_clean_worktree(target)

    report = status.compute_status(
        source, Lock(generator="t", sources={source.id: entry_a}), references_root, lock_only=False
    )
    assert report.state == status.CustodyState.MATERIALIZED_WITH_VISIBLE_ASSUMPTION
    assert report.strict_ok

    entry_relock = acquire.lock_source(
        source,
        project_root=project_root,
        references_root=references_root,
        generator="test/1",
        offline=True,
        existing_entry=entry_a,
    )
    assert entry_relock.commit == commit_b

    stale_report = status.compute_status(
        source, Lock(generator="t", sources={source.id: entry_a}), references_root, lock_only=False
    )
    assert stale_report.state == status.CustodyState.MATERIALIZED_WITH_VISIBLE_ASSUMPTION
    assert gitutil.head_commit(target) == commit_a


def test_no_op_relock_is_byte_identical(tmp_path: Path, sibling: Path) -> None:
    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    lock_path = project_root / "references" / "sources.lock.json"
    (project_root / "references").mkdir(parents=True)
    source = make_source()

    entry_1 = acquire.lock_source(
        source,
        project_root=project_root,
        references_root=references_root,
        generator="semantic_references/x",
        offline=True,
        existing_entry=None,
    )
    write_lock(lock_path, Lock(generator="semantic_references/x", sources={source.id: entry_1}))
    bytes_1 = lock_path.read_bytes()

    entry_2 = acquire.lock_source(
        source,
        project_root=project_root,
        references_root=references_root,
        generator="semantic_references/x",
        offline=True,
        existing_entry=entry_1,
    )
    write_lock(lock_path, Lock(generator="semantic_references/x", sources={source.id: entry_2}))
    bytes_2 = lock_path.read_bytes()

    assert bytes_1 == bytes_2
    assert entry_1.retrieved_at == entry_2.retrieved_at


# --------------------------------------------------------------------------
# Minimal rejections
# --------------------------------------------------------------------------


def test_rejects_unsafe_source_id() -> None:
    text = """
schema = 1
[[source]]
id = "../escape"
kind = "git"
origin = "https://example.com/x.git"
"""
    with pytest.raises(CatalogError, match="path-safe"):
        parse_catalog_text(text)


def test_rejects_duplicate_source_id() -> None:
    text = """
schema = 1
[[source]]
id = "dup"
kind = "git"
origin = "https://example.com/x.git"
[[source]]
id = "dup"
kind = "git"
origin = "https://example.com/y.git"
"""
    with pytest.raises(CatalogError, match="duplicate"):
        parse_catalog_text(text)


def test_rejects_unsafe_license_path() -> None:
    text = """
schema = 1
[[source]]
id = "demo"
kind = "git"
origin = "https://example.com/x.git"
track = "HEAD"
license_paths = ["../LICENSE"]
"""
    with pytest.raises(CatalogError, match="normalized"):
        parse_catalog_text(text)


def test_rejects_duplicate_license_paths() -> None:
    text = """
schema = 1
[[source]]
id = "demo"
kind = "git"
origin = "https://example.com/x.git"
track = "HEAD"
license_paths = ["LICENSE", "LICENSE"]
"""
    with pytest.raises(CatalogError, match="duplicates"):
        parse_catalog_text(text)


def test_missing_strict_lock_entry_is_nonzero(tmp_path: Path) -> None:
    project_root = tmp_path / "project"
    (project_root / "references").mkdir(parents=True)
    source = make_source()
    report = status.compute_status(
        source, Lock(generator="t", sources={}), project_root / ".references", lock_only=False
    )
    assert report.state == status.CustodyState.QUEUED_UNLOCKED
    assert not report.strict_ok


def test_malformed_abbreviated_commit_is_rejected() -> None:
    text = json.dumps(
        {
            "schema": "reference-lock-v1",
            "generator": "semantic_references/0.1.0",
            "sources": {
                "demo": {
                    "origin": "https://example.com/x.git",
                    "track": "HEAD",
                    "resolved_ref": "HEAD",
                    "object_format": "sha1",
                    "commit": "abc123",
                    "tree": "b853b2e5524bf5af54f474ad71fd9c188efed49d",
                    "catalog_digest": "a" * 64,
                    "retrieved_at": "2026-07-29T00:00:00Z",
                    "acquisition": "remote",
                    "origin_verified": True,
                    "licenses": {"LICENSE": {"mode": "100644", "size": 4, "sha256": "b" * 64}},
                }
            },
        }
    )
    with pytest.raises(LockFileError, match="commit"):
        parse_lock_text(text)


def test_duplicate_json_keys_are_rejected() -> None:
    text = """
{
  "schema": "reference-lock-v1",
  "generator": "g",
  "generator": "g2",
  "sources": {}
}
"""
    with pytest.raises(LockFileError, match="duplicate"):
        parse_lock_text(text)


def test_unknown_schema_is_rejected() -> None:
    text = json.dumps({"schema": "reference-lock-v2", "generator": "g", "sources": {}})
    with pytest.raises(LockFileError, match="unknown lock schema"):
        parse_lock_text(text)


def test_catalog_origin_drift_is_reported_drifted(tmp_path: Path, sibling: Path) -> None:
    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source()

    entry = acquire.lock_source(
        source,
        project_root=project_root,
        references_root=references_root,
        generator="t",
        offline=True,
        existing_entry=None,
    )

    drifted_source = make_source(origin="https://example.com/drifted.git")
    report = status.compute_status(
        drifted_source,
        Lock(generator="t", sources={source.id: entry}),
        references_root,
        lock_only=False,
    )
    assert report.state == status.CustodyState.DRIFTED
    assert not report.strict_ok


def test_checkout_at_different_commit_is_drifted(tmp_path: Path, sibling: Path) -> None:
    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source()

    entry = acquire.lock_source(
        source,
        project_root=project_root,
        references_root=references_root,
        generator="t",
        offline=True,
        existing_entry=None,
    )
    materialize_mod.materialize_source(
        source,
        entry,
        project_root=project_root,
        references_root=references_root,
        offline=True,
        allow_history_fallback=False,
    )

    checkout = materialize_mod.checkout_dir(references_root, source.id)
    (checkout / "extra.txt").write_text("mutation\n")
    _git("add", "-A", cwd=checkout)
    _git(
        "-c", "user.email=a@b.c", "-c", "user.name=T", "commit", "-q", "-m", "mutate", cwd=checkout
    )

    report = status.compute_status(
        source, Lock(generator="t", sources={source.id: entry}), references_root, lock_only=False
    )
    assert report.state == status.CustodyState.DRIFTED
    assert not report.strict_ok


def test_dirty_checkout_is_unverifiable(tmp_path: Path, sibling: Path) -> None:
    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source()

    entry = acquire.lock_source(
        source,
        project_root=project_root,
        references_root=references_root,
        generator="t",
        offline=True,
        existing_entry=None,
    )
    materialize_mod.materialize_source(
        source,
        entry,
        project_root=project_root,
        references_root=references_root,
        offline=True,
        allow_history_fallback=False,
    )
    checkout = materialize_mod.checkout_dir(references_root, source.id)
    (checkout / "untracked.txt").write_text("dirt\n")

    report = status.compute_status(
        source, Lock(generator="t", sources={source.id: entry}), references_root, lock_only=False
    )
    assert report.state == status.CustodyState.UNVERIFIABLE
    assert not report.strict_ok


def test_changed_license_bytes_uncommitted_is_unverifiable(tmp_path: Path, sibling: Path) -> None:
    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source()

    entry = acquire.lock_source(
        source,
        project_root=project_root,
        references_root=references_root,
        generator="t",
        offline=True,
        existing_entry=None,
    )
    materialize_mod.materialize_source(
        source,
        entry,
        project_root=project_root,
        references_root=references_root,
        offline=True,
        allow_history_fallback=False,
    )
    checkout = materialize_mod.checkout_dir(references_root, source.id)
    # Modify without committing: HEAD still names the locked commit, but the
    # working-tree bytes for the license no longer match it.
    (checkout / "LICENSE").write_text("MODIFIED\n")

    report = status.compute_status(
        source, Lock(generator="t", sources={source.id: entry}), references_root, lock_only=False
    )
    assert report.state == status.CustodyState.UNVERIFIABLE
    assert not report.strict_ok


def test_missing_license_uncommitted_is_unverifiable(tmp_path: Path, sibling: Path) -> None:
    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source(license_paths=("LICENSE", "NOTICE"))
    (sibling / "NOTICE").write_text("notice\n")
    _commit_all(sibling, "add notice")

    entry = acquire.lock_source(
        source,
        project_root=project_root,
        references_root=references_root,
        generator="t",
        offline=True,
        existing_entry=None,
    )
    materialize_mod.materialize_source(
        source,
        entry,
        project_root=project_root,
        references_root=references_root,
        offline=True,
        allow_history_fallback=False,
    )
    checkout = materialize_mod.checkout_dir(references_root, source.id)
    (checkout / "NOTICE").unlink()

    report = status.compute_status(
        source, Lock(generator="t", sources={source.id: entry}), references_root, lock_only=False
    )
    assert report.state == status.CustodyState.UNVERIFIABLE
    assert not report.strict_ok


def test_symlinked_license_is_rejected_at_lock_time(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path / "sibling")
    real = repo / "REAL_LICENSE"
    real.write_text("MIT\n")
    (repo / "LICENSE").symlink_to("REAL_LICENSE")
    _commit_all(repo, "init with symlink license")
    _add_remote(repo, "https://example.com/demo.git")

    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source()

    with pytest.raises(AcquisitionError, match="symlink"):
        acquire.lock_source(
            source,
            project_root=project_root,
            references_root=references_root,
            generator="t",
            offline=True,
            existing_entry=None,
        )


def test_local_remote_mismatch_is_rejected(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path / "sibling")
    (repo / "LICENSE").write_text("MIT\n")
    _commit_all(repo, "init")
    _add_remote(repo, "https://example.com/WRONG.git")

    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source()

    with pytest.raises(AcquisitionError, match="does not match"):
        acquire.lock_source(
            source,
            project_root=project_root,
            references_root=references_root,
            generator="t",
            offline=True,
            existing_entry=None,
        )


def test_unavailable_offline_object_is_rejected(tmp_path: Path) -> None:
    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source(local_hint=None)

    with pytest.raises(AcquisitionError, match="offline"):
        acquire.lock_source(
            source,
            project_root=project_root,
            references_root=references_root,
            generator="t",
            offline=True,
            existing_entry=None,
        )


def test_not_lockable_source_cannot_be_locked(tmp_path: Path) -> None:
    project_root = tmp_path / "project"
    project_root.mkdir()
    source = make_source(track=None, license_paths=())
    with pytest.raises(NotLockableError):
        acquire.lock_source(
            source,
            project_root=project_root,
            references_root=project_root / ".references",
            generator="t",
            offline=True,
            existing_entry=None,
        )


# --------------------------------------------------------------------------
# Adversarial cases
# --------------------------------------------------------------------------


def test_failed_fetch_cannot_overwrite_valid_lock_or_cache(tmp_path: Path, sibling: Path) -> None:
    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source()

    good_entry = acquire.lock_source(
        source,
        project_root=project_root,
        references_root=references_root,
        generator="t",
        offline=True,
        existing_entry=None,
    )
    cache_dir = acquire.object_cache_dir(references_root, source.id)
    assert not cache_dir.exists()  # offline lock never populates the remote cache

    materialize_mod.materialize_source(
        source,
        good_entry,
        project_root=project_root,
        references_root=references_root,
        offline=True,
        allow_history_fallback=False,
    )
    target = materialize_mod.checkout_dir(references_root, source.id)
    good_head = gitutil.head_commit(target)

    # Advance the sibling and re-lock, so a *newer* commit is now the declared
    # target — but do not materialize it yet. The on-disk checkout at
    # `good_head` is still the last valid artifact.
    (sibling / "extra.txt").write_text("more\n")
    _commit_all(sibling, "advance")
    advanced_entry = acquire.lock_source(
        source,
        project_root=project_root,
        references_root=references_root,
        generator="t",
        offline=True,
        existing_entry=good_entry,
    )
    assert advanced_entry.commit != good_entry.commit

    broken_remote_source = make_source(origin="file:///nonexistent/does/not/exist.git")
    with pytest.raises(AcquisitionError):
        materialize_mod.materialize_source(
            broken_remote_source,
            advanced_entry,
            project_root=project_root,
            references_root=references_root,
            offline=False,
            allow_history_fallback=False,
        )

    # the previously valid checkout must be untouched by the failed attempt
    assert gitutil.head_commit(target) == good_head
    assert gitutil.is_clean_worktree(target)


def test_uncommitted_sibling_content_does_not_affect_hashes(tmp_path: Path, sibling: Path) -> None:
    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source()

    (sibling / "LICENSE").write_text("TAMPERED UNCOMMITTED\n")

    entry = acquire.lock_source(
        source,
        project_root=project_root,
        references_root=references_root,
        generator="t",
        offline=True,
        existing_entry=None,
    )
    assert entry.licenses["LICENSE"].sha256 == hashlib.sha256(b"MIT\n").hexdigest()


def test_multiple_license_artifacts_all_verify(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path / "sibling")
    (repo / "LICENSE").write_text("MIT\n")
    (repo / "LICENSE-APACHE").write_text("Apache\n")
    _commit_all(repo, "init")
    _add_remote(repo, "https://example.com/demo.git")

    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source(license_paths=("LICENSE", "LICENSE-APACHE"))

    entry = acquire.lock_source(
        source,
        project_root=project_root,
        references_root=references_root,
        generator="t",
        offline=True,
        existing_entry=None,
    )
    assert set(entry.licenses) == {"LICENSE", "LICENSE-APACHE"}

    materialize_mod.materialize_source(
        source,
        entry,
        project_root=project_root,
        references_root=references_root,
        offline=True,
        allow_history_fallback=False,
    )
    report = status.compute_status(
        source, Lock(generator="t", sources={source.id: entry}), references_root, lock_only=False
    )
    assert report.strict_ok

    # corrupt only one of the two artifacts after materialization
    checkout = materialize_mod.checkout_dir(references_root, source.id)
    (checkout / "LICENSE-APACHE").write_text("CHANGED\n")
    _git("add", "-A", cwd=checkout)
    _git(
        "-c",
        "user.email=a@b.c",
        "-c",
        "user.name=T",
        "commit",
        "-q",
        "-m",
        "tamper one",
        cwd=checkout,
    )
    report2 = status.compute_status(
        source, Lock(generator="t", sources={source.id: entry}), references_root, lock_only=False
    )
    assert not report2.strict_ok


def test_submodule_gitlink_cannot_masquerade_as_license(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path / "sibling")
    (repo / "LICENSE").write_text("MIT\n")
    _commit_all(repo, "init")
    (repo / "LICENSE").unlink()
    _git(
        "update-index",
        "--add",
        "--cacheinfo",
        f"160000,{'a' * 40},LICENSE",
        cwd=repo,
    )
    _git(
        "-c",
        "user.email=custody@example.com",
        "-c",
        "user.name=Custody Test",
        "commit",
        "-q",
        "-m",
        "turn LICENSE into a gitlink",
        cwd=repo,
    )
    _add_remote(repo, "https://example.com/demo.git")

    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source()

    with pytest.raises(AcquisitionError, match="not a blob"):
        acquire.lock_source(
            source,
            project_root=project_root,
            references_root=references_root,
            generator="t",
            offline=True,
            existing_entry=None,
        )


def test_lfs_pointer_cannot_masquerade_as_materialized_license(
    tmp_path: Path, sibling: Path
) -> None:
    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source()

    entry = acquire.lock_source(
        source,
        project_root=project_root,
        references_root=references_root,
        generator="t",
        offline=True,
        existing_entry=None,
    )
    materialize_mod.materialize_source(
        source,
        entry,
        project_root=project_root,
        references_root=references_root,
        offline=True,
        allow_history_fallback=False,
    )
    checkout = materialize_mod.checkout_dir(references_root, source.id)
    pointer = "version https://git-lfs.github.com/spec/v1\noid sha256:" + "0" * 64 + "\nsize 4\n"
    (checkout / "LICENSE").write_text(pointer)

    report = status.compute_status(
        source, Lock(generator="t", sources={source.id: entry}), references_root, lock_only=False
    )
    assert not report.strict_ok


def test_local_only_custody_is_visibly_weaker_than_remote_verified(tmp_path: Path) -> None:
    origin_repo = _init_repo(tmp_path / "origin.git")
    (origin_repo / "LICENSE").write_text("MIT\n")
    _commit_all(origin_repo, "init")

    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"

    remote_source = make_source(
        source_id="remote.demo",
        origin=f"file://{origin_repo}",
        local_hint=None,
        track="main",
    )
    remote_entry = acquire.lock_source(
        remote_source,
        project_root=project_root,
        references_root=references_root,
        generator="t",
        offline=False,
        existing_entry=None,
    )
    materialize_mod.materialize_source(
        remote_source,
        remote_entry,
        project_root=project_root,
        references_root=references_root,
        offline=False,
        allow_history_fallback=False,
    )
    remote_report = status.compute_status(
        remote_source,
        Lock(generator="t", sources={remote_source.id: remote_entry}),
        references_root,
        lock_only=False,
    )
    assert remote_report.state == status.CustodyState.MATERIALIZED_VERIFIED

    sibling_repo = _init_repo(tmp_path / "sibling")
    (sibling_repo / "LICENSE").write_text("MIT\n")
    _commit_all(sibling_repo, "init")
    _add_remote(sibling_repo, "https://example.com/demo.git")
    local_source = make_source(source_id="local.demo2", origin="https://example.com/demo.git")
    local_entry = acquire.lock_source(
        local_source,
        project_root=project_root,
        references_root=references_root,
        generator="t",
        offline=True,
        existing_entry=None,
    )
    materialize_mod.materialize_source(
        local_source,
        local_entry,
        project_root=project_root,
        references_root=references_root,
        offline=True,
        allow_history_fallback=False,
    )
    local_report = status.compute_status(
        local_source,
        Lock(generator="t", sources={local_source.id: local_entry}),
        references_root,
        lock_only=False,
    )
    assert local_report.state == status.CustodyState.MATERIALIZED_WITH_VISIBLE_ASSUMPTION
    assert local_report.state != remote_report.state


def test_curator_lock_rejects_concurrent_mutation(tmp_path: Path) -> None:
    references_root = tmp_path / ".references"
    with (
        curator.curator_lock(references_root),
        pytest.raises(CuratorLockedError, match="curator"),
        curator.curator_lock(references_root),
    ):
        pass


# --------------------------------------------------------------------------
# CLI plumbing
# --------------------------------------------------------------------------


def test_cli_visible_scenario(
    tmp_path: Path, sibling: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    project_root = tmp_path / "project"
    (project_root / "references").mkdir(parents=True)
    (project_root / "references" / "sources.toml").write_text(
        """
schema = 1

[[source]]
id = "local.demo"
kind = "local-git"
origin = "https://example.com/demo.git"
local_hint = "../sibling"
track = "HEAD"
license_paths = ["LICENSE"]
"""
    )

    exit_code = cli.main(["--root", str(project_root), "catalog-check"])
    assert exit_code == 0

    exit_code = cli.main(["--root", str(project_root), "status", "local.demo"])
    assert exit_code == 1  # queued_unlocked

    exit_code = cli.main(["--root", str(project_root), "lock", "local.demo", "--offline"])
    assert exit_code == 0

    exit_code = cli.main(["--root", str(project_root), "materialize", "local.demo", "--offline"])
    assert exit_code == 0

    capsys.readouterr()
    exit_code = cli.main(["--root", str(project_root), "status", "local.demo", "--json"])
    captured = capsys.readouterr()
    assert exit_code == 0
    payload = json.loads(captured.out)
    assert payload[0]["state"] == "materialized_with_visible_assumption"

    lock_path = project_root / "references" / "sources.lock.json"
    assert lock_path.exists()
    reloaded = load_lock(lock_path)
    assert "local.demo" in reloaded.sources


def test_cli_status_all_requires_id_or_all(tmp_path: Path) -> None:
    project_root = tmp_path / "project"
    (project_root / "references").mkdir(parents=True)
    (project_root / "references" / "sources.toml").write_text("schema = 1\n")
    exit_code = cli.main(["--root", str(project_root), "status"])
    assert exit_code == cli.EXIT_USAGE_ERROR


# --------------------------------------------------------------------------
# Corrective fixes: gate findings on e2b8251
# --------------------------------------------------------------------------


def test_materialize_refuses_mismatched_existing_checkout_and_never_deletes_it(
    tmp_path: Path, sibling: Path
) -> None:
    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source()

    entry_a = acquire.lock_source(
        source,
        project_root=project_root,
        references_root=references_root,
        generator="t",
        offline=True,
        existing_entry=None,
    )
    materialize_mod.materialize_source(
        source,
        entry_a,
        project_root=project_root,
        references_root=references_root,
        offline=True,
        allow_history_fallback=False,
    )
    target = materialize_mod.checkout_dir(references_root, source.id)
    commit_a = gitutil.head_commit(target)
    marker = target / "LICENSE"
    marker_bytes = marker.read_bytes()

    (sibling / "extra.txt").write_text("more\n")
    commit_b = _commit_all(sibling, "advance")
    assert commit_b != commit_a

    entry_b = acquire.lock_source(
        source,
        project_root=project_root,
        references_root=references_root,
        generator="t",
        offline=True,
        existing_entry=entry_a,
    )
    assert entry_b.commit == commit_b

    with pytest.raises(AcquisitionError, match="refusing to overwrite"):
        materialize_mod.materialize_source(
            source,
            entry_b,
            project_root=project_root,
            references_root=references_root,
            offline=True,
            allow_history_fallback=False,
        )

    # the mismatched checkout must survive untouched — never deleted, never
    # silently replaced.
    assert target.exists()
    assert gitutil.head_commit(target) == commit_a
    assert marker.read_bytes() == marker_bytes


def test_cache_replacement_preserves_prior_valid_cache_on_failed_relock(tmp_path: Path) -> None:
    origin_repo = _init_repo(tmp_path / "origin", branch="main")
    (origin_repo / "LICENSE").write_text("MIT\n")
    _commit_all(origin_repo, "init")

    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source(
        source_id="remote.cache-demo",
        origin=f"file://{origin_repo}",
        local_hint=None,
        track="main",
    )

    entry_a = acquire.lock_source(
        source,
        project_root=project_root,
        references_root=references_root,
        generator="t",
        offline=False,
        existing_entry=None,
    )
    cache_dir = acquire.object_cache_dir(references_root, source.id)
    assert cache_dir.exists()
    marker = cache_dir / "MARKER-KEEP"
    marker.write_text("prior valid cache")

    # Advance origin and remove the declared license — the next fetch will
    # succeed, but license validation must fail *before* the cache is touched.
    (origin_repo / "LICENSE").unlink()
    _commit_all(origin_repo, "drop license")

    with pytest.raises(AcquisitionError):
        acquire.lock_source(
            source,
            project_root=project_root,
            references_root=references_root,
            generator="t",
            offline=False,
            existing_entry=entry_a,
        )

    # the prior valid cache (identified by our marker) must still be there,
    # still resolving to the original locked commit.
    assert marker.exists()
    assert gitutil.object_exists(cache_dir, entry_a.commit)


def test_cache_install_restores_backup_on_final_rename_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    origin_repo = _init_repo(tmp_path / "origin", branch="main")
    (origin_repo / "LICENSE").write_text("MIT\n")
    _commit_all(origin_repo, "init")

    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source(
        source_id="remote.install-demo",
        origin=f"file://{origin_repo}",
        local_hint=None,
        track="main",
    )

    entry_a = acquire.lock_source(
        source,
        project_root=project_root,
        references_root=references_root,
        generator="t",
        offline=False,
        existing_entry=None,
    )
    cache_dir = acquire.object_cache_dir(references_root, source.id)
    marker = cache_dir / "MARKER-KEEP"
    marker.write_text("prior valid cache")

    # Advance origin so the next lock has genuinely new content to fetch and
    # install — the fetch and validation must succeed this time; only the
    # final rename-into-place is made to fail.
    (origin_repo / "extra.txt").write_text("more\n")
    _commit_all(origin_repo, "advance")

    def boom(_tmp_dir: Path, _cache_dir: Path) -> None:
        raise OSError("simulated: final rename-into-place failed")

    monkeypatch.setattr(acquire, "_rename_into_place", boom)

    with pytest.raises(OSError, match="simulated"):
        acquire.lock_source(
            source,
            project_root=project_root,
            references_root=references_root,
            generator="t",
            offline=False,
            existing_entry=entry_a,
        )

    # The prior valid cache must be restored exactly — marker byte-for-byte,
    # and the original locked commit still reachable as a Git object.
    assert marker.exists()
    assert marker.read_text() == "prior valid cache"
    assert gitutil.object_exists(cache_dir, entry_a.commit)

    # No backup or temp litter left behind.
    backup_dir = cache_dir.with_name(cache_dir.name + ".backup-swap")
    assert not backup_dir.exists()
    leftover_tmp = [p for p in cache_dir.parent.iterdir() if p.name.startswith(".lock-fetch-")]
    assert leftover_tmp == []


def test_remote_materialize_sequence_exact_then_ref_then_history_fallback(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    origin_repo = _init_repo(tmp_path / "origin", branch="main")
    (origin_repo / "LICENSE").write_text("MIT\n")
    commit_a = _commit_all(origin_repo, "init")
    (origin_repo / "extra.txt").write_text("more\n")
    _commit_all(origin_repo, "advance past locked commit")

    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source(
        source_id="remote.sequence-demo",
        origin=f"file://{origin_repo}",
        local_hint=None,
        track="main",
    )

    entry = LockEntry(
        origin=source.origin,
        track="main",
        resolved_ref="main",
        object_format="sha1",
        commit=commit_a,
        tree=gitutil.tree_of_commit(origin_repo, commit_a),
        catalog_digest=source.canonical_digest(),
        retrieved_at="2026-01-01T00:00:00Z",
        acquisition="remote",
        origin_verified=True,
        licenses={
            "LICENSE": LicenseObservation(
                mode="100644", size=4, sha256=hashlib.sha256(b"MIT\n").hexdigest()
            )
        },
    )

    real_fetch = gitutil.fetch_shallow_blobless
    attempted_refs: list[str] = []

    def fake_fetch(repo_dir: Path, url: str, ref: str) -> str:
        attempted_refs.append(ref)
        if ref == entry.commit:
            # Simulate a server that disallows fetching an arbitrary SHA.
            raise AcquisitionError("simulated: server refuses SHA fetch")
        return real_fetch(repo_dir, url, ref)

    monkeypatch.setattr(gitutil, "fetch_shallow_blobless", fake_fetch)

    # The recorded ref ("main") has moved past the locked commit, so without
    # history fallback this must fail — and it must have tried the exact
    # commit first, then the recorded ref, in that order.
    with pytest.raises(AcquisitionError, match="allow-history-fallback"):
        materialize_mod.materialize_source(
            source,
            entry,
            project_root=project_root,
            references_root=references_root,
            offline=False,
            allow_history_fallback=False,
        )
    assert attempted_refs == [entry.commit, entry.resolved_ref]

    # A distinct source id: the checkout dir must not already exist for it.
    # Its lock entry must carry that source's own catalog digest, because
    # materialize now refuses an entry bound to a different catalog record.
    source2 = make_source(
        source_id="remote.sequence-demo-2", origin=source.origin, local_hint=None, track="main"
    )
    entry2 = dataclasses.replace(entry, catalog_digest=source2.canonical_digest())
    target = materialize_mod.materialize_source(
        source2,
        entry2,
        project_root=project_root,
        references_root=references_root,
        offline=False,
        allow_history_fallback=True,
    )
    assert gitutil.head_commit(target) == commit_a


def test_lock_resolves_symbolic_head_offline_via_sibling(tmp_path: Path) -> None:
    sibling_repo = _init_repo(tmp_path / "sibling", branch="trunk")
    (sibling_repo / "LICENSE").write_text("MIT\n")
    _commit_all(sibling_repo, "init")
    _add_remote(sibling_repo, "https://example.com/demo.git")

    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source()

    entry = acquire.lock_source(
        source,
        project_root=project_root,
        references_root=references_root,
        generator="t",
        offline=True,
        existing_entry=None,
    )
    assert entry.track == "HEAD"
    assert entry.resolved_ref == "refs/heads/trunk"


def test_lock_resolves_symbolic_head_remote(tmp_path: Path) -> None:
    origin_repo = _init_repo(tmp_path / "origin", branch="trunk")
    (origin_repo / "LICENSE").write_text("MIT\n")
    _commit_all(origin_repo, "init")

    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source(
        source_id="remote.head-demo", origin=f"file://{origin_repo}", local_hint=None, track="HEAD"
    )

    entry = acquire.lock_source(
        source,
        project_root=project_root,
        references_root=references_root,
        generator="t",
        offline=False,
        existing_entry=None,
    )
    assert entry.track == "HEAD"
    assert entry.resolved_ref == "refs/heads/trunk"


def test_git_invocations_disable_hooks(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    gitutil.init_repo(repo)
    (repo / "file.txt").write_text("x\n")
    _commit_all(repo, "init")

    hooks_dir = repo / ".git" / "hooks"
    marker = tmp_path / "hook-fired"
    hook = hooks_dir / "post-checkout"
    hook.write_text(f"#!/bin/sh\ntouch {marker}\n")
    hook.chmod(0o755)

    commit = gitutil.resolve_commit(repo, "HEAD")
    gitutil.checkout_detached(repo, commit)

    assert not marker.exists()


def test_git_invocations_ignore_global_config(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake_home = tmp_path / "fake_home"
    fake_home.mkdir()
    (fake_home / ".gitconfig").write_text("[custody]\n  poisoned = true\n")
    monkeypatch.setenv("HOME", str(fake_home))

    repo = tmp_path / "repo2"
    gitutil.init_repo(repo)
    result = gitutil.run_git(["-C", str(repo), "config", "--get", "custody.poisoned"], check=False)
    assert result.returncode != 0


def test_rejects_option_like_origin() -> None:
    text = """
schema = 1
[[source]]
id = "demo"
kind = "git"
origin = "--upload-pack=evil"
track = "HEAD"
license_paths = ["LICENSE"]
"""
    with pytest.raises(CatalogError, match="origin"):
        parse_catalog_text(text)


def test_rejects_control_character_track() -> None:
    text = (
        "schema = 1\n"
        "[[source]]\n"
        'id = "demo"\n'
        'kind = "git"\n'
        'origin = "https://example.com/x.git"\n'
        'track = "HEAD\\u001b[31m"\n'
        'license_paths = ["LICENSE"]\n'
    )
    with pytest.raises(CatalogError, match="track"):
        parse_catalog_text(text)


def test_rejects_option_like_origin_alias() -> None:
    text = """
schema = 1
[[source]]
id = "demo"
kind = "git"
origin = "https://example.com/x.git"
origin_aliases = ["-x"]
track = "HEAD"
license_paths = ["LICENSE"]
"""
    with pytest.raises(CatalogError, match="origin_aliases"):
        parse_catalog_text(text)


def test_rejects_unsafe_lock_source_id() -> None:
    text = json.dumps(
        {
            "schema": "reference-lock-v1",
            "generator": "g",
            "sources": {
                "../escape": {
                    "origin": "https://example.com/x.git",
                    "track": "HEAD",
                    "resolved_ref": "HEAD",
                    "object_format": "sha1",
                    "commit": "a" * 40,
                    "tree": "b" * 40,
                    "catalog_digest": "c" * 64,
                    "retrieved_at": "2026-01-01T00:00:00Z",
                    "acquisition": "remote",
                    "origin_verified": True,
                    "licenses": {"LICENSE": {"mode": "100644", "size": 1, "sha256": "d" * 64}},
                }
            },
        }
    )
    with pytest.raises(LockFileError, match="unsafe"):
        parse_lock_text(text)


def test_lock_only_status_succeeds_without_materialization(tmp_path: Path, sibling: Path) -> None:
    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source()

    entry = acquire.lock_source(
        source,
        project_root=project_root,
        references_root=references_root,
        generator="t",
        offline=True,
        existing_entry=None,
    )
    lock = Lock(generator="t", sources={source.id: entry})

    lock_only_report = status.compute_status(source, lock, references_root, lock_only=True)
    assert lock_only_report.state == status.CustodyState.LOCKED_UNMATERIALIZED
    assert lock_only_report.strict_ok

    strict_default_report = status.compute_status(source, lock, references_root, lock_only=False)
    assert strict_default_report.state == status.CustodyState.LOCKED_UNMATERIALIZED
    assert not strict_default_report.strict_ok


def test_cli_lock_only_status_exits_zero(tmp_path: Path, sibling: Path) -> None:
    project_root = tmp_path / "project"
    (project_root / "references").mkdir(parents=True)
    (project_root / "references" / "sources.toml").write_text(
        """
schema = 1

[[source]]
id = "local.demo"
kind = "local-git"
origin = "https://example.com/demo.git"
local_hint = "../sibling"
track = "HEAD"
license_paths = ["LICENSE"]
"""
    )

    assert cli.main(["--root", str(project_root), "lock", "local.demo", "--offline"]) == 0
    assert cli.main(["--root", str(project_root), "status", "local.demo"]) == 1
    assert cli.main(["--root", str(project_root), "status", "local.demo", "--lock-only"]) == 0


def test_cli_lock_all_is_transactional_on_partial_failure(tmp_path: Path, sibling: Path) -> None:
    project_root = tmp_path / "project"
    (project_root / "references").mkdir(parents=True)
    (project_root / "references" / "sources.toml").write_text(
        """
schema = 1

[[source]]
id = "local.good"
kind = "local-git"
origin = "https://example.com/demo.git"
local_hint = "../sibling"
track = "HEAD"
license_paths = ["LICENSE"]

[[source]]
id = "local.bad"
kind = "local-git"
origin = "https://example.com/nowhere.git"
local_hint = "../missing-sibling"
track = "HEAD"
license_paths = ["LICENSE"]
"""
    )
    lock_path = project_root / "references" / "sources.lock.json"

    exit_code = cli.main(["--root", str(project_root), "lock", "--all", "--offline"])
    assert exit_code == 1
    assert not lock_path.exists()

    # Now lock only the good one, establishing a valid baseline lock file.
    assert cli.main(["--root", str(project_root), "lock", "local.good", "--offline"]) == 0
    baseline_bytes = lock_path.read_bytes()

    # Re-running --all again still fails on the bad source and must not
    # rewrite the file at all — not even to re-affirm the good entry.
    exit_code = cli.main(["--root", str(project_root), "lock", "--all", "--offline"])
    assert exit_code == 1
    assert lock_path.read_bytes() == baseline_bytes


# --------------------------------------------------------------------------
# Adversarial oracles for the independently reproduced counterexamples
# against commit 94583c4 (design spec 0004 conformance).
#
# Each of the seven blocks below was written and observed FAILING against the
# uncorrected implementation before the corresponding production change.
# --------------------------------------------------------------------------


def _write_transport_probe(bin_dir: Path, marker: Path) -> None:
    """Install a Git remote helper for the ``custodyprobe::`` transport.

    Git execs ``git-remote-custodyprobe`` from ``PATH`` whenever it actually
    opens that transport, so the marker file is a direct observation that a
    real transport was invoked — not a proxy for a command-line flag.
    """
    bin_dir.mkdir(parents=True, exist_ok=True)
    helper = bin_dir / "git-remote-custodyprobe"
    helper.write_text(f'#!/bin/sh\ntouch "{marker}"\necho "custodyprobe invoked" >&2\nexit 1\n')
    helper.chmod(0o755)


def _entry_for(
    source: CatalogSource, repo: Path, commit: str, license_bytes: bytes = b"MIT\n"
) -> LockEntry:
    return LockEntry(
        origin=source.origin,
        track=source.track or "main",
        resolved_ref="refs/heads/main",
        object_format="sha1",
        commit=commit,
        tree=_git("rev-parse", "--verify", f"{commit}^{{tree}}", cwd=repo).stdout.strip(),
        catalog_digest=source.canonical_digest(),
        retrieved_at="2026-01-01T00:00:00Z",
        acquisition="remote",
        origin_verified=True,
        licenses={
            "LICENSE": LicenseObservation(
                mode="100644",
                size=len(license_bytes),
                sha256=hashlib.sha256(license_bytes).hexdigest(),
            )
        },
    )


# 1. Offline lazy-fetch exclusion ------------------------------------------


def test_offline_object_reads_never_invoke_the_transport(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A promisor cache missing the declared license blob must fail closed.

    Boundary: a real partial (promisor) clone plus a real Git remote helper
    binary. Reading a missing blob is what makes Git open the promisor
    transport, so the marker proves invocation rather than inferring it.
    """
    origin = _init_repo(tmp_path / "origin", branch="main")
    (origin / "LICENSE").write_text("MIT\n")
    commit = _commit_all(origin, "init")
    _git("config", "uploadpack.allowFilter", "true", cwd=origin)

    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source(
        source_id="promisor.demo",
        origin=f"file://{origin}",
        local_hint=None,
        track="main",
    )

    cache_dir = acquire.object_cache_dir(references_root, source.id)
    cache_dir.parent.mkdir(parents=True, exist_ok=True)
    _git(
        "clone",
        "-q",
        "--filter=blob:none",
        "--no-checkout",
        f"file://{origin}",
        str(cache_dir),
        cwd=tmp_path,
    )
    assert (
        _git("config", "--get", "remote.origin.partialclonefilter", cwd=cache_dir).stdout.strip()
        == "blob:none"
    )

    marker = tmp_path / "transport-invoked"
    bin_dir = tmp_path / "bin"
    _write_transport_probe(bin_dir, marker)
    _git("remote", "set-url", "origin", f"custodyprobe::file://{origin}", cwd=cache_dir)
    monkeypatch.setenv("PATH", f"{bin_dir}{os.pathsep}{os.environ['PATH']}")

    with pytest.raises(AcquisitionError):
        acquire.lock_source(
            source,
            project_root=project_root,
            references_root=references_root,
            generator="t",
            offline=True,
            existing_entry=None,
        )
    assert not marker.exists(), "offline lock opened the Git transport (promisor lazy fetch)"

    entry = _entry_for(source, origin, commit)
    with pytest.raises(AcquisitionError):
        materialize_mod.materialize_source(
            source,
            entry,
            project_root=project_root,
            references_root=references_root,
            offline=True,
            allow_history_fallback=False,
        )
    assert not marker.exists(), "offline materialize opened the Git transport (promisor lazy fetch)"


# 2. Status network and mutation exclusion ---------------------------------


def test_status_ignores_git_configuration_and_never_mutates_the_index(
    tmp_path: Path, sibling: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Repository and inherited Git configuration must not steer status.

    Boundary: real ``.git/config`` keys, real inherited ``GIT_CONFIG_*``
    environment injection, a real ``core.fsmonitor`` program, and the real
    ``.git/index`` bytes on disk.
    """
    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source()

    entry = acquire.lock_source(
        source,
        project_root=project_root,
        references_root=references_root,
        generator="t",
        offline=True,
        existing_entry=None,
    )
    materialize_mod.materialize_source(
        source,
        entry,
        project_root=project_root,
        references_root=references_root,
        offline=True,
        allow_history_fallback=False,
    )
    checkout = materialize_mod.checkout_dir(references_root, source.id)

    # (a) repository-local configuration that hides working-tree dirt
    _git("config", "status.showUntrackedFiles", "no", cwd=checkout)
    # (b) a repository-configured program status must never execute
    fsmonitor_marker = tmp_path / "fsmonitor-ran"
    hook = tmp_path / "fsmonitor-hook"
    hook.write_text(f'#!/bin/sh\ntouch "{fsmonitor_marker}"\nexit 1\n')
    hook.chmod(0o755)
    _git("config", "core.fsmonitor", str(hook), cwd=checkout)
    # (c) inherited configuration injected through the environment
    monkeypatch.setenv("GIT_CONFIG_COUNT", "1")
    monkeypatch.setenv("GIT_CONFIG_KEY_0", "status.showUntrackedFiles")
    monkeypatch.setenv("GIT_CONFIG_VALUE_0", "no")

    (checkout / "untracked.txt").write_text("dirt\n")
    index = checkout / ".git" / "index"
    index_bytes_before = index.read_bytes()
    index_mtime_before = index.stat().st_mtime_ns

    report = status.compute_status(
        source, Lock(generator="t", sources={source.id: entry}), references_root, lock_only=False
    )

    assert not report.strict_ok, "configured status suppression hid working-tree dirt"
    assert report.state == status.CustodyState.UNVERIFIABLE
    assert not fsmonitor_marker.exists(), "status executed a repository-configured program"
    assert index.read_bytes() == index_bytes_before, "status mutated .git/index bytes"
    assert index.stat().st_mtime_ns == index_mtime_before, "status mutated .git/index metadata"


# 3. Working-tree license-byte binding -------------------------------------


def test_assume_unchanged_license_tampering_is_rejected(tmp_path: Path, sibling: Path) -> None:
    """``assume-unchanged`` must not let changed license bytes pass.

    Boundary: the real Git index bit that suppresses change detection, and
    the real on-disk bytes a researcher would read.
    """
    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source()

    entry = acquire.lock_source(
        source,
        project_root=project_root,
        references_root=references_root,
        generator="t",
        offline=True,
        existing_entry=None,
    )
    materialize_mod.materialize_source(
        source,
        entry,
        project_root=project_root,
        references_root=references_root,
        offline=True,
        allow_history_fallback=False,
    )
    checkout = materialize_mod.checkout_dir(references_root, source.id)

    _git("update-index", "--assume-unchanged", "LICENSE", cwd=checkout)
    (checkout / "LICENSE").write_text("TAMPERED\n")
    assert (checkout / "LICENSE").read_bytes() == b"TAMPERED\n"
    assert (
        _git("status", "--porcelain=v1", cwd=checkout).stdout.strip() == ""
    )  # Git itself reports the tampered tree as clean

    report = status.compute_status(
        source, Lock(generator="t", sources={source.id: entry}), references_root, lock_only=False
    )
    assert not report.strict_ok, "assume-unchanged license tampering passed strict status"
    assert report.state == status.CustodyState.UNVERIFIABLE


# 4. Transactional ``lock --all`` ------------------------------------------


def _write_two_source_catalog(project_root: Path, origin_a: Path) -> Path:
    (project_root / "references").mkdir(parents=True, exist_ok=True)
    catalog_path = project_root / "references" / "sources.toml"
    catalog_path.write_text(
        f"""
schema = 1

[[source]]
id = "remote.a"
kind = "git"
origin = "file://{origin_a}"
track = "main"
license_paths = ["LICENSE"]

[[source]]
id = "remote.z"
kind = "git"
origin = "file:///nonexistent/definitely/missing.git"
track = "main"
license_paths = ["LICENSE"]
"""
    )
    return catalog_path


def test_lock_all_failure_preserves_prior_caches_and_offline_materialization(
    tmp_path: Path,
) -> None:
    """A later source failing must not publish an earlier source's new cache.

    Boundary: the real ``.references`` cache directory contents and a real
    offline materialization of the still-locked commit afterwards.
    """
    origin_a = _init_repo(tmp_path / "origin-a", branch="main")
    (origin_a / "LICENSE").write_text("MIT\n")
    commit_a = _commit_all(origin_a, "init")
    _git("config", "uploadpack.allowFilter", "true", cwd=origin_a)

    project_root = tmp_path / "project"
    project_root.mkdir()
    _write_two_source_catalog(project_root, origin_a)
    lock_path = project_root / "references" / "sources.lock.json"
    references_root = project_root / ".references"

    assert cli.main(["--root", str(project_root), "lock", "remote.a"]) == 0
    lock_bytes_before = lock_path.read_bytes()
    cache_dir = acquire.object_cache_dir(references_root, "remote.a")
    assert gitutil.object_exists(cache_dir, commit_a)

    (origin_a / "LICENSE").write_text("MIT (revised)\n")
    commit_b = _commit_all(origin_a, "advance")
    assert commit_b != commit_a

    assert cli.main(["--root", str(project_root), "lock", "--all"]) == 1

    assert lock_path.read_bytes() == lock_bytes_before, "failed lock --all rewrote the lock"
    assert gitutil.object_exists(cache_dir, commit_a), "failed lock --all destroyed a prior cache"
    assert not gitutil.object_exists(cache_dir, commit_b), (
        "failed lock --all published a cache for an unlocked commit"
    )

    assert cli.main(["--root", str(project_root), "materialize", "remote.a", "--offline"]) == 0
    checkout = materialize_mod.checkout_dir(references_root, "remote.a")
    assert gitutil.head_commit(checkout) == commit_a


# 5. Semantic lock-only validation -----------------------------------------


def _lock_json(**entry_overrides: object) -> str:
    entry: dict[str, object] = {
        "origin": "https://example.com/demo.git",
        "track": "HEAD",
        "resolved_ref": "refs/heads/main",
        "object_format": "sha1",
        "commit": "a" * 40,
        "tree": "b" * 40,
        "catalog_digest": "c" * 64,
        "retrieved_at": "2026-01-01T00:00:00Z",
        "acquisition": "remote",
        "origin_verified": True,
        "licenses": {"LICENSE": {"mode": "100644", "size": 4, "sha256": "d" * 64}},
    }
    entry.update(entry_overrides)
    return json.dumps(
        {"schema": "reference-lock-v1", "generator": "g", "sources": {"local.demo": entry}}
    )


def _licenses_json(path: str, mode: str) -> dict[str, object]:
    return {path: {"mode": mode, "size": 4, "sha256": "d" * 64}}


def test_lock_only_rejects_structurally_impossible_entries() -> None:
    """Unsafe license keys, impossible modes, and impossible custody pairs."""
    with pytest.raises(LockFileError, match="license"):
        parse_lock_text(_lock_json(licenses=_licenses_json("../outside", "100644")))
    with pytest.raises(LockFileError, match="mode"):
        parse_lock_text(_lock_json(licenses=_licenses_json("LICENSE", "120000")))
    with pytest.raises(LockFileError, match="mode"):
        parse_lock_text(_lock_json(licenses=_licenses_json("LICENSE", "160000")))
    with pytest.raises(LockFileError, match="origin_verified"):
        parse_lock_text(_lock_json(acquisition="local-sibling", origin_verified=True))
    with pytest.raises(LockFileError, match="origin_verified"):
        parse_lock_text(_lock_json(acquisition="remote", origin_verified=False))


def test_lock_only_cross_binds_every_semantic_field_to_the_catalog(
    tmp_path: Path, sibling: Path
) -> None:
    """A hand-edited lock entry that still carries the right catalog digest.

    Boundary: the canonical catalog record actually parsed from disk versus
    the lock entry's own declared origin, track, and license set.
    """
    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source()

    entry = acquire.lock_source(
        source,
        project_root=project_root,
        references_root=references_root,
        generator="t",
        offline=True,
        existing_entry=None,
    )

    tampered_origin = dataclasses.replace(entry, origin="https://example.com/other.git")
    report = status.compute_status(
        source,
        Lock(generator="t", sources={source.id: tampered_origin}),
        references_root,
        lock_only=True,
    )
    assert not report.strict_ok, "lock-only accepted an origin the catalog does not declare"
    assert report.state == status.CustodyState.DRIFTED

    tampered_track = dataclasses.replace(entry, track="refs/heads/somewhere-else")
    report = status.compute_status(
        source,
        Lock(generator="t", sources={source.id: tampered_track}),
        references_root,
        lock_only=True,
    )
    assert not report.strict_ok, "lock-only accepted a track the catalog does not declare"

    tampered_licenses = dataclasses.replace(
        entry, licenses={"NOTICE": next(iter(entry.licenses.values()))}
    )
    report = status.compute_status(
        source,
        Lock(generator="t", sources={source.id: tampered_licenses}),
        references_root,
        lock_only=True,
    )
    assert not report.strict_ok, "lock-only accepted a license set the catalog does not declare"


# 6. Fail-closed materialization on catalog drift --------------------------


def test_materialize_rejects_catalog_drift_before_creating_anything(
    tmp_path: Path, sibling: Path
) -> None:
    """Catalog drift must be refused before any ``.references`` mutation.

    Boundary: the real filesystem under ``.references/<id>``, which must not
    exist at all after the refusal.
    """
    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source()

    entry = acquire.lock_source(
        source,
        project_root=project_root,
        references_root=references_root,
        generator="t",
        offline=True,
        existing_entry=None,
    )
    assert not (references_root / source.id).exists()

    drifted_source = make_source(origin_aliases=("https://example.com/demo-mirror.git",))
    assert drifted_source.canonical_digest() != entry.catalog_digest

    with pytest.raises(AcquisitionError, match="catalog"):
        materialize_mod.materialize_source(
            drifted_source,
            entry,
            project_root=project_root,
            references_root=references_root,
            offline=True,
            allow_history_fallback=False,
        )
    assert not (references_root / source.id).exists(), (
        "materialize created state under .references before rejecting catalog drift"
    )


# 7. Coherent symbolic-ref observation -------------------------------------


def test_ambiguous_selector_fails_closed_and_concrete_ref_is_recorded(tmp_path: Path) -> None:
    """A selector naming both a branch and a tag cannot be recorded coherently.

    Boundary: a real repository where ``refs/heads/x`` and ``refs/tags/x``
    name different commits, and Git's own selector resolution picks the tag.
    """
    origin = _init_repo(tmp_path / "origin", branch="main")
    (origin / "LICENSE").write_text("MIT\n")
    commit_a = _commit_all(origin, "one")
    (origin / "extra.txt").write_text("more\n")
    commit_b = _commit_all(origin, "two")
    _git("branch", "x", commit_b, cwd=origin)
    _git("tag", "x", commit_a, cwd=origin)

    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    ambiguous = make_source(
        source_id="remote.ambiguous", origin=f"file://{origin}", local_hint=None, track="x"
    )

    with pytest.raises(AcquisitionError, match="ambiguous"):
        acquire.lock_source(
            ambiguous,
            project_root=project_root,
            references_root=references_root,
            generator="t",
            offline=False,
            existing_entry=None,
        )
    assert not acquire.object_cache_dir(references_root, ambiguous.id).exists(), (
        "an ambiguous selector published a cache"
    )

    tag_only = make_source(
        source_id="remote.tag-only", origin=f"file://{origin}", local_hint=None, track="v1"
    )
    _git("tag", "v1", commit_a, cwd=origin)
    entry = acquire.lock_source(
        tag_only,
        project_root=project_root,
        references_root=references_root,
        generator="t",
        offline=False,
        existing_entry=None,
    )
    assert entry.commit == commit_a
    assert entry.resolved_ref == "refs/tags/v1", (
        "an unresolved selector was recorded as resolved_ref"
    )


# One observation query plus one independent confirmation query.
_CROSS_CHECK_QUERIES = 2


def test_selector_movement_between_queries_fails_closed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A selector that moves between observation queries must fail closed.

    The movement is injected at the ``ls-remote`` seam; every other step is
    the real Git path, and the assertion is that nothing is published.
    """
    origin = _init_repo(tmp_path / "origin", branch="main")
    (origin / "LICENSE").write_text("MIT\n")
    _commit_all(origin, "one")

    project_root = tmp_path / "project"
    project_root.mkdir()
    references_root = project_root / ".references"
    source = make_source(
        source_id="remote.moving", origin=f"file://{origin}", local_hint=None, track="main"
    )

    real_ls_remote = gitutil.ls_remote_refs
    calls: list[str] = []

    def moving_ls_remote(
        location: str, pattern: str, *, allow_transport: bool = False
    ) -> gitutil.RemoteRefs:
        calls.append(pattern)
        observed = real_ls_remote(location, pattern, allow_transport=allow_transport)
        if len(calls) == 1:
            return observed
        return gitutil.RemoteRefs(symrefs=observed.symrefs, refs=(("f" * 40, pattern),))

    monkeypatch.setattr(gitutil, "ls_remote_refs", moving_ls_remote)

    with pytest.raises(AcquisitionError):
        acquire.lock_source(
            source,
            project_root=project_root,
            references_root=references_root,
            generator="t",
            offline=False,
            existing_entry=None,
        )
    assert len(calls) >= _CROSS_CHECK_QUERIES, (
        "the concrete ref was never cross-checked with a second query"
    )
    assert not acquire.object_cache_dir(references_root, source.id).exists()
