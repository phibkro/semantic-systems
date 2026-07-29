"""Deterministic, allowlisted public projection of the canonical project graph."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, TypedDict, cast

from semantic_project_model.model import (
    ENTITY_KINDS,
    RELATION_KINDS,
    Entity,
    JsonValue,
    ProjectGraph,
)

SCHEMA_VERSION = "semantic-public-snapshot-v1"
VERSION_SCHEMA = "semantic-public-version-v1"
DEFAULT_REPOSITORY_URL = "https://github.com/phibkro/semantic-systems"
COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")
DIGEST_RE = re.compile(r"^[0-9a-f]{64}$")


class ExportError(ValueError):
    """The canonical input or public artifact violated the frozen export contract."""


DeployedCheckStatus = Literal["not_checked", "passed", "failed"]


@dataclass(frozen=True, slots=True)
class ExportObservation:
    """Exact accepted observation metadata supplied by CI or a local preview."""

    commit: str
    observed_at: str
    freshness_seconds: int
    deployed_check_status: DeployedCheckStatus
    repository_url: str = DEFAULT_REPOSITORY_URL


class PublicEntity(TypedDict):
    id: str
    kind: str
    name: str
    summary: str
    status: str | None
    tags: list[str]
    source_url: str
    evidence_category: str | None
    assumptions: list[str]


class PublicRelation(TypedDict):
    source_id: str
    target_id: str
    kind: str
    summary: str
    source_url: str


class SnapshotMetadata(TypedDict):
    commit: str
    digest: str
    generated_at: str
    observed_at: str
    freshness_seconds: int
    deployed_check_status: DeployedCheckStatus
    repository_url: str


class PublicSnapshot(TypedDict):
    schema_version: str
    metadata: SnapshotMetadata
    counts_by_kind: dict[str, int]
    ready_work_ids: list[str]
    active_work_ids: list[str]
    blocked_work_ids: list[str]
    completed_work_ids: list[str]
    unsupported_claim_ids: list[str]
    entities: list[PublicEntity]
    relations: list[PublicRelation]


class PublicVersion(TypedDict):
    schema_version: str
    commit: str
    digest: str
    observed_at: str
    snapshot: str


@dataclass(frozen=True, slots=True)
class ExportedArtifact:
    digest: str
    snapshot_path: Path
    version_path: Path
    snapshot_bytes: bytes
    version_bytes: bytes


def _canonical_bytes(value: object) -> bytes:
    return (
        json.dumps(value, ensure_ascii=True, separators=(",", ":"), sort_keys=True) + "\n"
    ).encode()


def _source_url(entity: Entity, project: ProjectGraph, observation: ExportObservation) -> str:
    model_root = (project.root / "model").resolve()
    source = entity.source.resolve()
    try:
        relative = source.relative_to(model_root)
    except ValueError as error:
        raise ExportError(f"canonical source is outside model/: {entity.id}") from error
    return (
        f"{observation.repository_url.rstrip('/')}/blob/{observation.commit}/model/"
        f"{relative.as_posix()}"
    )


def _relation_source_url(
    source: Path, project: ProjectGraph, observation: ExportObservation
) -> str:
    model_root = (project.root / "model").resolve()
    try:
        relative = source.resolve().relative_to(model_root)
    except ValueError as error:
        raise ExportError("canonical relation source is outside model/") from error
    return (
        f"{observation.repository_url.rstrip('/')}/blob/{observation.commit}/model/"
        f"{relative.as_posix()}"
    )


def _strings_attribute(entity: Entity, key: str) -> list[str]:
    raw = entity.attributes.get(key)
    if not isinstance(raw, list) or not all(isinstance(item, str) for item in raw):
        return []
    return sorted(cast(list[str], raw))


def _evidence_category(entity: Entity) -> str | None:
    if entity.kind != "evidence":
        return None
    value = entity.attributes.get("evidence_type")
    return value if isinstance(value, str) else None


def _validate_input(project: ProjectGraph, observation: ExportObservation) -> None:
    if not COMMIT_RE.fullmatch(observation.commit):
        raise ExportError("commit must be an exact lowercase 40-character Git object ID")
    if observation.freshness_seconds <= 0:
        raise ExportError("freshness_seconds must be positive")
    if not observation.observed_at.endswith("Z"):
        raise ExportError("observed_at must be an explicit UTC timestamp")

    for entity_id, entity in project.entities.items():
        if entity.id != entity_id:
            raise ExportError(f"entity mapping identity mismatch: {entity_id}")
        if entity.kind not in ENTITY_KINDS:
            raise ExportError(f"unsupported entity kind: {entity.kind}")

    for relation in project.relations:
        if relation.kind not in RELATION_KINDS:
            raise ExportError(f"unsupported relation kind: {relation.kind}")
        if relation.source_id not in project.entities:
            raise ExportError(f"missing source identity: {relation.source_id}")
        if relation.target_id not in project.entities:
            raise ExportError(f"missing target identity: {relation.target_id}")


def _snapshot_without_digest(
    project: ProjectGraph, observation: ExportObservation
) -> PublicSnapshot:
    entities: list[PublicEntity] = []
    counts: dict[str, int] = {}
    for entity in sorted(project.entities.values(), key=lambda item: item.id):
        counts[entity.kind] = counts.get(entity.kind, 0) + 1
        entities.append(
            {
                "id": entity.id,
                "kind": entity.kind,
                "name": entity.name,
                "summary": entity.summary,
                "status": entity.status,
                "tags": sorted(entity.tags),
                "source_url": _source_url(entity, project, observation),
                "evidence_category": _evidence_category(entity),
                "assumptions": _strings_attribute(entity, "assumptions"),
            }
        )

    relations: list[PublicRelation] = [
        {
            "source_id": relation.source_id,
            "target_id": relation.target_id,
            "kind": relation.kind,
            "summary": relation.summary,
            "source_url": _relation_source_url(relation.source, project, observation),
        }
        for relation in sorted(
            project.relations,
            key=lambda item: (
                item.source_id,
                item.target_id,
                item.kind,
                item.summary,
                item.source.as_posix(),
            ),
        )
    ]
    work = [entity for entity in entities if entity["kind"] == "work_item"]
    unsupported_claim_ids = sorted(
        entity["id"]
        for entity in entities
        if entity["kind"] == "claim"
        and not any(
            relation["target_id"] == entity["id"] and relation["kind"] in {"supports", "discharges"}
            for relation in relations
        )
    )
    return {
        "schema_version": SCHEMA_VERSION,
        "metadata": {
            "commit": observation.commit,
            "digest": "",
            "generated_at": observation.observed_at,
            "observed_at": observation.observed_at,
            "freshness_seconds": observation.freshness_seconds,
            "deployed_check_status": observation.deployed_check_status,
            "repository_url": observation.repository_url,
        },
        "counts_by_kind": dict(sorted(counts.items())),
        "ready_work_ids": sorted(item["id"] for item in work if item["status"] == "ready"),
        "active_work_ids": sorted(
            item["id"] for item in work if item["status"] in {"active", "in_progress"}
        ),
        "blocked_work_ids": sorted(item["id"] for item in work if item["status"] == "blocked"),
        "completed_work_ids": sorted(
            item["id"] for item in work if item["status"] in {"complete", "completed"}
        ),
        "unsupported_claim_ids": unsupported_claim_ids,
        "entities": entities,
        "relations": relations,
    }


def _digest_snapshot(snapshot: PublicSnapshot) -> str:
    digest_input = cast(PublicSnapshot, json.loads(_canonical_bytes(snapshot)))
    digest_input["metadata"]["digest"] = ""
    return hashlib.sha256(_canonical_bytes(digest_input)).hexdigest()


def build_public_snapshot(project: ProjectGraph, observation: ExportObservation) -> PublicSnapshot:
    """Build the allowlisted read model without writing any artifact."""

    _validate_input(project, observation)
    snapshot = _snapshot_without_digest(project, observation)
    snapshot["metadata"]["digest"] = _digest_snapshot(snapshot)
    return snapshot


def export_public_snapshot(
    project: ProjectGraph, observation: ExportObservation, output: Path
) -> ExportedArtifact:
    """Atomically publish one complete content-addressed snapshot and version pointer."""

    snapshot = build_public_snapshot(project, observation)
    digest = snapshot["metadata"]["digest"]
    snapshot_name = f"snapshot.{digest}.json"
    version: PublicVersion = {
        "schema_version": VERSION_SCHEMA,
        "commit": observation.commit,
        "digest": digest,
        "observed_at": observation.observed_at,
        "snapshot": snapshot_name,
    }
    snapshot_bytes = _canonical_bytes(snapshot)
    version_bytes = _canonical_bytes(version)
    output.mkdir(parents=True, exist_ok=True)
    snapshot_path = output / snapshot_name
    version_path = output / "version.json"
    snapshot_tmp = output / f".{snapshot_name}.tmp"
    version_tmp = output / ".version.json.tmp"
    snapshot_tmp.write_bytes(snapshot_bytes)
    snapshot_tmp.replace(snapshot_path)
    version_tmp.write_bytes(version_bytes)
    version_tmp.replace(version_path)
    return ExportedArtifact(
        digest=digest,
        snapshot_path=snapshot_path,
        version_path=version_path,
        snapshot_bytes=snapshot_bytes,
        version_bytes=version_bytes,
    )


def verify_public_artifact(  # noqa: PLR0912
    snapshot_path: Path, version_path: Path
) -> PublicSnapshot:
    """Reject incomplete, mismatched, or non-canonical public artifacts."""

    try:
        snapshot_value: JsonValue = json.loads(snapshot_path.read_text(encoding="utf-8"))
        version_value: JsonValue = json.loads(version_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ExportError(f"unreadable public artifact: {error}") from error
    if not isinstance(snapshot_value, dict) or not isinstance(version_value, dict):
        raise ExportError("public snapshot and version must be JSON objects")
    if snapshot_value.get("schema_version") != SCHEMA_VERSION:
        raise ExportError("snapshot schema version mismatch")
    if version_value.get("schema_version") != VERSION_SCHEMA:
        raise ExportError("version schema mismatch")
    metadata_value = snapshot_value.get("metadata")
    if not isinstance(metadata_value, dict):
        raise ExportError("snapshot metadata is missing")
    digest = metadata_value.get("digest")
    if not isinstance(digest, str) or not DIGEST_RE.fullmatch(digest):
        raise ExportError("snapshot digest is malformed")
    snapshot = cast(PublicSnapshot, snapshot_value)
    version = cast(PublicVersion, version_value)
    metadata = cast(SnapshotMetadata, metadata_value)
    if _digest_snapshot(snapshot) != digest:
        raise ExportError("snapshot content digest mismatch")
    if version.get("digest") != digest:
        raise ExportError("version digest mismatch")
    if version.get("commit") != metadata.get("commit"):
        raise ExportError("version commit mismatch")
    if version.get("snapshot") != snapshot_path.name:
        raise ExportError("version snapshot filename mismatch")
    if snapshot_path.name != f"snapshot.{digest}.json":
        raise ExportError("snapshot filename digest mismatch")
    if snapshot_path.read_bytes() != _canonical_bytes(snapshot):
        raise ExportError("snapshot is not canonically encoded")
    if version_path.read_bytes() != _canonical_bytes(version):
        raise ExportError("version is not canonically encoded")
    return snapshot
