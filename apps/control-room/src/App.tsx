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
          <p className="text-sm font-semibold">{copy.label}</p>
          <p className="text-muted-foreground truncate text-xs">{copy.description}</p>
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

function Pulse({ snapshot }: { snapshot: PublicSnapshot }) {
  const latest = snapshot.completed_work_ids.at(-1) ?? "None recorded";
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
            Exact accepted observation
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
          <div>
            <p className="text-muted-foreground text-xs">Latest completed feature</p>
            <p>{latest}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EntityList({
  snapshot,
  view,
  query,
  onSelect,
}: {
  snapshot: PublicSnapshot;
  view: Exclude<View, "pulse">;
  query: string;
  onSelect: (entity: PublicEntity) => void;
}) {
  const entities = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return snapshot.entities.filter(
      (entity) =>
        VIEW_KINDS[view].has(entity.kind) &&
        (!needle ||
          `${entity.id} ${entity.name} ${entity.summary} ${entity.kind} ${entity.status ?? ""}`
            .toLowerCase()
            .includes(needle)),
    );
  }, [query, snapshot, view]);

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
          <span className="text-muted-foreground mt-2 line-clamp-2 block text-sm">
            {entity.summary || "No public summary."}
          </span>
          <span className="mt-2 block text-xs font-medium">{entity.kind.replaceAll("_", " ")}</span>
        </button>
      ))}
      {entities.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            No items match this view and search.
          </CardContent>
        </Card>
      )}
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
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">
        {title} ({relations.length})
      </h3>
      <ul className="space-y-2">
        {relations.map((relation) => (
          <li
            key={`${relation.source_id}:${relation.kind}:${relation.target_id}`}
            className="bg-muted/70 rounded-lg p-2 text-sm"
          >
            <Badge variant="outline">{relation.kind}</Badge>
            <p className="mt-1">
              {names.get(relation.source_id)} → {names.get(relation.target_id)}
            </p>
            {relation.summary && (
              <p className="text-muted-foreground mt-1 text-xs">{relation.summary}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Detail({
  entity,
  snapshot,
  onClose,
}: {
  entity: PublicEntity;
  snapshot: PublicSnapshot;
  onClose: () => void;
}) {
  const incoming = snapshot.relations.filter((relation) => relation.target_id === entity.id);
  const outgoing = snapshot.relations.filter((relation) => relation.source_id === entity.id);
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-slate-950/45 sm:items-center sm:justify-center">
      <article
        aria-labelledby="detail-title"
        aria-modal="true"
        role="dialog"
        className="bg-background max-h-[88svh] w-full overflow-y-auto rounded-t-2xl p-4 shadow-2xl sm:max-w-lg sm:rounded-2xl"
      >
        <header className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <Badge variant="outline">{entity.kind}</Badge>
            <h2 id="detail-title" className="mt-2 text-xl font-semibold">
              {entity.name}
            </h2>
            <p className="text-muted-foreground break-all text-xs">{entity.id}</p>
          </div>
          <Button aria-label="Close details" size="icon" variant="ghost" onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        </header>
        <div className="space-y-5">
          <p className="text-sm">{entity.summary || "No public summary."}</p>
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
      </article>
    </div>
  );
}

export default function App({ provided }: { provided?: SnapshotState }) {
  const live = useSnapshot();
  const result = provided ?? live;
  const [view, setView] = useState<View>("pulse");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PublicEntity | null>(null);

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
          Read-only accepted-commit project projection
        </p>
      </header>
      <main className="mx-auto max-w-4xl px-4">
        {result.snapshot ? (
          <>
            {view !== "pulse" && (
              <label className="relative mb-4 block">
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
            )}
            {view === "pulse" ? (
              <Pulse snapshot={result.snapshot} />
            ) : (
              <EntityList
                snapshot={result.snapshot}
                view={view}
                query={query}
                onSelect={setSelected}
              />
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
        <Detail entity={selected} snapshot={result.snapshot} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
