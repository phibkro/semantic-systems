from pathlib import Path

from semantic_project_model.loader import load_project
from semantic_project_model.schedule import assess_work, critical_path
from semantic_project_model.validate import validate_project
from semantic_project_model.views import generate_views

ROOT = Path(__file__).resolve().parents[1]
MINIMUM_ENTITY_COUNT = 40
MINIMUM_RELATION_COUNT = 50
GENERATED_VIEW_COUNT = 8


def test_model_loads() -> None:
    project = load_project(ROOT)
    assert len(project.entities) >= MINIMUM_ENTITY_COUNT
    assert len(project.relations) >= MINIMUM_RELATION_COUNT
    assert project.entities["domain.inventory.machine"].kind == "domain_machine"


def test_model_has_no_errors() -> None:
    issues = validate_project(load_project(ROOT))
    assert [issue for issue in issues if issue.severity == "error"] == []


def test_views() -> None:
    views = generate_views(load_project(ROOT))
    assert len(views) == GENERATED_VIEW_COUNT
    assert "Inventory STM realization" in views["02-theory-realization.md"]
    assert "```mermaid" in views["07-runtime-view.md"]


def test_schedule() -> None:
    project = load_project(ROOT)
    ready = {item.entity.id for item in assess_work(project) if item.ready}
    assert "work.kernel-spec" in ready
    assert "work.stm-runtime" not in ready
    path = critical_path(project)
    assert path
    assert path[-1] in {"work.stm-model-check", "work.inventory-stm"}
