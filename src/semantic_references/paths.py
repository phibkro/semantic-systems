"""No-follow checks for the tool-owned custody directory hierarchy.

Source IDs are already path-safe at the catalog/lock boundary.  These helpers
enforce the other half of path confinement: every managed directory component
must be an actual directory, never a symlink or another filesystem object.

The checks close stable symlink substitution.  They are not a claim of
race-free operation against a concurrently malicious local process; the
curator lock itself uses descriptor-relative ``O_NOFOLLOW`` for the one path it
truncates.
"""

from __future__ import annotations

import contextlib
import stat
from pathlib import Path

from semantic_references.catalog import validate_source_id
from semantic_references.errors import AcquisitionError, CatalogError


def _directory(path: Path, label: str, *, create: bool) -> Path:
    if path.is_symlink():
        raise AcquisitionError(f"{label} {path} is an unsafe symlink")
    try:
        metadata = path.stat(follow_symlinks=False)
    except FileNotFoundError:
        if not create:
            raise
        with contextlib.suppress(FileExistsError):
            path.mkdir()
        if path.is_symlink():
            raise AcquisitionError(f"{label} {path} became an unsafe symlink") from None
        try:
            metadata = path.stat(follow_symlinks=False)
        except OSError as exc:
            raise AcquisitionError(f"cannot inspect {label} {path}: {exc}") from exc
    except OSError as exc:
        raise AcquisitionError(f"cannot inspect {label} {path}: {exc}") from exc
    if not stat.S_ISDIR(metadata.st_mode):
        raise AcquisitionError(f"{label} {path} is not a directory")
    return path


def ensure_references_root(references_root: Path, *, create: bool) -> Path:
    """Return a verified real ``.references`` directory."""
    if create:
        parent = references_root.parent
        if parent.is_symlink():
            raise AcquisitionError(f"parent of custody root {references_root} is a symlink")
        try:
            parent_metadata = parent.stat(follow_symlinks=False)
        except OSError as exc:
            raise AcquisitionError(
                f"cannot inspect parent of custody root {references_root}: {exc}"
            ) from exc
        if not stat.S_ISDIR(parent_metadata.st_mode):
            raise AcquisitionError(f"parent of custody root {references_root} is not a directory")
    return _directory(references_root, "custody root", create=create)


def ensure_source_root(references_root: Path, source_id: str, *, create: bool) -> Path:
    """Return a verified real source directory under the custody root."""
    try:
        validate_source_id(source_id)
    except CatalogError as exc:
        raise AcquisitionError(f"unsafe custody source id {source_id!r}: {exc}") from exc
    root = ensure_references_root(references_root, create=create)
    source_root = root / source_id
    return _directory(source_root, f"custody source root for {source_id!r}", create=create)


def inspect_managed_directory(
    references_root: Path, source_id: str, child_name: str
) -> Path | None:
    """Inspect an optional managed child without following any managed symlink.

    ``None`` means the root, source directory, or child does not exist.  A
    present but unsafe component raises instead of being treated as absence.
    """
    try:
        source_root = ensure_source_root(references_root, source_id, create=False)
    except FileNotFoundError:
        return None
    child = source_root / child_name
    if child.is_symlink():
        raise AcquisitionError(
            f"managed custody path {child} is an unsafe symlink outside its source root"
        )
    try:
        metadata = child.stat(follow_symlinks=False)
    except FileNotFoundError:
        return None
    except OSError as exc:
        raise AcquisitionError(f"cannot inspect managed custody path {child}: {exc}") from exc
    if not stat.S_ISDIR(metadata.st_mode):
        raise AcquisitionError(f"managed custody path {child} is not a directory")
    return child


def require_child_absent_or_real(
    references_root: Path, source_id: str, child_name: str, *, create_source: bool
) -> Path:
    """Return a child path after validating every existing managed component."""
    source_root = ensure_source_root(references_root, source_id, create=create_source)
    child = source_root / child_name
    if child.is_symlink():
        raise AcquisitionError(f"managed custody path {child} is an unsafe symlink")
    try:
        metadata = child.stat(follow_symlinks=False)
    except FileNotFoundError:
        return child
    except OSError as exc:
        raise AcquisitionError(f"cannot inspect managed custody path {child}: {exc}") from exc
    if not stat.S_ISDIR(metadata.st_mode):
        raise AcquisitionError(f"managed custody path {child} is not a directory")
    return child
