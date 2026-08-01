import { useMachine } from "@xstate/react";
import { Effect } from "effect";
import { useState, type ReactNode } from "react";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { RoadmapExplorer } from "@/components/roadmap/RoadmapExplorer";
import type {
  PortfolioDocument,
  WorkDefinition,
  WorkStatus,
} from "../../../src/portfolio-model/decode.ts";
import { projectPortfolio } from "../../../src/portfolio-model/project.ts";
import type { DataState } from "./model.ts";
import {
  portfolioUiMachine,
  type PortfolioView,
  type RoadmapMode,
} from "./portfolio-ui-machine.ts";
import type { PortfolioState } from "./portfolio-snapshot.ts";
import { deriveRoadmapModel } from "./roadmap-model.ts";
import { usePortfolio } from "./use-portfolio.ts";

const VIEWS: ReadonlyArray<{
  readonly id: PortfolioView;
  readonly label: string;
  readonly glyph: string;
}> = [
  { id: "overview", label: "Overview", glyph: "◉" },
  { id: "board", label: "Board", glyph: "▦" },
  { id: "features", label: "Features", glyph: "◇" },
  { id: "roadmap", label: "Roadmap", glyph: "⌁" },
  { id: "history", label: "History", glyph: "✓" },
];

const HORIZON = [
  "candidate",
  "planned",
  "ready",
  "active",
  "blocked",
  "review",
] as const satisfies ReadonlyArray<WorkStatus>;

const STATE_COPY: Record<DataState, { readonly label: string; readonly detail: string }> = {
  current: { label: "Current", detail: "Digest-valid portfolio observation." },
  update_available: {
    label: "Update available",
    detail: "A newer append-only portfolio observation is ready.",
  },
  stale: { label: "Stale", detail: "Using the last valid portfolio observation." },
  offline: { label: "Offline", detail: "Using the last valid portfolio observation offline." },
  invalid: {
    label: "Invalid update rejected",
    detail: "The candidate failed schema, digest, or append-only history checks.",
  },
  unavailable: { label: "Unavailable", detail: "No valid portfolio observation is available." },
  loading: { label: "Loading", detail: "Validating the PBK portfolio observation." },
};

type BadgeVariant = NonNullable<Parameters<typeof badgeVariants>[0]>["variant"];

const statusVariant = (status: string): BadgeVariant => {
  if (["accepted", "ready", "active"].includes(status)) return "default";
  if (["blocked", "abandoned"].includes(status)) return "destructive";
  return "secondary";
};

const projectName = (document: PortfolioDocument, id: string): string =>
  document.projects.find((project) => project.id === id)?.name ?? id;

const latestPriority = (document: PortfolioDocument, workId: string) =>
  document.priorities
    .filter(({ work_id }) => work_id === workId)
    .toSorted(
      (left, right) =>
        right.asserted_at.localeCompare(left.asserted_at) || right.id.localeCompare(left.id),
    )[0];

const labelsFor = (document: PortfolioDocument, workId: string) => {
  const ids = new Set(
    document.memberships
      .filter(({ work_id }) => work_id === workId)
      .map(({ label_id }) => label_id),
  );
  return document.labels.filter(({ id }) => ids.has(id));
};

const SectionTitle = ({
  children,
  count,
}: {
  readonly children: ReactNode;
  readonly count: number;
}) => (
  <div className="mb-3 flex items-center justify-between gap-3">
    <h2 className="font-heading text-lg font-semibold">{children}</h2>
    <Badge variant="secondary">{count}</Badge>
  </div>
);

const WorkButton = ({
  document,
  work,
  onSelect,
  compact = false,
}: {
  readonly document: PortfolioDocument;
  readonly work: WorkDefinition;
  readonly onSelect: (work: WorkDefinition) => void;
  readonly compact?: boolean;
}) => {
  const priority = latestPriority(document, work.id);
  return (
    <Button
      variant="outline"
      className={cn(
        "h-auto min-h-11 w-full flex-col items-stretch justify-start gap-2 whitespace-normal p-3 text-left",
        work.kind === "milestone" && "border-2 border-primary/40",
      )}
      type="button"
      onClick={() => onSelect(work)}
    >
      <span className="flex items-center justify-between gap-2">
        <Badge variant="outline">{work.kind}</Badge>
        <Badge variant={statusVariant(work.status)}>{work.status}</Badge>
      </span>
      <strong>{work.title}</strong>
      {!compact && <span className="text-sm text-muted-foreground">{work.summary}</span>}
      <span className="text-xs text-muted-foreground">
        {projectName(document, work.project_id)}
        {priority === undefined ? "" : ` · priority ${priority.rank}`}
      </span>
      <code className="text-xs break-all">{work.id}</code>
    </Button>
  );
};

const PortfolioStatus = ({
  result,
  onRefresh,
  onApply,
}: {
  readonly result: PortfolioState;
  readonly onRefresh: () => void;
  readonly onApply: () => void;
}) => {
  const copy = STATE_COPY[result.state];
  return (
    <aside
      className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-2 text-sm"
      aria-live="polite"
    >
      <div className="grid gap-0.5">
        <span className="font-semibold">{copy.label}</span>
        <span className="text-muted-foreground">
          {copy.detail}
          {result.detail === undefined ? "" : ` ${result.detail}`}
        </span>
      </div>
      <div className="flex gap-2">
        {result.pending !== null && (
          <Button size="sm" type="button" onClick={onApply}>
            Apply update
          </Button>
        )}
        <Button aria-label="Refresh portfolio" size="sm" variant="outline" onClick={onRefresh}>
          Refresh
        </Button>
      </div>
    </aside>
  );
};

const Overview = ({ document, onSelect }: ViewProps) => {
  const projection = projectPortfolio(document);
  const prioritized = document.work
    .filter(({ status }) => HORIZON.includes(status as (typeof HORIZON)[number]))
    .toSorted((left, right) => {
      const leftRank = latestPriority(document, left.id)?.rank ?? Number.POSITIVE_INFINITY;
      const rightRank = latestPriority(document, right.id)?.rank ?? Number.POSITIVE_INFINITY;
      return leftRank - rightRank || left.id.localeCompare(right.id);
    });
  const metrics = [
    ["projects", projection.overview.project_count],
    ["working horizon", projection.overview.horizon_count],
    ["accepted receipts", projection.overview.accepted_receipt_count],
  ] as const;
  return (
    <div className="grid gap-6">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-card to-primary/5">
        <CardHeader>
          <Badge className="mb-1" variant="outline">
            Portfolio observation
          </Badge>
          <CardTitle className="text-2xl">{document.studio.name}</CardTitle>
          <CardDescription>{document.studio.summary}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-2">
          {metrics.map(([label, value]) => (
            <Card className="gap-1 p-3 text-center shadow-none" key={label}>
              <strong className="text-2xl">{value}</strong>
              <span className="text-xs text-muted-foreground">{label}</span>
            </Card>
          ))}
        </CardContent>
      </Card>
      <section>
        <SectionTitle count={document.projects.length}>Projects</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {document.projects.map((project) => (
            <Card className="gap-3" key={project.id}>
              <CardHeader>
                <Badge variant={statusVariant(project.status)}>{project.status}</Badge>
                <CardTitle>{project.name}</CardTitle>
                <CardDescription>{project.summary}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 text-xs">
                <code className="break-all">{project.head}</code>
                {project.preview_url !== null && (
                  <Button
                    nativeButton={false}
                    render={
                      <a
                        aria-label={`Open ${project.name} observed preview`}
                        href={project.preview_url}
                        rel="noreferrer"
                        target="_blank"
                      />
                    }
                    variant="link"
                  >
                    Open observed preview
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      <section>
        <SectionTitle count={prioritized.length}>Prioritized horizon</SectionTitle>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {prioritized.map((work) => (
            <WorkButton key={work.id} document={document} work={work} onSelect={onSelect} />
          ))}
        </div>
      </section>
    </div>
  );
};

interface ViewProps {
  readonly document: PortfolioDocument;
  readonly onSelect: (work: WorkDefinition) => void;
}

const Board = ({ document, onSelect }: ViewProps) => {
  const board = projectPortfolio(document).board;
  const byId = new Map(document.work.map((work) => [work.id, work]));
  return (
    <ScrollArea className="w-full pb-4" aria-label="PBK working horizon board">
      <div className="grid min-w-[84rem] grid-cols-6 gap-3">
        {HORIZON.map((status) => (
          <Card className="h-fit gap-3" key={status}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="capitalize">{status}</CardTitle>
              <Badge variant="secondary">{board[status].length}</Badge>
            </CardHeader>
            <CardContent className="grid gap-2">
              {board[status].map((id) => (
                <WorkButton
                  compact
                  document={document}
                  key={id}
                  work={byId.get(id)!}
                  onSelect={onSelect}
                />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
};

const Features = ({ document, onSelect }: ViewProps) => {
  const [query, setQuery] = useState("");
  const [project, setProject] = useState("all");
  const term = query.trim().toLowerCase();
  const visible = document.work.filter(
    (work) =>
      (project === "all" || work.project_id === project) &&
      (term === "" ||
        [work.id, work.title, work.summary, work.status, ...Object.keys(work.attributes)]
          .join(" ")
          .toLowerCase()
          .includes(term)),
  );
  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-3 sm:grid-cols-[1fr_16rem]">
          <div className="grid gap-1 text-sm font-medium">
            <label htmlFor="portfolio-feature-search">Search features</label>
            <Input
              aria-label="Search features"
              id="portfolio-feature-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="grid gap-1 text-sm font-medium">
            <span id="portfolio-project-filter-label">Project</span>
            <Select value={project} onValueChange={(value) => setProject(value ?? "all")}>
              <SelectTrigger className="w-full" aria-labelledby="portfolio-project-filter-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {document.projects.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">
        {visible.length} milestone and feature records
      </p>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="PBK features">
        {visible.map((work) => (
          <WorkButton key={work.id} document={document} work={work} onSelect={onSelect} />
        ))}
      </section>
    </div>
  );
};

const History = ({ document, onSelect }: ViewProps) => {
  const history = projectPortfolio(document).history;
  const byId = new Map(document.work.map((work) => [work.id, work]));
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <SectionTitle count={history.receipts.length}>Work receipts</SectionTitle>
        <div className="grid gap-2">
          {history.receipts.map((receipt) => (
            <Button
              className="h-auto flex-col items-stretch gap-2 whitespace-normal p-3 text-left"
              variant="outline"
              key={receipt.id}
              onClick={() => onSelect(byId.get(receipt.work_id)!)}
            >
              <Badge variant={statusVariant(receipt.outcome)}>{receipt.outcome}</Badge>
              <strong>{byId.get(receipt.work_id)?.title}</strong>
              <time className="text-xs text-muted-foreground">{receipt.observed_at}</time>
              <code className="text-xs break-all">{receipt.commit}</code>
            </Button>
          ))}
        </div>
      </section>
      <section>
        <SectionTitle count={history.snapshots.length}>Product snapshots</SectionTitle>
        <div className="grid gap-2">
          {history.snapshots.map((snapshot) => (
            <Card className="gap-2 p-3" key={snapshot.id}>
              <Badge variant="outline">content addressed</Badge>
              <strong>{projectName(document, snapshot.project_id)}</strong>
              <time className="text-xs text-muted-foreground">{snapshot.observed_at}</time>
              <code className="text-xs break-all">{snapshot.digest}</code>
              {snapshot.preview_url !== null && (
                <Button
                  nativeButton={false}
                  render={
                    <a
                      aria-label={`Open ${projectName(document, snapshot.project_id)} exact observed preview`}
                      href={snapshot.preview_url}
                      rel="noreferrer"
                      target="_blank"
                    />
                  }
                  variant="link"
                >
                  Open exact observed preview
                </Button>
              )}
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
};

const WorkDetail = ({
  document,
  work,
  onClose,
}: ViewProps & { readonly work: WorkDefinition; readonly onClose: () => void }) => {
  const detail = projectPortfolio(document).detail(work.id);
  const names = new Map(document.work.map((item) => [item.id, item.title]));
  const priority = latestPriority(document, work.id);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <Badge variant="outline">{work.kind}</Badge>
          <DialogTitle className="text-xl">{work.title}</DialogTitle>
          <DialogDescription>{work.summary}</DialogDescription>
          <code className="text-xs break-all">{work.id}</code>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Badge variant={statusVariant(work.status)}>{work.status}</Badge>
          <Badge variant="secondary">{projectName(document, work.project_id)}</Badge>
          {priority !== undefined && <Badge variant="secondary">priority {priority.rank}</Badge>}
          {labelsFor(document, work.id).map((label) => (
            <Badge variant="outline" key={label.id}>
              {label.name}
            </Badge>
          ))}
        </div>
        <Separator />
        <section className="grid gap-2">
          <h3 className="font-heading font-semibold">Definition of done</h3>
          <ul className="list-disc space-y-1 pl-5">
            {work.definition_of_done.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="grid gap-2">
          <h3 className="font-heading font-semibold">Typed metadata</h3>
          <dl className="grid gap-2 sm:grid-cols-2">
            {Object.entries(work.attributes).map(([key, value]) => (
              <div className="rounded-lg border bg-muted/30 p-2" key={key}>
                <dt className="text-xs font-semibold text-muted-foreground">{key}</dt>
                <dd>
                  <code className="text-xs break-all">{JSON.stringify(value)}</code>
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="grid gap-2">
          <h3 className="font-heading font-semibold">Typed relations</h3>
          {detail.relations.length === 0 ? (
            <p className="text-muted-foreground">No typed work relations.</p>
          ) : (
            <ul className="grid gap-2">
              {detail.relations.map((relation) => (
                <li className="rounded-lg border p-3" key={relation.id}>
                  <Badge variant="outline">{relation.kind}</Badge>
                  <p>
                    {names.get(relation.source_id)} → {names.get(relation.target_id)}
                  </p>
                  <p className="text-muted-foreground">{relation.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="grid gap-2">
          <h3 className="font-heading font-semibold">
            Research, design, journeys, evidence, and previews
          </h3>
          {detail.artifacts.length === 0 ? (
            <p className="text-muted-foreground">No artifact references recorded.</p>
          ) : (
            <ul className="grid gap-2">
              {detail.artifacts.map((artifact) => (
                <li className="grid gap-1 rounded-lg border p-3" key={artifact.id}>
                  <Badge variant="outline">{artifact.kind}</Badge>
                  <a
                    className="font-medium underline"
                    href={artifact.href}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {artifact.title}
                  </a>
                  <code className="text-xs break-all">{artifact.revision}</code>
                </li>
              ))}
            </ul>
          )}
        </section>
        {(detail.receipts.length > 0 || detail.snapshots.length > 0) && (
          <section className="grid gap-2">
            <h3 className="font-heading font-semibold">Acceptance history</h3>
            {detail.receipts.map((receipt) => (
              <Card className="gap-1 p-3" key={receipt.id}>
                <Badge variant={statusVariant(receipt.outcome)}>{receipt.outcome}</Badge>
                <time>{receipt.observed_at}</time>
                <code className="text-xs break-all">{receipt.commit}</code>
              </Card>
            ))}
            {detail.snapshots.map((snapshot) => (
              <Card className="gap-1 p-3" key={snapshot.id}>
                <Badge variant="outline">snapshot</Badge>
                <code className="text-xs break-all">{snapshot.digest}</code>
                {snapshot.preview_url !== null && (
                  <a
                    className="underline"
                    href={snapshot.preview_url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open exact observed preview
                  </a>
                )}
              </Card>
            ))}
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
};

const viewValue = (value: unknown): PortfolioView => {
  if (typeof value === "object" && value !== null && "roadmap" in value) return "roadmap";
  return VIEWS.some(({ id }) => id === value) ? (value as PortfolioView) : "overview";
};

const PortfolioBody = ({
  result,
  onApply,
  onRefresh,
  scopeControls,
}: {
  readonly result: PortfolioState;
  readonly onApply: () => void;
  readonly onRefresh: () => void;
  readonly scopeControls?: ReactNode;
}) => {
  const document = result.snapshot?.document ?? null;
  const roadmapObservation =
    document === null
      ? null
      : Effect.runSync(
          deriveRoadmapModel(document).pipe(
            Effect.match({
              onFailure: (failure) => ({
                state: "unavailable" as const,
                message: failure.message,
              }),
              onSuccess: (model) => ({ state: "ready" as const, model }),
            }),
          ),
        );
  const roadmapModel = roadmapObservation?.state === "ready" ? roadmapObservation.model : null;
  const [ui, send] = useMachine(portfolioUiMachine, {
    input: {
      work: document?.work ?? [],
      projectIds: roadmapModel?.projects.map(({ project_id }) => project_id) ?? [],
      roadmapWorkIds: roadmapModel?.work_identities ?? [],
    },
  });
  const view = viewValue(ui.value);
  const mode: RoadmapMode = ui.matches({ roadmap: "mosaic" }) ? "mosaic" : "graph";
  const selected = document?.work.find(({ id }) => id === ui.context.selectedId) ?? null;
  const onSelect = (work: WorkDefinition) => send({ type: "work.select", id: work.id });
  const changeView = (next: string | null) => {
    if (next !== null && VIEWS.some(({ id }) => id === next))
      send({ type: `view.${next}` as `view.${PortfolioView}` });
  };
  return (
    <div className="min-h-dvh bg-background pb-20 text-foreground">
      <PortfolioStatus result={result} onApply={onApply} onRefresh={onRefresh} />
      <header className="border-b bg-card px-4 py-6 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-2">
          {scopeControls}
          <Badge className="mt-2" variant="outline">
            PBK Technologies
          </Badge>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Control Room</h1>
          <p className="max-w-3xl text-muted-foreground">
            One dependency-aware portfolio value, projected without deadlines or invented state.
          </p>
          {result.snapshot !== null && (
            <dl className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <div>
                <dt className="font-semibold">Portfolio digest</dt>
                <dd>
                  <code className="break-all">{result.snapshot.metadata.digest}</code>
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Observed</dt>
                <dd>{result.snapshot.metadata.observed_at}</dd>
              </div>
            </dl>
          )}
        </div>
      </header>
      <Tabs value={view} onValueChange={changeView}>
        <main className="mx-auto w-full max-w-7xl p-4 sm:p-6">
          {document === null ? (
            <Card className="mx-auto max-w-xl text-center">
              <CardHeader>
                <CardTitle>{STATE_COPY[result.state].label}</CardTitle>
                <CardDescription>
                  {result.detail ?? STATE_COPY[result.state].detail}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <>
              <TabsContent value="overview">
                <Overview document={document} onSelect={onSelect} />
              </TabsContent>
              <TabsContent value="board">
                <Board document={document} onSelect={onSelect} />
              </TabsContent>
              <TabsContent value="features">
                <Features document={document} onSelect={onSelect} />
              </TabsContent>
              <TabsContent value="roadmap">
                {roadmapModel === null ? (
                  <output>
                    <Card>
                      <CardHeader>
                        <CardTitle>Roadmap unavailable</CardTitle>
                        <CardDescription>
                          The portfolio remains available, but its roadmap projection was rejected.
                        </CardDescription>
                      </CardHeader>
                      {roadmapObservation?.state === "unavailable" && (
                        <CardContent>{roadmapObservation.message}</CardContent>
                      )}
                    </Card>
                  </output>
                ) : (
                  <RoadmapExplorer
                    document={document}
                    model={roadmapModel}
                    focusProject={ui.context.focusProject}
                    focusMilestone={ui.context.focusMilestone}
                    mode={mode}
                    selectedId={ui.context.selectedId}
                    onProjectFocus={(id) =>
                      send(id === null ? { type: "project.clear" } : { type: "project.focus", id })
                    }
                    onMilestoneFocus={(id) =>
                      send(
                        id === null ? { type: "milestone.clear" } : { type: "milestone.focus", id },
                      )
                    }
                    onMode={(next) => send({ type: `roadmap.${next}` })}
                    onSelect={onSelect}
                  />
                )}
              </TabsContent>
              <TabsContent value="history">
                <History document={document} onSelect={onSelect} />
              </TabsContent>
            </>
          )}
        </main>
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-2 backdrop-blur"
          aria-label="PBK portfolio views"
        >
          <TabsList className="mx-auto grid h-auto w-full max-w-2xl grid-cols-5">
            {VIEWS.map((item) => (
              <TabsTrigger className="h-12 flex-col gap-0 text-xs" key={item.id} value={item.id}>
                <span aria-hidden="true">{item.glyph}</span>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </nav>
      </Tabs>
      {selected !== null && document !== null && (
        <WorkDetail
          document={document}
          work={selected}
          onClose={() => send({ type: "work.close" })}
          onSelect={onSelect}
        />
      )}
    </div>
  );
};

const LivePortfolio = ({ scopeControls }: { readonly scopeControls?: ReactNode }) => {
  const result = usePortfolio();
  return (
    <PortfolioBody
      key={result.snapshot?.metadata.digest ?? result.state}
      result={result}
      onApply={result.applyUpdate}
      onRefresh={result.refresh}
      scopeControls={scopeControls}
    />
  );
};

export default function Portfolio({
  provided,
  scopeControls,
}: {
  readonly provided?: PortfolioState;
  readonly scopeControls?: ReactNode;
}) {
  return provided === undefined ? (
    <LivePortfolio scopeControls={scopeControls} />
  ) : (
    <PortfolioBody
      key={provided.snapshot?.metadata.digest ?? provided.state}
      result={provided}
      onApply={() => undefined}
      onRefresh={() => undefined}
      scopeControls={scopeControls}
    />
  );
}
