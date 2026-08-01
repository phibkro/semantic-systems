import {
  Background,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  PortfolioDocument,
  WorkDefinition,
} from "../../../../../src/portfolio-model/decode.ts";
import type { RoadmapModel } from "../../roadmap-model.ts";

interface RoadmapGraphProps {
  readonly document: PortfolioDocument;
  readonly model: RoadmapModel;
  readonly selectedId: string | null;
  readonly onSelect: (work: WorkDefinition) => void;
}

export const relatedRoadmapIdentities = (
  model: Pick<RoadmapModel, "nodes">,
  selectedId: string | null,
): ReadonlySet<string> => {
  if (selectedId === null) return new Set();
  const related = new Set([selectedId]);
  const byId = new Map(model.nodes.map((node) => [node.id, node]));

  const visit = (first: string, direction: "prerequisite_ids" | "unlock_ids"): void => {
    const visited = new Set([first]);
    const pending = [first];
    while (pending.length > 0) {
      const node = byId.get(pending.pop()!);
      if (node === undefined) continue;
      for (const identity of node[direction]) {
        if (visited.has(identity)) continue;
        visited.add(identity);
        related.add(identity);
        pending.push(identity);
      }
    }
  };

  visit(selectedId, "prerequisite_ids");
  visit(selectedId, "unlock_ids");
  return related;
};

const labelFor = (
  node: RoadmapModel["nodes"][number],
  projectName: string,
  selected: boolean,
): ReactNode => (
  <div className="grid gap-1.5 text-left">
    <span className="flex items-center justify-between gap-2">
      <Badge variant="outline">{node.kind}</Badge>
      <Badge variant={selected ? "default" : "secondary"}>{node.status}</Badge>
    </span>
    <strong className={node.scale === "major" ? "text-base" : "text-sm"}>{node.title}</strong>
    <span className="text-xs text-muted-foreground">{projectName}</span>
  </div>
);

export const RoadmapGraph = ({ document, model, selectedId, onSelect }: RoadmapGraphProps) => {
  const projects = new Map(document.projects.map((project) => [project.id, project.name]));
  const work = new Map(document.work.map((item) => [item.id, item]));
  const related = relatedRoadmapIdentities(model, selectedId);
  const nodes: Array<Node<{ readonly label: ReactNode }>> = model.nodes.map((node) => ({
    id: node.id,
    position: node.position,
    data: {
      label: labelFor(
        node,
        projects.get(node.project_id) ?? node.project_id,
        node.id === selectedId,
      ),
    },
    draggable: false,
    connectable: false,
    selectable: false,
    focusable: false,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    ariaLabel: `${node.kind} ${node.title}; depth ${node.depth}; lane ${node.lane}`,
    style: { width: node.scale === "major" ? 280 : 232 },
    className: cn(
      "rounded-xl border bg-card p-3 text-card-foreground shadow-sm",
      node.scale === "major" && "border-2 border-primary/60",
      selectedId !== null && !related.has(node.id) && "border-dashed bg-muted/30",
      node.id === selectedId && "ring-2 ring-primary",
    ),
  }));
  const edges: Array<Edge> = model.dependency_edges.map((edge) => ({
    id: edge.id,
    source: edge.visual_source_id,
    target: edge.visual_target_id,
    type: "smoothstep",
    focusable: false,
    selectable: false,
    ariaLabel: `${work.get(edge.prerequisite_id)?.title ?? edge.prerequisite_id} unlocks ${work.get(edge.dependent_id)?.title ?? edge.dependent_id}`,
    markerEnd: { type: MarkerType.ArrowClosed },
    ...(selectedId !== null &&
    !(related.has(edge.prerequisite_id) && related.has(edge.dependent_id))
      ? { className: "opacity-20" }
      : {}),
  }));

  return (
    <div
      className="h-[34rem] overflow-hidden rounded-xl border bg-muted/20 [&_a]:text-foreground!"
      aria-label="Interactive prerequisite skill tree"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.16 }}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        deleteKeyCode={null}
        multiSelectionKeyCode={null}
        minZoom={0.2}
        maxZoom={1.6}
        onNodeClick={(_event, node) => {
          const selected = work.get(node.id);
          if (selected !== undefined) onSelect(selected);
        }}
        aria-label="Prerequisite graph canvas"
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
};
