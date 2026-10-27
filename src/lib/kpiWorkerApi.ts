import { auth } from "@/lib/firebase";

export const KPI_WORKER_ORIGIN = import.meta.env.VITE_KPI_API_BASE || (import.meta.env.DEV ? "/kpi-api" : "https://dongbaek-kpi-supervision-staging.dong100center.workers.dev");
export type KpiWorkerUser = { userId: string; role: "director" | "staff" };
export type KpiInput = { id: string; kpiCode: string; evaluationPeriodId: string; targetMonth: string; scopeType: "CENTER" | "STAFF"; performanceOwnerId: string | null; enteredBy: string; inputMode: string; evidenceStatus: string; status: string; version: number; input: Record<string, unknown> };
export type KpiAnalysis = KpiInput & { inputRecordId: string; formulaApproval: string; determination: string; state: string; reason?: string };
export type KpiRequirement = { id: string; evaluationPeriodId: string; kpiCode: string; scopeType: "CENTER" | "STAFF"; performanceOwnerId: string | null; cadence: string; dueAt: string; requirementStatus: string };
export type SupervisionRecord = { id: string; staff_user_id: string; plan_year: number; session_date: string; topic: string; status: string; version: number };
export class KpiWorkerError extends Error { constructor(public readonly status: number, public readonly code: string) { super(code); this.name = "KpiWorkerError"; } }

async function request<T>(path: string): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new KpiWorkerError(401, "AUTHENTICATION_REQUIRED");
  const token = await user.getIdToken();
  const response = await fetch(`${KPI_WORKER_ORIGIN}${path}`, { headers: { Authorization: `Bearer ${token}` }, credentials: "omit" });
  const body = await response.json().catch(() => ({})) as { data?: T; error?: string };
  if (!response.ok || body.data === undefined) throw new KpiWorkerError(response.status, body.error ?? "KPI_WORKER_REQUEST_FAILED");
  return body.data;
}

export const fetchKpiWorkerUser = () => request<KpiWorkerUser>("/api/auth/me");
export const fetchKpiInputs = (period = "2027") => request<KpiInput[]>(`/api/kpi/inputs?evaluationPeriodId=${encodeURIComponent(period)}`);
export const fetchKpiAnalysis = (period = "2027") => request<KpiAnalysis[]>(`/api/kpi/analysis?evaluationPeriodId=${encodeURIComponent(period)}`);
export const fetchKpiRequirements = (period = "2027") => request<KpiRequirement[]>(`/api/kpi/requirements?evaluationPeriodId=${encodeURIComponent(period)}`);
export const fetchSupervision = (year = "2027") => request<SupervisionRecord[]>(`/api/supervision?year=${encodeURIComponent(year)}`);
