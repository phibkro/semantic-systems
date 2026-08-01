import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  PortfolioDocument,
  WorkDefinition,
} from "../../../../../src/portfolio-model/decode.ts";
import type { RoadmapModel } from "../../roadmap-model.ts";
import type { RoadmapMode } from "../../portfolio-ui-machine.ts";
import { RoadmapGraph } from "./RoadmapGraph.tsx";
import { RoadmapMosaic } from "./RoadmapMosaic.tsx";
import { RoadmapNavigation } from "./RoadmapNavigation.tsx";

export interface RoadmapExplorerProps {
  readonly document: PortfolioDocument;
  readonly model: RoadmapModel;
  readonly mode: RoadmapMode;
  readonly selectedId: string | null;
  readonly focusProject: string | null;
  readonly focusMilestone: string | null;
  readonly onMode: (mode: RoadmapMode) => void;
  readonly onSelect: (work: WorkDefinition) => void;
  readonly onProjectFocus: (id: string | null) => void;
  readonly onMilestoneFocus: (id: string | null) => void;
}

export const RoadmapExplorer = ({
  document,
  model,
  mode,
  selectedId,
  focusProject,
  focusMilestone,
  onMode,
  onSelect,
  onProjectFocus,
  onMilestoneFocus,
}: RoadmapExplorerProps) => {
  return (
    <section className="grid gap-4" aria-label="PBK dependency roadmap">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={mode} onValueChange={(value) => onMode(value as RoadmapMode)}>
          <TabsList aria-label="Roadmap presentation">
            <TabsTrigger value="graph">Graph</TabsTrigger>
            <TabsTrigger value="mosaic">Mosaic</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">{model.projects.length} projects</Badge>
          <Badge variant="outline">{model.work_identities.length} work nodes</Badge>
          <Badge variant="outline">{model.containment_edges.length} contains links</Badge>
          <Badge variant="outline">{model.dependency_edges.length} requires links</Badge>
          <span>No time axis. Arrows point from prerequisite to dependent.</span>
        </div>
      </div>
      {mode === "graph" ? (
        <RoadmapGraph
          document={document}
          model={model}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ) : (
        <RoadmapMosaic
          document={document}
          model={model}
          selectedId={selectedId}
          focusProject={focusProject}
          focusMilestone={focusMilestone}
          onSelect={onSelect}
          onProjectFocus={onProjectFocus}
          onMilestoneFocus={onMilestoneFocus}
        />
      )}
      <RoadmapNavigation
        document={document}
        model={model}
        onSelect={onSelect}
        onProjectFocus={(id) => {
          onProjectFocus(id);
          onMode("mosaic");
        }}
      />
    </section>
  );
};
