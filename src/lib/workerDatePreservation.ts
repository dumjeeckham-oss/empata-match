export function preserveWorkerDateOnStatusChange(
  current: string | undefined | null,
  previous: string | undefined | null,
  statusChanged: boolean,
): string {
  return statusChanged && !String(current || "").trim() ? String(previous || "") : String(current || "");
}
