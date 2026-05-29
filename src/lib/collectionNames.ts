/**
 * Firestore 컬렉션 이름을 프로젝트 전체에서 단일 소스로 관리합니다.
 * (단수형 user/worker 오타로 인해 저장/조회가 분리되는 사고를 방지)
 */
export const USERS_COLLECTION = "users" as const;
export const WORKERS_COLLECTION = "workers" as const;

export type CoreCollectionName = typeof USERS_COLLECTION | typeof WORKERS_COLLECTION;

