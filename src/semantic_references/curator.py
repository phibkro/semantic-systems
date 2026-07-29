"""The single-writer guard for mutating ``.references/`` in one working directory.

Concurrent curators need separate worktrees and caches (design spec 0004,
"Safe acquisition"): this lock only ever protects one process at a time
against another process sharing the same ``.references/`` directory.
"""

from __future__ import annotations

import contextlib
import fcntl
import os
from collections.abc import Generator
from pathlib import Path

from semantic_references.errors import CuratorLockedError

_LOCK_NAME = ".curator.lock"


@contextlib.contextmanager
def curator_lock(references_root: Path) -> Generator[None]:
    references_root.mkdir(parents=True, exist_ok=True)
    lock_path = references_root / _LOCK_NAME
    fd = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o644)
    try:
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
