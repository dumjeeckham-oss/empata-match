import type { ServiceUser, Worker } from "@/types";
import { buildSubstituteDataSnapshot, type SubstituteDataSnapshot } from "@/lib/substituteDataSource";

export type { SubstituteDataSnapshot, SubstituteDataWarning, SubstituteWorkerContact } from "@/lib/substituteDataSource";

/** 검색 화면과 향후 저장 Adapter가 공유할 읽기 전용 변환 경계 */
export function adaptSubstituteData(workers: Worker[], users: ServiceUser[]): SubstituteDataSnapshot {
  return buildSubstituteDataSnapshot(workers, users);
}
