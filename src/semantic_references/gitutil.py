"""Minimal Git plumbing wrapper.

Every subprocess call here is explicit about what it touches: read-only
inspection commands never write, and the handful of mutating commands
(fetch, checkout, clone) are the only places the package talks to a
transport or a working tree. Offline code paths in :mod:`semantic_references`
never call any of the network-shaped helpers in this module (fetch/clone from
a remote URL) — see ``acquire.py`` and ``materialize.py``.
"""

from __future__ import annotations

import hashlib
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path

from semantic_references.errors import AcquisitionError

# Never prompt for credentials, never invoke a pager, never run hooks we didn't
# ask for.
_SAFE_ENV = {
    "GIT_TERMINAL_PROMPT": "0",
    "GIT_ASKPASS": "true",
    "GIT_PAGER": "cat",
    "GIT_CONFIG_NOSYSTEM": "1",
}

_LS_TREE_FIELD_COUNT = 4


def _env(base: dict[str, str] | None) -> dict[str, str]:
    merged = dict(os.environ)
    merged.update(_SAFE_ENV)
    if base:
        merged.update(base)
    return merged


def run_git(
    args: list[str],
    *,
    cwd: Path | None = None,
    check: bool = True,
    input_text: str | None = None,
) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        env=_env(None),
        input=input_text,
        check=False,
    )
    if check and result.returncode != 0:
        raise AcquisitionError(
            f"git {' '.join(args)} failed (exit {result.returncode}): {result.stderr.strip()}"
        )
    return result


@dataclass(frozen=True, slots=True)
class TreeEntry:
    mode: str
    object_type: str
    oid: str
    size: int


def object_format(repo_dir: Path) -> str:
    result = run_git(["-C", str(repo_dir), "rev-parse", "--show-object-format"])
    value = result.stdout.strip()
    return value if value else "sha1"


def resolve_commit(repo_dir: Path, rev: str) -> str:
    """Resolve ``rev`` (a ref name, ``HEAD``, or an object id) to a full commit id."""
    if rev.startswith("-"):
        raise AcquisitionError(f"refusing to resolve a ref that looks like an option: {rev!r}")
    result = run_git(["-C", str(repo_dir), "rev-parse", "--verify", f"{rev}^{{commit}}"])
    return result.stdout.strip()


def tree_of_commit(repo_dir: Path, commit: str) -> str:
    result = run_git(["-C", str(repo_dir), "rev-parse", "--verify", f"{commit}^{{tree}}"])
    return result.stdout.strip()


def ls_tree_entry(repo_dir: Path, commit: str, path: str) -> TreeEntry | None:
    result = run_git(["-C", str(repo_dir), "ls-tree", "-l", commit, "--", path], check=False)
    if result.returncode != 0:
        raise AcquisitionError(f"git ls-tree failed for {path!r}: {result.stderr.strip()}")
    line = result.stdout.strip()
    if not line:
        return None
    # "<mode> <type> <oid> <size>\t<path>"
    meta, _, entry_path = line.partition("\t")
    if entry_path != path:
        return None
    fields = meta.split()
    if len(fields) != _LS_TREE_FIELD_COUNT:
        raise AcquisitionError(f"unexpected ls-tree output for {path!r}: {line!r}")
    mode, object_type, oid, size = fields
    # Non-blob entries (e.g. submodule gitlinks) report size as "-".
    parsed_size = int(size) if size != "-" else -1
    return TreeEntry(mode=mode, object_type=object_type, oid=oid, size=parsed_size)


def blob_sha256(repo_dir: Path, oid: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo_dir), "cat-file", "blob", oid],
        capture_output=True,
        env=_env(None),
        check=False,
    )
    if result.returncode != 0:
        raise AcquisitionError(f"git cat-file blob {oid} failed: {result.stderr.decode().strip()}")
    return hashlib.sha256(result.stdout).hexdigest()


def remote_url(repo_dir: Path, name: str = "origin") -> str | None:
    result = run_git(["-C", str(repo_dir), "remote", "get-url", name], check=False)
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def object_exists(repo_dir: Path, oid: str) -> bool:
    result = run_git(["-C", str(repo_dir), "cat-file", "-e", f"{oid}^{{commit}}"], check=False)
    return result.returncode == 0


def is_detached_head(worktree: Path) -> bool:
    result = run_git(["-C", str(worktree), "symbolic-ref", "-q", "HEAD"], check=False)
    return result.returncode != 0


def head_commit(worktree: Path) -> str:
    result = run_git(["-C", str(worktree), "rev-parse", "--verify", "HEAD"])
    return result.stdout.strip()


def is_clean_worktree(worktree: Path) -> bool:
    result = run_git(["-C", str(worktree), "status", "--porcelain=v1", "--ignored=no"])
    return result.stdout.strip() == ""


def has_submodules_or_lfs_pointers(worktree: Path, paths: list[str]) -> list[str]:
    """Return declared paths whose blob looks like a submodule gitlink or an LFS pointer."""
    suspicious: list[str] = []
    for path in paths:
        full = worktree / path
        try:
            if full.is_symlink():
                suspicious.append(path)
                continue
            head = full.read_bytes()[:200]
        except OSError:
            suspicious.append(path)
            continue
        if head.startswith(b"version https://git-lfs.github.com/spec"):
            suspicious.append(path)
    return suspicious


def init_repo(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    run_git(["init", "-q", "-b", "custody", str(path)])


def fetch_shallow_blobless(repo_dir: Path, url: str, ref: str) -> str:
    """Fetch ``ref`` from ``url`` shallowly, without blobs or tags. Returns FETCH_HEAD."""
    run_git(
        ["-C", str(repo_dir), "fetch", "--depth=1", "--filter=blob:none", "--no-tags", url, ref],
    )
    result = run_git(["-C", str(repo_dir), "rev-parse", "--verify", "FETCH_HEAD"])
    return result.stdout.strip()


def fetch_blobless_history(repo_dir: Path, url: str, ref: str) -> str:
    """Broader (unshallowed at the blob level, but still blob-filtered) history fetch."""
    run_git(
        ["-C", str(repo_dir), "fetch", "--filter=blob:none", "--no-tags", url, ref],
    )
    result = run_git(["-C", str(repo_dir), "rev-parse", "--verify", "FETCH_HEAD"])
    return result.stdout.strip()


def checkout_detached(repo_dir: Path, commit: str) -> None:
    run_git(["-C", str(repo_dir), "checkout", "--detach", "--quiet", commit])


def clone_local(source_git_dir: Path, dest: Path) -> None:
    """Clone from a local Git directory only (no network transport)."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    run_git(["clone", "--quiet", "--no-checkout", "--no-hardlinks", str(source_git_dir), str(dest)])
