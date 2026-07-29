"""The single-writer guard for mutating ``.references/`` in one working directory.

Concurrent curators need separate worktrees and caches (design spec 0004,
"Safe acquisition"): this lock only ever protects one process at a time
against another process sharing the same ``.references/`` directory.
"""

from __future__ import annotations

import contextlib
import fcntl
import os
import stat
from collections.abc import Generator
from pathlib import Path

from semantic_references.errors import AcquisitionError, CuratorLockedError
from semantic_references.paths import ensure_references_root

_LOCK_NAME = ".curator.lock"


@contextlib.contextmanager
def curator_lock(references_root: Path) -> Generator[None]:
    try:
        ensure_references_root(references_root, create=True)
    except AcquisitionError as exc:
        raise CuratorLockedError(f"unsafe curator lock root: {exc}") from exc
    lock_path = references_root / _LOCK_NAME
    root_flags = os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC | os.O_NOFOLLOW
    lock_flags = os.O_CREAT | os.O_RDWR | os.O_CLOEXEC | os.O_NOFOLLOW
    try:
        root_fd = os.open(references_root, root_flags)
        try:
            fd = os.open(_LOCK_NAME, lock_flags, 0o600, dir_fd=root_fd)
        except BaseException:
            os.close(root_fd)
            raise
    except OSError as exc:
        raise CuratorLockedError(f"unsafe curator lock at {lock_path}: {exc}") from exc
    try:
        metadata = os.fstat(fd)
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1:
            raise CuratorLockedError(
                f"unsafe curator lock at {lock_path}: expected one regular filesystem link"
            )
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            raise CuratorLockedError(
                f"another curator holds the mutation lock at {lock_path}"
            ) from exc
        os.ftruncate(fd, 0)
        os.write(fd, str(os.getpid()).encode("ascii"))
        yield
    finally:
        with contextlib.suppress(OSError):
            fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)
        os.close(root_fd)
