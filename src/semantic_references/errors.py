"""Exceptions raised across the reference-custody package."""

from __future__ import annotations


class ReferenceCustodyError(Exception):
    """Base class for all reference-custody failures."""


class CatalogError(ReferenceCustodyError):
    """The catalog (``references/sources.toml``) is structurally invalid."""


class LockFileError(ReferenceCustodyError):
    """The lock file (``references/sources.lock.json``) is structurally invalid."""


class UnknownSourceError(ReferenceCustodyError):
    """The requested source ID is not present in the catalog."""


class NotLockableError(ReferenceCustodyError):
    """The source has no ``track`` or no ``license_paths`` declared."""


class AcquisitionError(ReferenceCustodyError):
    """A safe acquisition (lock or materialize) could not be completed."""


class CuratorLockedError(ReferenceCustodyError):
    """Another curator already holds the ``.references`` mutation lock."""
