from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path

import pytest

from semantic_project_model.loader import load_project
from semantic_project_model.model import Entity, ProjectGraph, Relation
from semantic_project_model.public_export import (
    ExportError,
    ExportObservation,
    build_public_snapshot,
    export_public_snapshot,
    verify_public_artifact,
)

ROOT = Path(__file__).resolve().parents[1]
COMMIT = "0123456789abcdef0123456789abcdef01234567"
OBSERVED_AT = "2026-07-29T12:00:00Z"


def observation() -> ExportObservation:
    return ExportObservation(
        commit=COMMIT,
        observed_at=OBSERVED_AT,
        freshness_seconds=86_400,
        deployed_check_status="not_checked",
    )


def fixture_graph() -> ProjectGraph:
    source = ROOT / "model" / "fixture.json"
    entities = {
        "component.alpha": Entity(
            id="component.alpha",
            kind="component",
            name="Alpha",
            summary="A component",
            status="active",
            tags=("system",),
            attributes={
                "private": "ghp_SECRET_SHAPED_SENTINEL",
                "path": "/home/operator/private/control-room",
                "workflow_context": {"token": "CI_CONTEXT_SENTINEL"},
                "transcript": "agent said PRIVATE_TRANSCRIPT_SENTINEL",
            },
            source=source,
        ),
        "claim.beta": Entity(
            id="claim.beta",
            kind="claim",
            name="Beta",
            summary="An unsupported claim",
            status="proposed",
            tags=("evidence",),
            attributes={},
            source=source,
        ),
    }
    return ProjectGraph(
        entities=entities,
        relations=(
            Relation(
                source_id="component.alpha",
                target_id="claim.beta",
                kind="informs",
                summary="Alpha informs beta",
                attributes={"html": "<script>INJECTION_SENTINEL</script>"},
                source=source,
            ),
        ),
        root=ROOT,
    )


def test_export_is_byte_deterministic_and_content_addressed(tmp_path: Path) -> None:
    first = export_public_snapshot(fixture_graph(), observation(), tmp_path / "first")
    second = export_public_snapshot(fixture_graph(), observation(), tmp_path / "second")

    assert first.snapshot_bytes == second.snapshot_bytes
    assert first.version_bytes == second.version_bytes
    assert first.snapshot_path.name == f"snapshot.{first.digest}.json"
    assert first.digest in first.version_bytes.decode()
    verify_public_artifact(first.snapshot_path, first.version_path)


@pytest.mark.parametrize(
    ("graph", "message"),
    [
        (
            lambda: replace(
                fixture_graph(),
                entities={
                    **fixture_graph().entities,
                    "unknown": replace(
                        fixture_graph().entities["component.alpha"],
                        id="unknown",
                        kind="not_a_kind",
                    ),
                },
            ),
            "unsupported entity kind",
        ),
        (
            lambda: replace(
                fixture_graph(),
                relations=(replace(fixture_graph().relations[0], target_id="claim.missing"),),
            ),
            "missing target identity",
        ),
        (
            lambda: replace(
                fixture_graph(),
                relations=(replace(fixture_graph().relations[0], kind="not_a_relation"),),
            ),
            "unsupported relation kind",
        ),
    ],
)
def test_export_rejects_unknown_or_unbound_graph(
    graph: object,
    message: str,
) -> None:
    assert callable(graph)
    with pytest.raises(ExportError, match=message):
        build_public_snapshot(graph(), observation())  # type: ignore[operator]


def test_export_is_an_allowlist_not_an_attribute_dump() -> None:
    encoded = json.dumps(build_public_snapshot(fixture_graph(), observation()), sort_keys=True)

    for sentinel in (
        "ghp_SECRET_SHAPED_SENTINEL",
        "/home/operator/private/control-room",
        "CI_CONTEXT_SENTINEL",
        "PRIVATE_TRANSCRIPT_SENTINEL",
        "INJECTION_SENTINEL",
    ):
        assert sentinel not in encoded

    entity = build_public_snapshot(fixture_graph(), observation())["entities"][0]
    assert set(entity) == {
        "id",
        "kind",
        "name",
        "summary",
        "status",
        "tags",
        "source_url",
        "evidence_category",
        "assumptions",
    }


def test_digest_or_version_mismatch_is_rejected(tmp_path: Path) -> None:
    exported = export_public_snapshot(fixture_graph(), observation(), tmp_path)
    version = json.loads(exported.version_path.read_text())
    version["digest"] = "0" * 64
    exported.version_path.write_text(json.dumps(version))

    with pytest.raises(ExportError, match="digest mismatch"):
        verify_public_artifact(exported.snapshot_path, exported.version_path)


def test_artifact_verifier_rejects_fields_outside_the_public_schema(tmp_path: Path) -> None:
    exported = export_public_snapshot(fixture_graph(), observation(), tmp_path)
    snapshot = json.loads(exported.snapshot_path.read_text())
    snapshot["entities"][0]["private_note"] = "must never be admitted"
    exported.snapshot_path.write_text(json.dumps(snapshot))

    with pytest.raises(ExportError, match="entity fields"):
        verify_public_artifact(exported.snapshot_path, exported.version_path)


def test_real_canonical_model_exports_with_exact_provenance() -> None:
    snapshot = build_public_snapshot(load_project(ROOT), observation())

    assert snapshot["schema_version"] == "semantic-public-snapshot-v1"
    assert snapshot["metadata"]["commit"] == COMMIT
    assert snapshot["metadata"]["observed_at"] == OBSERVED_AT
    assert snapshot["unsupported_claim_ids"]
    assert all(f"/blob/{COMMIT}/model/" in entity["source_url"] for entity in snapshot["entities"])
