import type {
  AgentObservationNode,
  AgentObservationReport,
  CorrelationReference,
} from "../../../src/agent-observation/index.ts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const referenceVariant = (
  reference: CorrelationReference,
): "default" | "destructive" | "outline" | "secondary" => {
  if (reference.state === "matched") return "default";
  if (reference.state === "invalid_reference" || reference.state === "revision_mismatch") {
    return "destructive";
  }
  if (reference.state === "observed_only") return "secondary";
  return "outline";
};

const Reference = ({
  label,
  reference,
}: {
  readonly label: string;
  readonly reference: CorrelationReference;
}) => (
  <div className="grid min-w-0 gap-1">
    <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</dt>
    <dd className="m-0 flex min-w-0 flex-wrap items-center gap-2">
      <code>{reference.value ?? "unbound"}</code>
      <Badge variant={referenceVariant(reference)}>{reference.state.replaceAll("_", " ")}</Badge>
    </dd>
  </div>
);

const Observation = ({ node }: { readonly node: AgentObservationNode }) => (
  <li className="grid gap-3 border-l-2 border-border pl-3">
    <Card size="sm">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{node.kind.toLowerCase()}</Badge>
          <Badge variant={node.status.level === "ERROR" ? "destructive" : "secondary"}>
            {node.status.level.toLowerCase()}
          </Badge>
        </div>
        <CardTitle>{node.name}</CardTitle>
        <CardDescription>
          <code>{node.observation_id}</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Reference label="Project" reference={node.correlation.project} />
          <Reference label="Work" reference={node.correlation.work} />
          <Reference label="Attempt" reference={node.correlation.attempt} />
          <Reference label="Revision" reference={node.correlation.revision} />
        </dl>
        {node.correlation.evidence.length > 0 && (
          <div className="grid gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Observed evidence references
            </h3>
            <div className="flex flex-wrap gap-2">
              {node.correlation.evidence.map((reference) => (
                <span
                  className="flex items-center gap-2"
                  key={`${reference.value}:${reference.state}`}
                >
                  <code>{reference.value}</code>
                  <Badge variant={referenceVariant(reference)}>
                    {reference.state.replaceAll("_", " ")}
                  </Badge>
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    {node.children.length > 0 && (
      <ul className="grid gap-3" aria-label={`Children of ${node.name}`}>
        {node.children.map((child) => (
          <Observation key={child.observation_id} node={child} />
        ))}
      </ul>
    )}
  </li>
);

export default function AgentObservations({
  report,
}: {
  readonly report: AgentObservationReport | null;
}) {
  if (report === null) {
    return (
      <section aria-label="Agent observations">
        <Card>
          <CardHeader>
            <CardTitle>No bounded agent observation is loaded</CardTitle>
            <CardDescription>
              This projection never queries a vendor or changes canonical work state.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  return (
    <section className="grid gap-5" aria-label="Agent observations">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={report.capture_state === "complete" ? "default" : "outline"}>
              {report.capture_state}
            </Badge>
            <Badge variant="secondary">{report.source.vendor}</Badge>
          </div>
          <CardTitle className="font-serif text-2xl">Bounded agent trace</CardTitle>
          <CardDescription>
            Read-only correlation against the supplied portfolio snapshot. Observations do not grant
            authority or change work status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Trace
              </dt>
              <dd className="m-0">
                <code>{report.source.trace_id}</code>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Vendor project
              </dt>
              <dd className="m-0">
                <code>{report.source.vendor_project_id}</code>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Source digest
              </dt>
              <dd className="m-0">
                <code>{report.source.source_digest}</code>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Captured
              </dt>
              <dd className="m-0">{report.source.captured_at}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Rows
              </dt>
              <dd className="m-0">
                {report.source.observed_rows} observed / {report.source.row_limit} allowed
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Declared interval
              </dt>
              <dd className="m-0">
                {report.source.interval.start} → {report.source.interval.end}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <h2 className="font-serif text-xl text-foreground">Trace observations</h2>
        <ul className="grid gap-3" aria-label="Trace observations">
          {report.trace.roots.map((root) => (
            <Observation key={root.observation_id} node={root} />
          ))}
        </ul>
      </div>

      {report.diagnostics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Capture diagnostics</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2">
              {report.diagnostics.map((diagnostic) => (
                <li key={`${diagnostic.code}:${diagnostic.path}`}>
                  <Badge variant="outline">{diagnostic.code}</Badge> {diagnostic.message}{" "}
                  <code>{diagnostic.path}</code>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Unsupported claims</CardTitle>
          <CardDescription>
            These claims do not follow from this runtime observation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {report.unsupported_claims.map((claim) => (
              <li key={claim}>{claim}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
