import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  PortfolioDocument,
  WorkDefinition,
} from "../../../../../src/portfolio-model/decode.ts";
import type { RoadmapAccessibleTarget, RoadmapModel } from "../../roadmap-model.ts";

const hasTargetKind =
  <Kind extends RoadmapAccessibleTarget["kind"]>(kind: Kind) =>
  (target: RoadmapAccessibleTarget): target is Extract<RoadmapAccessibleTarget, { kind: Kind }> =>
    target.kind === kind;

export const RoadmapNavigation = ({
  document,
  model,
  onSelect,
  onProjectFocus,
}: {
  readonly document: PortfolioDocument;
  readonly model: RoadmapModel;
  readonly onSelect: (work: WorkDefinition) => void;
  readonly onProjectFocus: (id: string) => void;
}) => {
  const work = new Map(document.work.map((item) => [item.id, item]));
  const projects = new Map(model.projects.map((project) => [project.project_id, project]));
  const projectTargets = model.accessible_targets.filter(hasTargetKind("project"));
  const workTargets = model.accessible_targets.filter(
    (target): target is Extract<RoadmapAccessibleTarget, { kind: "milestone" | "feature" }> =>
      target.kind === "milestone" || target.kind === "feature",
  );
  const dependencyTargets = model.accessible_targets.filter(hasTargetKind("dependency"));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ordered roadmap navigation</CardTitle>
        <p className="text-sm text-muted-foreground">
          Keyboard and assistive-technology path through the same dependency observation.
        </p>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-3">
        <section aria-labelledby="roadmap-project-order-heading">
          <h2 className="mb-2 font-heading font-semibold" id="roadmap-project-order-heading">
            Project membership
          </h2>
          <ol className="grid gap-2" aria-label="Ordered roadmap projects">
            {projectTargets.map(({ project_id }) => {
              const project = projects.get(project_id)!;
              return (
                <li className="rounded-lg border p-3" key={project_id}>
                  <Badge variant="outline">project</Badge>
                  <Button variant="link" onClick={() => onProjectFocus(project_id)}>
                    {project.name}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {project.identity_ids.length} work identities
                  </p>
                </li>
              );
            })}
          </ol>
        </section>
        <section aria-labelledby="roadmap-node-order-heading">
          <h2 className="mb-2 font-heading font-semibold" id="roadmap-node-order-heading">
            Work by prerequisite depth
          </h2>
          <ol className="grid gap-2" aria-label="Ordered roadmap work nodes">
            {workTargets.map(({ work_id }) => {
              const node = model.nodes.find(({ id }) => id === work_id)!;
              const item = work.get(work_id)!;
              return (
                <li className="grid grid-cols-[auto_1fr] items-center gap-2" key={work_id}>
                  <Badge variant="secondary">depth {node.depth}</Badge>
                  <Button
                    className="h-auto justify-start whitespace-normal text-left"
                    variant="outline"
                    onClick={() => onSelect(item)}
                  >
                    {item.title}
                  </Button>
                </li>
              );
            })}
          </ol>
        </section>
        <section aria-labelledby="roadmap-dependency-order-heading">
          <h2 className="mb-2 font-heading font-semibold" id="roadmap-dependency-order-heading">
            Prerequisite links
          </h2>
          <ol className="grid gap-2" aria-label="Ordered roadmap dependency links">
            {dependencyTargets.map((dependency) => (
              <li className="grid gap-1 rounded-lg border p-3" key={dependency.relation_id}>
                <Badge className="w-fit" variant="outline">
                  requires
                </Badge>
                <span className="text-sm">
                  <Button
                    variant="link"
                    onClick={() => onSelect(work.get(dependency.prerequisite_id)!)}
                  >
                    {work.get(dependency.prerequisite_id)?.title}
                  </Button>
                  <span aria-hidden="true"> → </span>
                  <Button
                    variant="link"
                    onClick={() => onSelect(work.get(dependency.dependent_id)!)}
                  >
                    {work.get(dependency.dependent_id)?.title}
                  </Button>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </CardContent>
    </Card>
  );
};
