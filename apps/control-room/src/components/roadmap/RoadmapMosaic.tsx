import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  PortfolioDocument,
  WorkDefinition,
} from "../../../../../src/portfolio-model/decode.ts";
import type { RoadmapModel } from "../../roadmap-model.ts";

interface RoadmapMosaicProps {
  readonly document: PortfolioDocument;
  readonly model: RoadmapModel;
  readonly selectedId: string | null;
  readonly focusProject: string | null;
  readonly focusMilestone: string | null;
  readonly onSelect: (work: WorkDefinition) => void;
  readonly onProjectFocus: (id: string | null) => void;
  readonly onMilestoneFocus: (id: string | null) => void;
}

export const RoadmapMosaic = ({
  document,
  model,
  selectedId,
  focusProject,
  focusMilestone,
  onSelect,
  onProjectFocus,
  onMilestoneFocus,
}: RoadmapMosaicProps) => {
  const work = new Map(document.work.map((item) => [item.id, item]));
  const projects = new Map(document.projects.map((project) => [project.id, project]));
  const focusedNode = model.nodes.find(({ id }) => id === focusMilestone);

  return (
    <div className="grid gap-4" aria-label="Roadmap mosaic">
      <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="Mosaic focus path">
        <Button variant="link" onClick={() => onProjectFocus(null)}>
          PBK Technologies
        </Button>
        {focusProject !== null && (
          <>
            <span aria-hidden="true">/</span>
            <Button variant="link" onClick={() => onMilestoneFocus(null)}>
              {projects.get(focusProject)?.name ?? focusProject}
            </Button>
          </>
        )}
        {focusedNode !== undefined && (
          <>
            <span aria-hidden="true">/</span>
            <span>{focusedNode.title}</span>
          </>
        )}
      </nav>

      <div className="grid gap-4 lg:grid-cols-2">
        {model.projects.map((project) => {
          const projectFocused = project.project_id === focusProject;
          const subdued = focusProject !== null && !projectFocused;
          return (
            <Card
              className={cn(
                "transition-colors",
                projectFocused && "border-2 border-primary/50 lg:col-span-2",
                subdued && "border-dashed bg-muted/20",
              )}
              key={project.project_id}
            >
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div className="grid gap-2">
                  <Badge className="w-fit" variant="outline">
                    project membership
                  </Badge>
                  <CardTitle>
                    {projects.get(project.project_id)?.name ?? project.project_id}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {project.identity_ids.length} saved-view identities
                  </p>
                </div>
                {!projectFocused && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onProjectFocus(project.project_id)}
                  >
                    Focus project
                  </Button>
                )}
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {project.identity_ids.map((identity) => {
                  const item = work.get(identity)!;
                  const node = model.nodes.find(({ id }) => id === identity)!;
                  const milestoneFocused = identity === focusMilestone;
                  const inFocusedContainment =
                    focusedNode?.contained_ids.includes(identity) ?? false;
                  const compact =
                    !projectFocused ||
                    (focusMilestone !== null && !milestoneFocused && !inFocusedContainment);
                  return (
                    <article
                      className={cn(
                        "grid gap-2 rounded-xl border bg-card p-3",
                        node.scale === "major" && "border-2 border-primary/40",
                        selectedId === identity && "ring-2 ring-primary",
                        compact && "bg-muted/20",
                      )}
                      key={identity}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <Badge variant="outline">{item.kind}</Badge>
                        <Badge variant="secondary">{item.status}</Badge>
                      </span>
                      <strong>{item.title}</strong>
                      {!compact && <p className="text-sm text-muted-foreground">{item.summary}</p>}
                      {node.container_ids.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Authored containers: {node.container_ids.length}
                        </p>
                      )}
                      {node.contained_ids.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Authored contained work: {node.contained_ids.length}
                        </p>
                      )}
                      <div className="mt-auto flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => onSelect(item)}>
                          Open detail
                        </Button>
                        {projectFocused &&
                          item.kind === "milestone" &&
                          node.contained_ids.length > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onMilestoneFocus(milestoneFocused ? null : identity)}
                            >
                              {milestoneFocused
                                ? "Clear containment focus"
                                : "Focus authored containment"}
                            </Button>
                          )}
                      </div>
                    </article>
                  );
                })}
              </CardContent>
              {projectFocused && project.milestone_ids.length > 0 && (
                <CardContent className="grid gap-3 border-t pt-4">
                  <h2 className="font-heading font-semibold">Authored containment relationships</h2>
                  <p className="text-sm text-muted-foreground">
                    These groups repeat a feature once for each authored container. They do not add
                    dependency edges.
                  </p>
                  {project.milestone_ids.map((milestoneId) => {
                    const milestone = work.get(milestoneId)!;
                    const node = model.nodes.find(({ id }) => id === milestoneId)!;
                    const subduedContainment =
                      focusMilestone !== null && focusMilestone !== milestoneId;
                    return (
                      <section
                        className={cn(
                          "grid gap-2 rounded-xl border p-3",
                          subduedContainment && "border-dashed bg-muted/20",
                        )}
                        aria-label={`${milestone.title} authored containment`}
                        key={milestoneId}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong>{milestone.title}</strong>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              onMilestoneFocus(focusMilestone === milestoneId ? null : milestoneId)
                            }
                          >
                            {focusMilestone === milestoneId
                              ? "Clear containment focus"
                              : "Focus authored containment"}
                          </Button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                          {node.contained_ids.map((containedId) => {
                            const containedWork = work.get(containedId)!;
                            return (
                              <Button
                                className="h-auto justify-start whitespace-normal text-left"
                                variant="outline"
                                key={`${milestoneId}:${containedId}`}
                                onClick={() => onSelect(containedWork)}
                              >
                                {containedWork.title}
                              </Button>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};
