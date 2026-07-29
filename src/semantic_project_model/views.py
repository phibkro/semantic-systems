"""Generate canonical Markdown and Mermaid views."""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path

from semantic_project_model.model import Entity, ProjectGraph, Relation
from semantic_project_model.schedule import assess_work, critical_path


def _id(value: str) -> str:
    return "".join(char if char.isalnum() else "_" for char in value)


def _node(entity: Entity) -> str:
    return f'{_id(entity.id)}["{entity.name}"]'


def _edge(relation: Relation) -> str:
    label = relation.kind.replace("_", " ")
    return f"{_id(relation.source_id)} -->|{label}| {_id(relation.target_id)}"


def _doc(title: str, body: str) -> str:
    return (
        f"# {title}\n\n<!-- Generated. Edit model sources, not this file. -->\n\n{body.rstrip()}\n"
    )


def _mermaid(project: ProjectGraph, relations: tuple[Relation, ...], direction: str) -> str:
    ids = {
        entity_id
        for relation in relations
        for entity_id in (relation.source_id, relation.target_id)
    }
    lines = ["```mermaid", f"flowchart {direction}"]
    lines.extend(f"    {_node(project.entities[entity_id])}" for entity_id in sorted(ids))
    lines.extend(f"    {_edge(relation)}" for relation in relations)
    lines.append("```")
    return "\n".join(lines)


def system_map(project: ProjectGraph) -> str:
    relations = tuple(relation for relation in project.relations if relation.kind == "contains")
    return _doc(
        "System map",
        "Recursive component and package containment.\n\n" + _mermaid(project, relations, "TD"),
    )


def theory_realization(project: ProjectGraph) -> str:
    kinds = {"theory", "realization", "handler", "domain_machine", "effect", "invariant"}
    relations = tuple(
        relation
        for relation in project.relations
        if relation.kind in {"realizes", "requires", "extends", "refines", "preserves"}
        and (
            project.entities[relation.source_id].kind in kinds
            or project.entities[relation.target_id].kind in kinds
        )
    )
    return _doc(
        "Theory-realization map",
        "Semantic contracts and executable interpretations.\n\n"
        + _mermaid(project, relations, "LR"),
    )


def concern_matrix(project: ProjectGraph) -> str:
    components = [
        entity
        for entity in project.entities.values()
        if entity.kind in {"component", "runtime", "handler"}
    ]
    assignments: dict[str, set[str]] = {}
    concerns: set[str] = set()
    for entity in components:
        raw = entity.attributes.get("responsibilities")
        values: set[str] = set()
        if isinstance(raw, list):
            values.update(item for item in raw if isinstance(item, str))
        assignments[entity.id] = values
        concerns.update(values)

    ordered = sorted(concerns)
    rows = [
        "| Component | " + " | ".join(ordered) + " |",
        "|---|" + "|".join("---:" for _ in ordered) + "|",
    ]
    for entity in sorted(components, key=lambda item: item.name):
        cells = ["●" if concern in assignments[entity.id] else "" for concern in ordered]
        rows.append(f"| {entity.name} | " + " | ".join(cells) + " |")
    return _doc(
        "Concern matrix",
        "Dense rows suggest overloaded components; dense columns reveal cross-cutting concerns.\n\n"
        + "\n".join(rows),
    )


def evidence_map(project: ProjectGraph) -> str:
    relations = tuple(
        relation
        for relation in project.relations
        if relation.kind in {"supports", "discharges", "assumes", "validates", "covers"}
    )
    unsupported = [
        claim
        for claim in project.by_kind("claim")
        if not project.incoming(claim.id, {"supports", "discharges"})
    ]
    suffix = ""
    if unsupported:
        suffix = "\n\n## Unsupported claims\n\n" + "\n".join(
            f"- `{claim.id}` — {claim.name}" for claim in unsupported
        )
    return _doc(
        "Evidence and trust map",
        _mermaid(project, relations, "TD") + suffix,
    )


def work_dependencies(project: ProjectGraph) -> str:
    allowed_ids = {
        entity.id
        for entity in project.entities.values()
        if entity.kind in {"work_item", "decision"}
    }
    relations = tuple(
        relation
        for relation in project.relations
        if relation.source_id in allowed_ids
        and relation.target_id in allowed_ids
        and relation.kind in {"blocks", "requires", "informs"}
    )
    path = critical_path(project)
    names = " → ".join(project.entities[item].name for item in path)
    return _doc(
        "Work dependencies",
        _mermaid(project, relations, "LR")
        + "\n\n## Weighted critical path\n\n"
        + (names or "No acyclic path available."),
    )


def delegation_frontier(project: ProjectGraph) -> str:
    assessments = assess_work(project)
    rows = [
        "| Work item | Phase | Status | Ready | Score | Recommendation | Blockers |",
        "|---|---|---|---:|---:|---|---|",
    ]
    for assessment in assessments:
        entity = assessment.entity
        blockers = ", ".join(
            project.entities[item].name if item in project.entities else item
            for item in assessment.blockers
        )
        rows.append(
            f"| {entity.name} | {entity.attributes.get('phase', '')} | "
            f"{entity.status or ''} | {'yes' if assessment.ready else 'no'} | "
            f"{assessment.agentability} | {assessment.recommendation} | {blockers} |"
        )
    ready = sum(assessment.ready for assessment in assessments)
    return _doc(
        "Delegation frontier",
        f"Ready parallel work items: **{ready}**.\n\n" + "\n".join(rows),
    )


def runtime_view(project: ProjectGraph) -> str:
    relations = tuple(
        relation
        for relation in project.relations
        if relation.kind in {"hosts", "handles", "reads", "writes", "publishes", "sends"}
    )
    return _doc(
        "Runtime interaction view",
        "Actor ownership, STM access, commit publication, and message delivery.\n\n"
        + _mermaid(project, relations, "LR"),
    )


def index(project: ProjectGraph) -> str:
    counts: dict[str, int] = defaultdict(int)
    for entity in project.entities.values():
        counts[entity.kind] += 1
    rows = ["| Kind | Count |", "|---|---:|"]
    rows.extend(f"| {kind} | {count} |" for kind, count in sorted(counts.items()))
    return _doc(
        "Generated project views",
        "\n".join(rows)
        + "\n\n- [System map](01-system-map.md)"
        + "\n- [Theory-realization map](02-theory-realization.md)"
        + "\n- [Concern matrix](03-concern-matrix.md)"
        + "\n- [Evidence map](04-evidence-map.md)"
        + "\n- [Work dependencies](05-work-dependencies.md)"
        + "\n- [Delegation frontier](06-delegation-frontier.md)"
        + "\n- [Runtime view](07-runtime-view.md)",
    )


def generate_views(project: ProjectGraph) -> dict[str, str]:
    return {
        "README.md": index(project),
        "01-system-map.md": system_map(project),
        "02-theory-realization.md": theory_realization(project),
        "03-concern-matrix.md": concern_matrix(project),
        "04-evidence-map.md": evidence_map(project),
        "05-work-dependencies.md": work_dependencies(project),
        "06-delegation-frontier.md": delegation_frontier(project),
        "07-runtime-view.md": runtime_view(project),
    }


def write_views(output: Path, views: dict[str, str], *, check: bool) -> tuple[Path, ...]:
    output.mkdir(parents=True, exist_ok=True)
    changed: list[Path] = []
    for name, content in sorted(views.items()):
        destination = output / name
        current = destination.read_text(encoding="utf-8") if destination.exists() else None
        if current != content:
            changed.append(destination)
            if not check:
                destination.write_text(content, encoding="utf-8")
    return tuple(changed)
