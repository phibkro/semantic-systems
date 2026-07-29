import {
  Activity,
  Boxes,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  FileWarning,
  FlaskConical,
  GitCommitHorizontal,
  RefreshCw,
  Search,
  ShieldCheck,
  WifiOff,
  X,
} from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type {
  DataState,
  PublicEntity,
  PublicRelation,
  PublicSnapshot,
  SnapshotState,
} from "@/model";
import { useSnapshot } from "@/use-snapshot";

type View = "pulse" | "systems" | "semantics" | "evidence" | "work";

const VIEW_KINDS: Record<Exclude<View, "pulse">, Set<string>> = {
  systems: new Set([
    "artifact",
    "component",
    "deployment",
    "domain_machine",
    "environment",
    "package",
    "protocol",
    "runtime",
    "type",
  ]),
  semantics: new Set([
    "decision",
    "effect",
    "handler",
    "invariant",
    "law",
    "operation",
    "realization",
    "theory",
  ]),
  evidence: new Set(["assumption", "claim", "evidence", "obligation", "question"]),
  work: new Set(["agent", "gate", "human", "milestone", "responsibility", "work_item"]),
};

const NAVIGATION: Array<{
  id: View;
  label: string;
  icon: typeof Activity;
}> = [
  { id: "pulse", label: "Pulse", icon: Activity },
  { id: "systems", label: "Systems", icon: Boxes },
  { id: "semantics", label: "Semantics", icon: FlaskConical },
  { id: "evidence", label: "Evidence", icon: ShieldCheck },
  { id: "work", label: "Work", icon: BriefcaseBusiness },
];

const STATE_COPY: Record<DataState, { label: string; description: string }> = {
  current: { label: "Current", description: "Accepted snapshot within its freshness window" },
  update_available: {
    label: "Update available",
    description: "A newer complete snapshot has been verified",
  },
  stale: { label: "Stale", description: "Last valid snapshot is beyond its freshness window" },
  offline: { label: "Offline", description: "Using the last valid snapshot stored on this device" },
  invalid: { label: "Unavailable", description: "No complete, valid snapshot can be displayed" },
  loading: { label: "Loading", description: "Checking the accepted public snapshot" },
};

function statusTone(status: string | null): "default" | "secondary" | "outline" | "destructive" {
  if (status === "blocked" || status === "failed") return "destructive";
  if (status === "complete" || status === "accepted" || status === "passed") return "default";
  if (status === "ready" || status === "active" || status === "in_progress") return "secondary";
  return "outline";
}

function StatusBanner({
  result,
  onRefresh,
  onApply,
}: {
  result: SnapshotState;
  onRefresh: () => void;
  onApply: () => void;
}) {
  const copy = STATE_COPY[result.state];
  const localPreview = result.snapshot?.metadata.observation_source === "local_preview";
  const label = result.state === "current" && localPreview ? "Local preview" : copy.label;
  const description =
    result.state === "current" && localPreview
      ? "Clean committed worktree; accepted-main deployment not claimed"
      : copy.description;
  const Icon =
    result.state === "offline" ? WifiOff : result.state === "current" ? CheckCircle2 : Clock3;
  return (
    <section
      aria-label="Snapshot freshness"
      className="border-border/80 bg-card/95 sticky top-0 z-20 border-b px-4 py-2 backdrop-blur"
    >
      <div className="mx-auto flex max-w-4xl items-center gap-2">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-muted-foreground truncate text-xs">{description}</p>
        </div>
        {result.state === "update_available" ? (
          <Button size="sm" onClick={onApply}>
            Apply
          </Button>
        ) : (
          <Button aria-label="Refresh snapshot" size="icon-sm" variant="ghost" onClick={onRefresh}>
            <RefreshCw aria-hidden="true" />
          </Button>
        )}
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | string;
  detail: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">{detail}</CardContent>
    </Card>
  );
}

function Pulse({
  snapshot,
  onSelect,
}: {
  snapshot: PublicSnapshot;
  onSelect: (entity: PublicEntity) => void;
}) {
  const entities = new Map(snapshot.entities.map((entity) => [entity.id, entity]));
  const completed = snapshot.completed_work_ids.flatMap((id) => {
    const entity = entities.get(id);
    return entity ? [entity] : [];
  });
  const unsupported = snapshot.unsupported_claim_ids.flatMap((id) => {
    const entity = entities.get(id);
    return entity ? [entity] : [];
  });
  return (
    <div className="space-y-4" data-testid="view-pulse">
      <div className="grid grid-cols-2 gap-3">
        <Metric
          label="Active work"
          value={snapshot.active_work_ids.length}
          detail={`${snapshot.ready_work_ids.length} ready`}
        />
        <Metric
          label="Blocked"
          value={snapshot.blocked_work_ids.length}
          detail="Explicit work status"
        />
        <Metric
          label="Unsupported"
          value={snapshot.unsupported_claim_ids.length}
          detail="Claims without support relations"
        />
        <Metric
          label="Gate"
          value={snapshot.metadata.deployed_check_status.replace("_", " ")}
          detail="Deployed-check observation"
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCommitHorizontal aria-hidden="true" className="size-4" />
            Exact committed observation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Commit</p>
            <code className="break-all">{snapshot.metadata.commit}</code>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Snapshot digest</p>
            <code className="break-all">{snapshot.metadata.digest}</code>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Observed at</p>
            <time dateTime={snapshot.metadata.observed_at}>{snapshot.metadata.observed_at}</time>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Unsupported claims ({unsupported.length})</h2>
        </CardHeader>
        <CardContent>
          {unsupported.length ? (
            <ul className="space-y-2">
              {unsupported.map((entity) => (
                <li key={entity.id}>
                  <button
                    className="text-destructive min-h-11 text-left text-sm font-semibold underline underline-offset-4"
                    type="button"
                    onClick={() => onSelect(entity)}
                  >
                    {entity.name} <span className="font-mono text-xs">({entity.id})</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">No unsupported claims exported.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Completed work ({completed.length})</h2>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {completed.map((entity) => (
              <li key={entity.id}>
                <button
                  className="min-h-11 text-left text-sm font-semibold underline underline-offset-4"
                  type="button"
                  onClick={() => onSelect(entity)}
                >
                  {entity.name} <span className="font-mono text-xs">({entity.id})</span>
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function EntityList({
  snapshot,
  view,
  query,
  statusFilter,
  onSelect,
}: {
  snapshot: PublicSnapshot;
  view: Exclude<View, "pulse">;
  query: string;
  statusFilter: string;
  onSelect: (entity: PublicEntity) => void;
}) {
  const entities = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return snapshot.entities.filter(
      (entity) =>
        VIEW_KINDS[view].has(entity.kind) &&
        (!statusFilter || entity.status === statusFilter) &&
        (!needle ||
          `${entity.id} ${entity.name} ${entity.summary} ${entity.kind} ${entity.status ?? ""}`
            .toLowerCase()
            .includes(needle)),
    );
  }, [query, snapshot, statusFilter, view]);

  return (
    <section aria-label={`${view} entities`} className="space-y-2">
      <p aria-live="polite" className="text-muted-foreground text-xs">
        {entities.length} items · select one for relations and provenance
      </p>
      {entities.map((entity) => (
        <button
          key={entity.id}
          type="button"
          className="border-border bg-card hover:border-primary/50 focus-visible:ring-ring w-full rounded-xl border p-3 text-left shadow-xs transition focus-visible:ring-2"
          onClick={() => onSelect(entity)}
        >
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className="block font-semibold">{entity.name}</span>
              <span className="text-muted-foreground block truncate text-xs">{entity.id}</span>
            </span>
            <Badge variant={statusTone(entity.status)}>{entity.status ?? "unspecified"}</Badge>
          </span>
          {snapshot.unsupported_claim_ids.includes(entity.id) && (
            <Badge className="mt-2" variant="destructive">
              unsupported
            </Badge>
          )}
          <span className="text-muted-foreground mt-2 line-clamp-2 block text-sm">
            {entity.summary || "No public summary."}
          </span>
          <span className="mt-2 block text-xs font-medium">{entity.kind.replaceAll("_", " ")}</span>
        </button>
      ))}
      {entities.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            No items match this view, search, and status filter.
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function ComponentTree({
  snapshot,
  onSelect,
}: {
  snapshot: PublicSnapshot;
  onSelect: (entity: PublicEntity) => void;
}) {
  const entities = new Map(
    snapshot.entities
      .filter((entity) => VIEW_KINDS.systems.has(entity.kind))
      .map((entity) => [entity.id, entity]),
  );
  const children = new Map<string, string[]>();
  const childIds = new Set<string>();
  for (const relation of snapshot.relations) {
    if (
      relation.kind !== "contains" ||
      !entities.has(relation.source_id) ||
      !entities.has(relation.target_id)
    )
      continue;
    children.set(relation.source_id, [
      ...(children.get(relation.source_id) ?? []),
      relation.target_id,
    ]);
    childIds.add(relation.target_id);
  }
  const roots = [...entities.values()]
    .filter((entity) => !childIds.has(entity.id) && children.has(entity.id))
    .sort((left, right) => left.id.localeCompare(right.id));

  const branch = (entity: PublicEntity, ancestors: ReadonlySet<string>) => {
    if (ancestors.has(entity.id)) return null;
    const nextAncestors = new Set(ancestors).add(entity.id);
    const nested = (children.get(entity.id) ?? [])
      .flatMap((id) => {
        const child = entities.get(id);
        return child ? [child] : [];
      })
      .sort((left, right) => left.id.localeCompare(right.id));
    return (
      <li key={entity.id}>
        <details
          className="border-border bg-card rounded-lg border px-3 py-2"
          data-testid={`tree-${entity.id}`}
          open={!ancestors.size}
        >
          <summary className="min-h-11 cursor-pointer content-center font-semibold">
            {entity.name}{" "}
            <span className="text-muted-foreground font-mono text-xs">({entity.id})</span>
          </summary>
          <button
            className="text-primary min-h-11 text-sm font-semibold underline underline-offset-4"
            type="button"
            onClick={() => onSelect(entity)}
          >
            Inspect {entity.name}
          </button>
          {nested.length > 0 && (
            <ul className="mt-1 space-y-2 border-l pl-3">
              {nested.map((child) => branch(child, nextAncestors))}
            </ul>
          )}
        </details>
      </li>
    );
  };

  if (!roots.length) return null;
  return (
    <section aria-label="Recursive components" className="mb-5">
      <h2 className="mb-2 text-sm font-semibold">Recursive components</h2>
      <ul className="space-y-2">{roots.map((root) => branch(root, new Set()))}</ul>
    </section>
  );
}

function RelationList({
  title,
  relations,
  snapshot,
}: {
  title: string;
  relations: PublicRelation[];
  snapshot: PublicSnapshot;
}) {
  const names = new Map(snapshot.entities.map((entity) => [entity.id, entity.name]));
  const [kindFilter, setKindFilter] = useState("");
  const kinds = [...new Set(relations.map((relation) => relation.kind))].sort();
  const visible = relations.filter((relation) => !kindFilter || relation.kind === kindFilter);
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {title} ({visible.length}/{relations.length})
        </h3>
        {kinds.length > 1 && (
          <select
            aria-label={`Filter ${title.toLowerCase()} by kind`}
            className="border-input bg-background h-9 max-w-36 rounded-lg border px-2 text-xs"
            value={kindFilter}
            onChange={(event) => setKindFilter(event.target.value)}
          >
            <option value="">All relation kinds</option>
            {kinds.map((kind) => (
              <option key={kind} value={kind}>
                {kind.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        )}
      </div>
      <ul className="space-y-2">
        {visible.map((relation) => (
          <li
            key={`${relation.source_id}:${relation.kind}:${relation.target_id}`}
            className="bg-muted/70 rounded-lg p-2 text-sm"
          >
            <Badge variant="outline">{relation.kind}</Badge>
            <p className="mt-1">
              {names.get(relation.source_id)} → {names.get(relation.target_id)}
            </p>
            <code className="text-muted-foreground mt-1 block break-all text-xs">
              {relation.source_id} → {relation.target_id}
            </code>
            {relation.summary && (
              <p className="text-muted-foreground mt-1 text-xs">{relation.summary}</p>
            )}
            <a
              className="text-primary mt-1 inline-flex min-h-11 items-center text-xs font-semibold underline underline-offset-4"
              href={relation.source_url}
              rel="noreferrer"
              target="_blank"
            >
              Open relation source at exact commit
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Detail({
  entity,
  snapshot,
  restoreFocusTo,
  onClose,
}: {
  entity: PublicEntity;
  snapshot: PublicSnapshot;
  restoreFocusTo: HTMLElement | null;
  onClose: () => void;
}) {
  const incoming = snapshot.relations.filter((relation) => relation.target_id === entity.id);
  const outgoing = snapshot.relations.filter((relation) => relation.source_id === entity.id);
  const close = () => {
    onClose();
    queueMicrotask(() => restoreFocusTo?.focus());
  };
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && close()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-slate-950/45" />
        <DialogPrimitive.Content
          aria-describedby="detail-description"
          className="bg-background fixed right-0 bottom-0 left-0 z-50 max-h-[88svh] overflow-y-auto rounded-t-2xl p-4 shadow-2xl sm:top-1/2 sm:right-auto sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
        >
          <header className="mb-4 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <Badge variant="outline">{entity.kind}</Badge>
              <DialogPrimitive.Title className="mt-2 text-xl font-semibold">
                {entity.name}
              </DialogPrimitive.Title>
              <p className="text-muted-foreground break-all text-xs">{entity.id}</p>
            </div>
            <DialogPrimitive.Close asChild>
              <Button aria-label="Close details" size="icon" variant="ghost">
                <X aria-hidden="true" />
              </Button>
            </DialogPrimitive.Close>
          </header>
          <div className="space-y-5">
            <DialogPrimitive.Description id="detail-description" className="text-sm">
              {entity.summary || "No public summary."}
            </DialogPrimitive.Description>
            <div className="flex flex-wrap gap-2">
              <Badge variant={statusTone(entity.status)}>{entity.status ?? "unspecified"}</Badge>
              {entity.evidence_category && (
                <Badge variant="secondary">evidence: {entity.evidence_category}</Badge>
              )}
              {entity.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
            <section>
              <h3 className="mb-2 text-sm font-semibold">Assumptions</h3>
              {entity.assumptions.length ? (
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {entity.assumptions.map((assumption) => (
                    <li key={assumption}>{assumption}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">None exported for this item.</p>
              )}
            </section>
            <RelationList title="Incoming relations" relations={incoming} snapshot={snapshot} />
            <RelationList title="Outgoing relations" relations={outgoing} snapshot={snapshot} />
            <a
              className="text-primary inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
              href={entity.source_url}
              rel="noreferrer"
              target="_blank"
            >
              Open canonical source at exact commit
            </a>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default function App({ provided }: { provided?: SnapshotState }) {
  const live = useSnapshot();
  const result = provided ?? live;
  const [view, setView] = useState<View>("pulse");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<PublicEntity | null>(null);
  const [restoreFocusTo, setRestoreFocusTo] = useState<HTMLElement | null>(null);
  const selectEntity = (entity: PublicEntity) => {
    setRestoreFocusTo(
      document.activeElement instanceof HTMLElement ? document.activeElement : null,
    );
    setSelected(entity);
  };
  const statusOptions = useMemo(() => {
    if (!result.snapshot || view === "pulse") return [];
    return [
      ...new Set(
        result.snapshot.entities
          .filter((entity) => VIEW_KINDS[view].has(entity.kind))
          .map((entity) => entity.status)
          .filter((status): status is string => status !== null),
      ),
    ].sort();
  }, [result.snapshot, view]);

  return (
    <div className="pb-24">
      <StatusBanner
        result={result}
        onApply={provided ? () => undefined : live.applyUpdate}
        onRefresh={provided ? () => undefined : () => void live.refresh()}
      />
      <header className="mx-auto max-w-4xl px-4 pt-5 pb-4">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
          Semantic Systems
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Control Room</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Read-only{" "}
          {result.snapshot?.metadata.observation_source === "accepted_main"
            ? "accepted-main"
            : "committed local"}{" "}
          project projection
        </p>
      </header>
      <main className="mx-auto max-w-4xl px-4">
        {result.snapshot ? (
          <>
            {view !== "pulse" && (
              <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <label className="relative block">
                  <span className="sr-only">Search {view}</span>
                  <Search
                    aria-hidden="true"
                    className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
                  />
                  <Input
                    className="h-11 pl-9"
                    placeholder={`Search ${view}`}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <label>
                  <span className="sr-only">Filter {view} by status</span>
                  <select
                    aria-label={`Filter ${view} by status`}
                    className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-11 max-w-36 rounded-lg border px-3 text-sm focus-visible:ring-3"
                    value={statusFilter}
                    onChange={(event) => {
                      setStatusFilter(event.target.value);
                      setSelected(null);
                    }}
                  >
                    <option value="">All statuses</option>
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {view === "pulse" ? (
              <Pulse snapshot={result.snapshot} onSelect={selectEntity} />
            ) : (
              <>
                {view === "systems" && (
                  <ComponentTree snapshot={result.snapshot} onSelect={selectEntity} />
                )}
                <EntityList
                  snapshot={result.snapshot}
                  view={view}
                  query={query}
                  statusFilter={statusFilter}
                  onSelect={selectEntity}
                />
              </>
            )}
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <FileWarning aria-hidden="true" className="mx-auto mb-3 size-8" />
              <p className="font-semibold">{STATE_COPY[result.state].label}</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {result.detail ?? STATE_COPY[result.state].description}
              </p>
            </CardContent>
          </Card>
        )}
      </main>
      <nav
        aria-label="Control Room views"
        className="safe-bottom border-border bg-card/95 fixed inset-x-0 bottom-0 z-30 border-t px-1 pt-2 backdrop-blur"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {NAVIGATION.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[0.68rem] font-semibold ${
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
                type="button"
                onClick={() => {
                  setView(item.id);
                  setQuery("");
                  setStatusFilter("");
                  setSelected(null);
                }}
              >
                <Icon aria-hidden="true" className="size-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
      {selected && result.snapshot && (
        <Detail
          entity={selected}
          snapshot={result.snapshot}
          restoreFocusTo={restoreFocusTo}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
