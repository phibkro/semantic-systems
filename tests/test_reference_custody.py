"""Adversarial local-Git corpus for design spec 0004 (reference-source custody).

Every test builds its own temporary Git repositories; none needs network.
These are ``example_test`` evidence per the spec's evidence-limits section,
not a claim of remote-transport behavior.
"""

from __future__ import annotations

import hashlib
import json
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
from semantic_references.lockfile import Lock, load_lock, parse_lock_text, write_lock

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
