import { useMachine } from "@xstate/react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { controlRoomMachine, type ControlRoomScope } from "./control-room-machine.ts";
import type { DataState, PublicEntity, PublicSnapshot, SnapshotState } from "./model.ts";
import Portfolio from "./Portfolio.tsx";
import type { PortfolioState } from "./portfolio-snapshot.ts";
import { useSnapshot } from "./use-snapshot.ts";

type View = "pulse" | "systems" | "semantics" | "evidence" | "work";

const VIEWS: ReadonlyArray<{ readonly id: View; readonly label: string; readonly glyph: string }> =
  [
    { id: "pulse", label: "Pulse", glyph: "◉" },
    { id: "systems", label: "Systems", glyph: "⬡" },
    { id: "semantics", label: "Semantics", glyph: "◇" },
    { id: "evidence", label: "Evidence", glyph: "✓" },
    { id: "work", label: "Work", glyph: "↗" },
  ];

const VIEW_KINDS: Record<Exclude<View, "pulse">, ReadonlySet<string>> = {
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

const STATE_COPY: Record<DataState, { readonly label: string; readonly detail: string }> = {
  current: { label: "Current", detail: "Digest-valid observation within its freshness window." },
  update_available: {
    label: "Update available",
    detail: "A newer digest-valid snapshot is ready for explicit activation.",
  },
  stale: { label: "Stale", detail: "Using the last valid snapshot beyond its freshness window." },
  offline: {
    label: "Offline",
    detail: "Using the last valid snapshot while the network is offline.",
  },
  invalid: {
    label: "Invalid update rejected",
    detail: "The candidate failed schema, provenance, or digest validation.",
  },
  unavailable: {
    label: "Unavailable",
    detail: "No valid snapshot is available from this origin.",
  },
  loading: { label: "Loading", detail: "Validating a content-addressed project observation." },
};

const sourceLabel = (source: PublicSnapshot["metadata"]["observation_source"]): string => {
  if (source === "main_ci_assertion") return "Main CI assertion";
  if (source === "pr_ci_assertion") return "PR CI assertion";
  return "Local preview";
};

const statusClass = (status: string | null): string => {
  if (["accepted", "complete", "completed", "passing", "ready"].includes(status ?? "")) {
    return "badge badge-good";
  }
  if (["blocked", "failed", "rejected"].includes(status ?? "")) return "badge badge-bad";
  return "badge";
};

const EntityButton = ({
  entity,
  onSelect,
}: {
  readonly entity: PublicEntity;
  readonly onSelect: (entity: PublicEntity) => void;
}) => (
  <button className="entity-card" type="button" onClick={() => onSelect(entity)}>
    <span className="entity-card-top">
      <span className="kind">{entity.kind.replaceAll("_", " ")}</span>
      <span className={statusClass(entity.status)}>{entity.status ?? "unspecified"}</span>
    </span>
    <strong>{entity.name}</strong>
    <span className="summary">{entity.summary || "No public summary."}</span>
    <code>{entity.id}</code>
  </button>
);

const IdentityList = ({
  title,
  ids,
  snapshot,
  onSelect,
}: {
  readonly title: string;
  readonly ids: ReadonlyArray<string>;
  readonly snapshot: PublicSnapshot;
  readonly onSelect: (entity: PublicEntity) => void;
}) => {
  const entities = new Map(snapshot.entities.map((entity) => [entity.id, entity]));
  return (
    <section className="pulse-section">
      <h2>
        {title} <span>{ids.length}</span>
      </h2>
      {ids.length === 0 ? (
        <p className="empty">No canonical identities in this projection.</p>
      ) : (
        <div className="compact-grid">
          {ids.map((id) => {
            const entity = entities.get(id);
            return entity === undefined ? (
              <code key={id}>{id}</code>
            ) : (
              <EntityButton key={id} entity={entity} onSelect={onSelect} />
            );
          })}
        </div>
      )}
    </section>
  );
};

const Pulse = ({
  snapshot,
  onSelect,
}: {
  readonly snapshot: PublicSnapshot;
  readonly onSelect: (entity: PublicEntity) => void;
}) => (
  <div className="stack">
    <section className="hero-card">
      <div>
        <p className="eyebrow">Observed projection</p>
        <h2>{sourceLabel(snapshot.metadata.observation_source)}</h2>
        <p>
          Publisher assertion only. Deployment success, branch protection, and served-origin
          identity are not inferred.
        </p>
      </div>
      <dl className="provenance">
        <div>
          <dt>Commit</dt>
          <dd>
            <code>{snapshot.metadata.commit}</code>
          </dd>
        </div>
        <div>
          <dt>Snapshot digest</dt>
          <dd>
            <code>{snapshot.metadata.digest}</code>
          </dd>
        </div>
        <div>
          <dt>Observed</dt>
          <dd>{snapshot.metadata.observed_at}</dd>
        </div>
        <div>
          <dt>Deployment check</dt>
          <dd>{snapshot.metadata.deployed_check_status.replaceAll("_", " ")}</dd>
        </div>
      </dl>
    </section>
    <section className="metric-grid" aria-label="Projection counts">
      {Object.entries(snapshot.counts_by_kind).map(([kind, count]) => (
        <div className="metric" key={kind}>
          <strong>{count}</strong>
          <span>{kind.replaceAll("_", " ")}</span>
        </div>
      ))}
    </section>
    <IdentityList
      title="Ready frontier"
      ids={snapshot.ready_work_ids}
      snapshot={snapshot}
      onSelect={onSelect}
    />
    <IdentityList
      title="Active work"
      ids={snapshot.active_work_ids}
      snapshot={snapshot}
      onSelect={onSelect}
    />
    <IdentityList
      title="Blocked work"
      ids={snapshot.blocked_work_ids}
      snapshot={snapshot}
      onSelect={onSelect}
    />
    <IdentityList
      title="Completed work"
      ids={snapshot.completed_work_ids}
      snapshot={snapshot}
      onSelect={onSelect}
    />
    <IdentityList
      title="Unsupported claims"
      ids={snapshot.unsupported_claim_ids}
      snapshot={snapshot}
      onSelect={onSelect}
    />
  </div>
);

const EntityView = ({
  view,
  snapshot,
  query,
  status,
  onSelect,
}: {
  readonly view: Exclude<View, "pulse">;
  readonly snapshot: PublicSnapshot;
  readonly query: string;
  readonly status: string;
  readonly onSelect: (entity: PublicEntity) => void;
}) => {
  const terms = query.trim().toLowerCase();
  const visible = snapshot.entities.filter(
    (entity) =>
      VIEW_KINDS[view].has(entity.kind) &&
      (status === "" || entity.status === status) &&
      (terms === "" ||
        [entity.id, entity.name, entity.summary, entity.kind, ...entity.tags]
          .join(" ")
          .toLowerCase()
          .includes(terms)),
  );
  return (
    <section aria-label={`${view} entities`}>
      <p className="result-count">
        {visible.length} {view} {visible.length === 1 ? "record" : "records"}
      </p>
      <div className="entity-grid">
        {visible.map((entity) => (
          <EntityButton key={entity.id} entity={entity} onSelect={onSelect} />
        ))}
      </div>
      {visible.length === 0 && <p className="empty panel">No records match this query.</p>}
    </section>
  );
};

const WorkFrontier = ({
  snapshot,
  onSelect,
}: {
  readonly snapshot: PublicSnapshot;
  readonly onSelect: (entity: PublicEntity) => void;
}) => (
  <section className="frontier" aria-label="Canonical work frontier">
    <p>
      Ready and blocked identities are scheduler-derived in the public exporter. This view does not
      infer readiness.
    </p>
    <div className="frontier-columns">
      <IdentityList
        title="Ready frontier"
        ids={snapshot.ready_work_ids}
        snapshot={snapshot}
        onSelect={onSelect}
      />
      <IdentityList
        title="Scheduler-blocked work"
        ids={snapshot.blocked_work_ids}
        snapshot={snapshot}
        onSelect={onSelect}
      />
    </div>
  </section>
);

const Detail = ({
  entity,
  snapshot,
  onClose,
}: {
  readonly entity: PublicEntity;
  readonly snapshot: PublicSnapshot;
  readonly onClose: () => void;
}) => {
  const relations = snapshot.relations.filter(
    (relation) => relation.source_id === entity.id || relation.target_id === entity.id,
  );
  const names = new Map(snapshot.entities.map((item) => [item.id, item.name]));
  return (
    <div className="dialog-backdrop">
      <dialog open aria-describedby="entity-detail-summary" aria-modal="true" className="detail">
        <header>
          <div>
            <span className="kind">{entity.kind.replaceAll("_", " ")}</span>
            <h2>{entity.name}</h2>
            <code>{entity.id}</code>
          </div>
          <button aria-label="Close details" className="close" type="button" onClick={onClose}>
            ×
          </button>
        </header>
        <p id="entity-detail-summary">{entity.summary || "No public summary."}</p>
        <div className="tags">
          <span className={statusClass(entity.status)}>{entity.status ?? "unspecified"}</span>
          {entity.evidence_category !== null && (
            <span className="badge">evidence: {entity.evidence_category}</span>
          )}
          {entity.tags.map((tag) => (
            <span className="badge" key={tag}>
              {tag}
            </span>
          ))}
        </div>
        <h3>Assumptions</h3>
        {entity.assumptions.length === 0 ? (
          <p className="empty">None exported for this record.</p>
        ) : (
          <ul>
            {entity.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        )}
        <h3>Typed relations</h3>
        {relations.length === 0 ? (
          <p className="empty">No public relations.</p>
        ) : (
          <ul className="relations">
            {relations.map((relation) => (
              <li key={`${relation.source_id}:${relation.kind}:${relation.target_id}`}>
                <span className="kind">{relation.kind.replaceAll("_", " ")}</span>
                <p>
                  {names.get(relation.source_id) ?? relation.source_id} →{" "}
                  {names.get(relation.target_id) ?? relation.target_id}
                </p>
                <code>
                  {relation.source_id} → {relation.target_id}
                </code>
                {relation.summary !== "" && <p>{relation.summary}</p>}
                <a href={relation.source_url} rel="noreferrer" target="_blank">
                  Open relation source at exact commit
                </a>
              </li>
            ))}
          </ul>
        )}
        <a className="source-link" href={entity.source_url} rel="noreferrer" target="_blank">
          Open canonical source at exact commit
        </a>
      </dialog>
    </div>
  );
};

const StatusBanner = ({
  result,
  onRefresh,
  onApply,
}: {
  readonly result: SnapshotState;
  readonly onRefresh: () => void;
  readonly onApply: () => void;
}) => {
  const copy = STATE_COPY[result.state];
  return (
    <aside className={`status-banner status-${result.state}`} aria-live="polite">
      <div>
        <strong>{copy.label}</strong>
        <span>
          {copy.detail}
          {result.detail === undefined ? "" : ` ${result.detail}`}
        </span>
      </div>
      <div className="status-actions">
        {result.pending !== null && (
          <button type="button" onClick={onApply}>
            Apply
          </button>
        )}
        <button aria-label="Refresh snapshot" type="button" onClick={onRefresh}>
          Refresh
        </button>
      </div>
    </aside>
  );
};

const SemanticRoom = ({
  provided,
  scopeControls,
}: {
  readonly provided?: SnapshotState;
  readonly scopeControls: ReactNode;
}) => {
  const live = useSnapshot();
  const result = provided ?? live;
  const [view, setView] = useState<View>("pulse");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<PublicEntity | null>(null);
  const statuses =
    result.snapshot === null || view === "pulse"
      ? []
      : [
          ...new Set(
            result.snapshot.entities
              .filter((entity) => VIEW_KINDS[view].has(entity.kind))
              .flatMap((entity) => (entity.status === null ? [] : [entity.status])),
          ),
        ].sort();

  return (
    <div className="app-shell semantic-room">
      <StatusBanner
        result={result}
        onApply={provided === undefined ? live.applyUpdate : () => undefined}
        onRefresh={provided === undefined ? () => void live.refresh() : () => undefined}
      />
      <header className="masthead">
        {scopeControls}
        <p className="eyebrow">Semantic Systems</p>
        <h1>Control Room</h1>
        <p>Read-only views over a digest-valid, provenance-linked public projection.</p>
      </header>
      <main>
        {result.snapshot === null ? (
          <section className="panel unavailable">
            <span aria-hidden="true">◇</span>
            <h2>{STATE_COPY[result.state].label}</h2>
            <p>{result.detail ?? STATE_COPY[result.state].detail}</p>
          </section>
        ) : (
          <>
            {view !== "pulse" && (
              <section className="query-bar" aria-label={`${view} queries`}>
                <label>
                  <span>Search {view}</span>
                  <input
                    aria-label={`Search ${view}`}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <label>
                  <span>Status</span>
                  <select
                    aria-label={`Filter ${view} by status`}
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                  >
                    <option value="">All</option>
                    {statuses.map((item) => (
                      <option key={item} value={item}>
                        {item.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
              </section>
            )}
            {view === "pulse" ? (
              <Pulse snapshot={result.snapshot} onSelect={setSelected} />
            ) : (
              <>
                {view === "work" && (
                  <WorkFrontier snapshot={result.snapshot} onSelect={setSelected} />
                )}
                <EntityView
                  view={view}
                  snapshot={result.snapshot}
                  query={query}
                  status={status}
                  onSelect={setSelected}
                />
              </>
            )}
          </>
        )}
      </main>
      <nav aria-label="Control Room views">
        {VIEWS.map((item) => (
          <button
            aria-current={view === item.id ? "page" : undefined}
            key={item.id}
            type="button"
            onClick={() => {
              setView(item.id);
              setQuery("");
              setStatus("");
              setSelected(null);
            }}
          >
            <span aria-hidden="true">{item.glyph}</span>
            {item.label}
          </button>
        ))}
      </nav>
      {selected !== null && result.snapshot !== null && (
        <Detail entity={selected} snapshot={result.snapshot} onClose={() => setSelected(null)} />
      )}
    </div>
  );
};

const ScopeSwitch = ({
  scope,
  onChange,
}: {
  readonly scope: ControlRoomScope;
  readonly onChange: (scope: ControlRoomScope) => void;
}) => (
  <div className="flex w-fit gap-1 rounded-lg bg-muted p-1" aria-label="Control Room scope">
    <Button
      aria-pressed={scope === "portfolio"}
      size="sm"
      type="button"
      variant={scope === "portfolio" ? "default" : "ghost"}
      onClick={() => onChange("portfolio")}
    >
      PBK Technologies
    </Button>
    <Button
      aria-pressed={scope === "semantic"}
      size="sm"
      type="button"
      variant={scope === "semantic" ? "default" : "ghost"}
      onClick={() => onChange("semantic")}
    >
      Semantic Systems
    </Button>
  </div>
);

export default function App({
  provided,
  providedPortfolio,
  initialScope,
}: {
  readonly provided?: SnapshotState;
  readonly providedPortfolio?: PortfolioState;
  readonly initialScope?: ControlRoomScope;
}) {
  const [shell, send] = useMachine(controlRoomMachine, {
    input: { scope: initialScope ?? (provided === undefined ? "portfolio" : "semantic") },
  });
  const scope: ControlRoomScope = shell.matches("portfolio") ? "portfolio" : "semantic";
  const controls = (
    <ScopeSwitch
      scope={scope}
      onChange={(next) =>
        send(next === "portfolio" ? { type: "scope.portfolio" } : { type: "scope.semantic" })
      }
    />
  );
  return scope === "portfolio" ? (
    <div className="app-shell">
      <Portfolio
        {...(providedPortfolio === undefined ? {} : { provided: providedPortfolio })}
        scopeControls={controls}
      />
    </div>
  ) : (
    <SemanticRoom {...(provided === undefined ? {} : { provided })} scopeControls={controls} />
  );
}
