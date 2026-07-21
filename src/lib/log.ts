/**
 * Minimal structured logger (SCH-31). Emits one JSON line per event so a coverage
 * request's whole lifecycle is greppable by `coverageRequestId` in Vercel logs.
 * The sink is injectable for tests. Errors still go to Sentry via the SDK; this is
 * the structured audit trail on top.
 */
type Sink = (line: string) => void;

let sink: Sink = (line) => console.log(line);

/** Override the output sink (tests). Returns a restore function. */
export function setLogSink(next: Sink): () => void {
  const previous = sink;
  sink = next;
  return () => {
    sink = previous;
  };
}

export function logEvent(event: string, fields: Record<string, unknown> = {}): void {
  sink(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}
