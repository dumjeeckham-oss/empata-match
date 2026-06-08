import * as XLSX from "xlsx";
import type { ServiceUser, Worker } from "@/types";
import { auth, db, collection, doc, writeBatch, Timestamp } from "@/lib/firebase";
import { USERS_COLLECTION, WORKERS_COLLECTION } from "@/lib/collectionNames";

const FIRESTORE_BATCH_LIMIT = 500;

export function safeStr(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

export function normalizePhone(phone: unknown): string {
  return String(phone || "").replace(/\D/g, "");
}

export function makeUniqueKey(name: unknown, phone: unknown): string {
  return `${String(name || "").trim()}::${normalizePhone(phone)}`;
}

export type FieldKey =
  | "name"
  | "gender"
  | "phone"
  | "age"
  | "disabilityType"
  | "voucherTier"
  | "requiredDays"
  | "requiredHours"
  | "supportTypes"
  | "environmentTags"
  | "familyMembers"
  | "address"
  | "preferredWorkerTraits"
  | "contractStatus"
  | "serviceStartDate"
  | "guardianName"
  | "guardianRelation"
  | "guardianPhone"
  | "notes"
  | "terminationReason"
  | "assignedHelperName"
  | "assignedHelperPhone"
  | "assignedUserName"
  | "assignedUserPhone"
  | "residenceArea"
  | "preferredArea"
  | "experience"
  | "availableDays"
  | "availableHours"
  | "rejectionTypes"
  | "rejectedTasks"
  | "canDrive"
  | "animalAllergy"
  | "certificateNumber"
  | "resignationDate";

const HEADER_RULES: { field: FieldKey; patterns: RegExp[] }[] = [
  { field: "name", patterns: [/이름/, /성명/, /^name$/i, /이용자/, /지원사명/, /성명\(한글\)/] },
  { field: "gender", patterns: [/성별/, /구분/, /^sex$/i, /^gender$/i, /txtUSex/i, /txtHSex/i] },
  { field: "phone", patterns: [/연락처/, /전화/, /휴대폰/, /^hp$/i, /^phone$/i, /txtUPhone/i, /txtHPhone/i, /핸드폰/, /휴대전화/] },
  { field: "age", patterns: [/나이/, /연령/, /^age$/i, /출생/] },
  { field: "disabilityType", patterns: [/장애/, /장애유형/] },
  { field: "voucherTier", patterns: [/바우처/, /구간/] },
  { field: "requiredDays", patterns: [/필요요일/, /서비스요일/, /이용요일/] },
  { field: "requiredHours", patterns: [/필요시간/, /서비스시간/, /이용시간/] },
  { field: "supportTypes", patterns: [/지원유형/, /지원형태/] },
  { field: "environmentTags", patterns: [/환경/, /환경태그/] },
  { field: "familyMembers", patterns: [/가족/] },
  { field: "address", patterns: [/주소/, /거주지/, /^address$/i] },
  { field: "preferredWorkerTraits", patterns: [/선호/, /선호도/] },
  { field: "contractStatus", patterns: [/계약상태/, /서비스상태/, /이용상태/, /근무상태/, /^상태$/] },
  { field: "serviceStartDate", patterns: [/최초서비스/, /최초근무일/, /서비스시작/, /근무시작/, /입사일/, /서비스제공/] },
  { field: "guardianName", patterns: [/보호자이름/, /보호자명/, /보호자\s*이름/] },
  { field: "guardianRelation", patterns: [/보호자관계/, /보호자\s*관계/] },
  { field: "guardianPhone", patterns: [/보호자연락/, /보호자\s*연락/, /보호자전화/] },
  { field: "notes", patterns: [/비고/, /메모/, /^note/i] },
  { field: "terminationReason", patterns: [/중단/, /중단사유/, /txtUMemostop/i, /해지사유/, /종료사유/] },
  { field: "assignedHelperName", patterns: [/담당.*지원사/, /활동지원사.*이름/, /매칭.*이름/, /담당자/, /assigned_workers/i, /assignedHelpers?/i] },
  { field: "assignedHelperPhone", patterns: [/담당.*연락/, /활동지원사.*연락/, /매칭.*연락/] },
  { field: "assignedUserName", patterns: [/담당.*이용자/, /이용자.*이름/, /매칭.*이용자/, /담당대상/, /assigned_users/i, /assignedUsers?/i] },
  { field: "assignedUserPhone", patterns: [/담당.*이용자.*연락/, /이용자.*연락/] },
  { field: "residenceArea", patterns: [/거주지역/, /거주지역/] },
  { field: "preferredArea", patterns: [/희망지역/, /근무희망/] },
  { field: "experience", patterns: [/경력/] },
  { field: "availableDays", patterns: [/근무가능요일/, /가능요일/, /근무요일/] },
  { field: "availableHours", patterns: [/근무가능시간/, /가능시간/, /근무시간/] },
  { field: "rejectionTypes", patterns: [/거부업무(?!상세)/, /거부.*유형/] },
  { field: "rejectedTasks", patterns: [/거부업무상세/, /거부.*상세/] },
  { field: "canDrive", patterns: [/운전/] },
  { field: "animalAllergy", patterns: [/동물/, /알러지/, /알레르기/] },
  { field: "certificateNumber", patterns: [/이수증/] },
  { field: "resignationDate", patterns: [/퇴사일/, /퇴사/] },
];

export interface ParsedSheet {
  headers: string[];
  rows: string[][];
}

function padRow(row: string[], length: number): string[] {
  const padded = [...row];
  while (padded.length < length) padded.push("");
  return padded.slice(0, length);
}

function sheetFromMatrix(matrix: string[][]): ParsedSheet {
  const nonEmpty = matrix.filter((row) => row.some((cell) => String(cell || "").trim()));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map((h) => String(h || "").trim());
  const rows = nonEmpty.slice(1).map((row) => padRow(row.map(safeStr), headers.length));
  return { headers, rows };
}

export async function parseSpreadsheetFile(file: File): Promise<ParsedSheet> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const stringMatrix = matrix.map((row) => {
    const cells = Array.isArray(row) ? row : [row];
    return cells.map(safeStr);
  });

  return sheetFromMatrix(stringMatrix);
}

export function parsePasteData(paste: string): ParsedSheet {
  const lines = String(paste || "").trim().split(/\r?\n/);
  const matrix = lines.map((line) => line.split("\t").map(safeStr));
  return sheetFromMatrix(matrix);
}

export function buildHeaderMap(headers: string[]): Map<FieldKey, number> {
  const map = new Map<FieldKey, number>();
  headers.forEach((header, idx) => {
    const trimmed = String(header || "").trim();
    const compact = trimmed.toLowerCase().replace(/\s/g, "");
    for (const rule of HEADER_RULES) {
      if (map.has(rule.field)) continue;
      const matched = rule.patterns.some(
        (p) => p.test(trimmed) || p.test(compact) || p.test(String(header || ""))
      );
      if (matched) map.set(rule.field, idx);
    }
  });
  return map;
}

export function getCell(
  row: string[],
  headerMap: Map<FieldKey, number>,
  field: FieldKey,
  fallback = ""
): string {
  const idx = headerMap.get(field);
  if (idx === undefined) return fallback;
  return safeStr(row[idx] ?? fallback);
}

export function splitList(val: string): string[] {
  if (!val) return [];
  return val.split(/[,\uFF0C\u3001/]/).map((s) => String(s || "").trim()).filter(Boolean);
}

/**
 * 엑셀 셀의 날짜값(시리얼 숫자/다양한 문자열 포맷)을 YYYY-MM-DD 문자열로 정규화.
 * 비어있거나 파싱 실패 시 원본 문자열(혹은 "")을 반환해 데이터 손실을 막는다.
 */
export function normalizeDateCell(val: unknown): string {
  const raw = String(val ?? "").trim();
  if (!raw) return "";

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Excel serial number (1900 date system)
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
      const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
      if (!Number.isNaN(date.getTime())) {
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, "0");
        const d = String(date.getUTCDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
    }
  }

  const compact = raw.match(/^(\d{4})[./\s](\d{1,2})[./\s](\d{1,2})$/);
  if (compact) {
    const [, y, m, d] = compact;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return raw;
}

function parseYesNo(val: unknown): boolean {
  const v = String(val || "").trim().toLowerCase();
  return v === "예" || v === "y" || v === "yes" || v === "true" || v === "1" || v === "o";
}

function resolveWorker(
  workers: (Worker & { id: string })[],
  name: string,
  phone: string
): { id: string; name: string; phone: string } | null {
  const normPhone = normalizePhone(phone);
  if (normPhone) {
    const byPhone = workers.find((w) => normalizePhone(w.phone) === normPhone);
    if (byPhone) return { id: byPhone.id, name: byPhone.name, phone: byPhone.phone };
  }
  if (name) {
    const byName = workers.find(
      (w) =>
        String(w?.name || "").trim() === String(name || "").trim() &&
        (!normPhone || normalizePhone(w?.phone) === normPhone)
    );
    if (byName) return { id: byName.id, name: byName.name, phone: byName.phone };
  }
  return null;
}

function resolveMultipleWorkers(
  workers: (Worker & { id: string })[],
  namesRaw: string,
  phonesRaw: string
): { ids: string[]; names: string[]; phones: string[] } {
  const names = splitList(namesRaw);
  const phones = splitList(phonesRaw);
  const ids: string[] = [];
  const resolvedNames: string[] = [];
  const resolvedPhones: string[] = [];

  if (names.length === 0 && phones.length === 0) {
    return { ids, names: resolvedNames, phones: resolvedPhones };
  }

  const count = Math.max(names.length, phones.length, 1);
  for (let i = 0; i < count; i++) {
    const name = names[i] ?? names[0] ?? "";
    const phone = phones[i] ?? phones[0] ?? "";
    if (!name && !phone) continue;
    const matched = resolveWorker(workers, name, phone);
    if (matched?.id) {
      if (!ids.includes(matched.id)) {
        ids.push(matched.id);
        resolvedNames.push(matched.name);
        resolvedPhones.push(matched.phone);
      }
    } else if (name) {
      resolvedNames.push(name);
      resolvedPhones.push(phone);
    }
  }

  return { ids, names: resolvedNames, phones: resolvedPhones };
}

function resolveMultipleUsers(
  users: (ServiceUser & { id: string })[],
  namesRaw: string,
  phonesRaw: string
): { ids: string[]; names: string[]; phones: string[] } {
  const names = splitList(namesRaw);
  const phones = splitList(phonesRaw);
  const ids: string[] = [];
  const resolvedNames: string[] = [];
  const resolvedPhones: string[] = [];

  if (names.length === 0 && phones.length === 0) {
    return { ids, names: resolvedNames, phones: resolvedPhones };
  }

  const count = Math.max(names.length, phones.length, 1);
  for (let i = 0; i < count; i++) {
    const name = names[i] ?? names[0] ?? "";
    const phone = phones[i] ?? phones[0] ?? "";
    if (!name && !phone) continue;
    const normPhone = normalizePhone(phone);
    let matched: (ServiceUser & { id: string }) | undefined;
    if (normPhone) {
      matched = users.find((u) => normalizePhone(u.phone) === normPhone);
    }
    if (!matched && name) {
      matched = users.find(
        (u) => String(u?.name || "").trim() === String(name || "").trim() && (!normPhone || normalizePhone(u?.phone) === normPhone)
      );
    }
    if (matched?.id) {
      if (!ids.includes(matched.id)) {
        ids.push(matched.id);
        resolvedNames.push(matched.name);
        resolvedPhones.push(matched.phone);
      }
    } else if (name) {
      resolvedNames.push(name);
      resolvedPhones.push(phone);
    }
  }

  return { ids, names: resolvedNames, phones: resolvedPhones };
}

/** 행마다 독립적인 깊은 복사 객체 생성 */
function cloneRowEntity<T extends Record<string, unknown>>(entity: T): T {
  return JSON.parse(JSON.stringify(entity)) as T;
}

/** Each call returns a fresh object — safe for row-by-row bulk insert. */
export function rowToServiceUser(
  row: string[],
  headerMap: Map<FieldKey, number>,
  workers: (Worker & { id: string })[] = []
): Omit<ServiceUser, "id" | "createdAt" | "updatedAt"> {
  const helpers = resolveMultipleWorkers(
    workers,
    getCell(row, headerMap, "assignedHelperName"),
    getCell(row, headerMap, "assignedHelperPhone")
  );

  const gender = getCell(row, headerMap, "gender") || "남성";
  const terminationReason = getCell(row, headerMap, "terminationReason");

  return {
    name: getCell(row, headerMap, "name"),
    age: Number(getCell(row, headerMap, "age")) || 0,
    gender,
    txtUSex: gender,
    phone: getCell(row, headerMap, "phone"),
    disabilityType: getCell(row, headerMap, "disabilityType"),
    voucherTier: Number(getCell(row, headerMap, "voucherTier")) || 1,
    requiredDays: getCell(row, headerMap, "requiredDays"),
    requiredHours: getCell(row, headerMap, "requiredHours"),
    supportTypes: splitList(getCell(row, headerMap, "supportTypes")),
    environmentTags: splitList(getCell(row, headerMap, "environmentTags")),
    familyMembers: getCell(row, headerMap, "familyMembers"),
    address: getCell(row, headerMap, "address"),
    preferredWorkerTraits: getCell(row, headerMap, "preferredWorkerTraits"),
    notes: getCell(row, headerMap, "notes"),
    contractStatus: ((): ServiceUser["contractStatus"] => {
      // 중단사유(종결/해지)가 들어오면 상태는 무조건 계약해지로 처리
      if (terminationReason.trim()) return "계약해지";
      const raw = String(getCell(row, headerMap, "contractStatus") || "").trim();
      if (raw === "계약해지" || raw === "해지" || raw === "종결") return "계약해지";
      if (raw === "대기") return "대기";
      // 비어있거나 "서비스중"/기타 알 수 없는 값 → 기본 "서비스중"
      return "서비스중";
    })(),
    serviceStartDate: getCell(row, headerMap, "serviceStartDate"),
    guardianName: getCell(row, headerMap, "guardianName"),
    guardianRelation: getCell(row, headerMap, "guardianRelation"),
    guardianPhone: getCell(row, headerMap, "guardianPhone"),
    terminationReason,
    txtUMemostop: terminationReason,
    assigned_workers: [...helpers.ids],
    assignedHelperIds: [...helpers.ids],
    assignedHelperNames: [...helpers.names],
    assignedHelperPhones: [...helpers.phones],
  };
}

/** Each call returns a fresh object — safe for row-by-row bulk insert. */
export function rowToWorker(
  row: string[],
  headerMap: Map<FieldKey, number>,
  users: (ServiceUser & { id: string })[] = []
): Omit<Worker, "id" | "createdAt" | "updatedAt"> {
  const assigned = resolveMultipleUsers(
    users,
    getCell(row, headerMap, "assignedUserName"),
    getCell(row, headerMap, "assignedUserPhone")
  );

  const gender = getCell(row, headerMap, "gender") || "여성";

  return {
    name: getCell(row, headerMap, "name"),
    age: Number(getCell(row, headerMap, "age")) || 0,
    gender,
    txtHSex: gender,
    phone: getCell(row, headerMap, "phone"),
    residenceArea: getCell(row, headerMap, "residenceArea"),
    preferredArea: getCell(row, headerMap, "preferredArea"),
    address: getCell(row, headerMap, "address"),
    experience: getCell(row, headerMap, "experience") || "경력없음",
    availableDays: getCell(row, headerMap, "availableDays"),
    availableHours: getCell(row, headerMap, "availableHours"),
    rejectionTypes: splitList(getCell(row, headerMap, "rejectionTypes")),
    rejectedTasks: getCell(row, headerMap, "rejectedTasks"),
    canDrive: parseYesNo(getCell(row, headerMap, "canDrive")),
    animalAllergy: parseYesNo(getCell(row, headerMap, "animalAllergy")),
    certificateNumber: getCell(row, headerMap, "certificateNumber"),
    contractStatus: (getCell(row, headerMap, "contractStatus") || "대기") as Worker["contractStatus"],
    serviceStartDate: normalizeDateCell(getCell(row, headerMap, "serviceStartDate")),
    resignationDate: normalizeDateCell(getCell(row, headerMap, "resignationDate")),
    notes: getCell(row, headerMap, "notes"),
    assigned_users: [...assigned.ids],
    assignedUserIds: [...assigned.ids],
    assignedUserNames: [...assigned.names],
    assignedUserPhones: [...assigned.phones],
  };
}

export function rowsToEntities<T>(
  sheet: ParsedSheet,
  mapper: (row: string[], headerMap: Map<FieldKey, number>, rowIndex: number) => T | null
): T[] {
  if (sheet.headers.length === 0 || sheet.rows.length === 0) return [];
  const headerMap = buildHeaderMap(sheet.headers);
  const results: T[] = [];

  for (let i = 0; i < sheet.rows.length; i++) {
    const row = sheet.rows[i];
    if (row.every((cell) => !String(cell || "").trim())) continue;
    const entity = mapper(row, headerMap, i);
    if (entity) results.push(cloneRowEntity(entity as Record<string, unknown>) as T);
  }

  return results;
}

export interface UpsertResult {
  inserted: number;
  updated: number;
  skipped: number;
}

/** Firestore에 저장 가능한 형태로 정제 (undefined 제거, null·NaN 안전 처리) */
export function sanitizeForFirestore(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;

    // Firestore는 null을 허용합니다. (undefined만 금지)
    if (value === null) {
      result[key] = null;
      continue;
    }

    if (Array.isArray(value)) {
      result[key] = value.map((v) =>
        v === undefined ? null : v === null ? null : typeof v === "string" ? v : v
      );
      continue;
    }

    if (typeof value === "number" && Number.isNaN(value)) {
      result[key] = 0;
      continue;
    }

    if (typeof value === "object" && value !== null && !(value instanceof Date)) {
      const maybeTimestamp = value as { toMillis?: () => number };
      if (typeof maybeTimestamp.toMillis === "function") {
        result[key] = value;
        continue;
      }
    }

    result[key] = value;
  }

  return result;
}

type BatchOp<T> = {
  type: "create" | "update";
  id: string;
  item: T;
  payload: Record<string, unknown>;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorStack(error: unknown): string {
  return error instanceof Error ? error.stack ?? "" : "";
}

function getFirebaseErrorCode(error: unknown): string {
  const firebaseError = error as { code?: string };
  return firebaseError?.code ?? "unknown";
}

/**
 * Firestore는 undefined 값을 허용하지 않습니다.
 * payload 내부 어디에 있든 undefined가 섞여 있으면 batch.commit() 단계에서 거절될 수 있으므로,
 * Timestamp/Date 등 Firestore에서 허용되는 객체는 보존하고, undefined만 null로 치환합니다.
 */
function deepReplaceUndefined(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;

  // Firestore Timestamp / Date 객체는 그대로 유지
  if (value instanceof Timestamp) return value;
  if (value instanceof Date) return value;

  if (Array.isArray(value)) return value.map(deepReplaceUndefined);

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = deepReplaceUndefined(v);
    }
    return result;
  }

  return value;
}

function sanitizeBatchPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return deepReplaceUndefined(payload) as Record<string, unknown>;
}

function hasUploadValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return value !== 0 || !Number.isFinite(value);
  if (typeof value === "boolean") return value;
  return true;
}

function pruneEmptyUpdatePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const keepEvenWhenEmpty = new Set(["updatedAt"]);
  const pruned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (keepEvenWhenEmpty.has(key) || hasUploadValue(value)) {
      pruned[key] = value;
    }
  }

  return pruned;
}

function getCacheKey(collectionName: string): string {
  return `cached_${collectionName}`;
}

function cacheFailedOperations(collectionName: string, operations: BatchOp<unknown>[]): void {
  if (typeof window === "undefined") return;

  const cachedItems = operations.map((op) => ({
    id: op.id,
    ...op.payload,
  }));
  localStorage.setItem(getCacheKey(collectionName), JSON.stringify(cachedItems));
}

async function commitBatchChunks(
  collectionName: string,
  operations: BatchOp<unknown>[]
): Promise<void> {
  // 요구사항 반영:
  // - 중첩 try/catch 제거 (함수 전체 단일 try/catch)
  // - commit 실패 시 중간에서 catch 후 throw로 흐름을 끊지 않음(자연스럽게 catch로 내려오게)
  // - 최종 commit 직후 성공 alert 실행
  try {
    // 컬렉션 이름(복수형) 강제 검증: user/worker 오타로 다른 컬렉션이 생기는 사고 방지
    if (collectionName !== USERS_COLLECTION && collectionName !== WORKERS_COLLECTION) {
      const err = Object.assign(
        new Error(`잘못된 컬렉션 이름입니다: "${collectionName}" (허용: "${USERS_COLLECTION}", "${WORKERS_COLLECTION}")`),
        { code: "invalid-collection" }
      );
      throw err;
    }

    if (!auth.currentUser) {
      const err = Object.assign(
        new Error("로그인이 필요한 서비스입니다. 로그인 후 다시 시도해 주세요."),
        { code: "auth/not-authenticated" }
      );
      throw err;
    }

    console.log(`Bulk upload commit started: ${collectionName}, ${operations.length} records`);

    for (let i = 0; i < operations.length; i += FIRESTORE_BATCH_LIMIT) {
      const chunk = operations.slice(i, i + FIRESTORE_BATCH_LIMIT);
      const batch = writeBatch(db);

      for (const op of chunk) {
        const ref = doc(db, collectionName, op.id);
        const sanitizedPayload = sanitizeBatchPayload(op.payload);
        if (op.type === "create") {
          batch.set(ref, sanitizedPayload);
        } else {
          // merge:true 로 부분 누락 필드는 기존 값 보존, 채워진 필드만 덮어쓰기 (Upsert)
          batch.set(ref, sanitizedPayload, { merge: true });
        }
      }

      // 최종 커밋 실행
      await batch.commit();

      // 마지막 커밋 직후 즉시 성공 알림
      const isLastCommit = i + FIRESTORE_BATCH_LIMIT >= operations.length;
      if (isLastCommit && typeof window !== "undefined") {
        alert(
          `🎉 성공: Firebase 데이터베이스(${collectionName})에 ${operations.length}명의 데이터 저장을 완료했습니다!`
        );
      }
    }
  } catch (error) {
    console.error("Firestore 전송 실패 원인:", error);
    cacheFailedOperations(collectionName, operations);

    const code = getFirebaseErrorCode(error);
    const message = getErrorMessage(error);
    const stack = getErrorStack(error);

    if (typeof window !== "undefined") {
      alert(
        "❌ 서버 저장 실패!\n" +
          "컬렉션: " +
          collectionName +
          "\n" +
          "코드: " +
          code +
          "\n" +
          "사유: " +
          message +
          (stack ? "\n\n[stack]\n" + stack : "")
      );
    }
    // 상위 로직에서도 실패를 인지할 수 있도록 에러는 그대로 전달
    throw error;
  }
}

export interface BatchUpsertOptions<T extends { name: string; phone: string }> {
  collectionName: string;
  items: T[];
  existing: (T & { id: string })[];
  beforeSave?: (item: T) => Promise<T>;
  onSaved?: (id: string, item: T, isUpdate: boolean) => Promise<void>;
}

/**
 * 이름+연락처 기준 upsert를 Firestore writeBatch(최대 500건/배치)로 일괄 저장.
 * 개별 addDoc/updateDoc 반복 호출 대비 네트워크 안정성이 높음.
 */
export async function upsertByNamePhoneBatch<T extends { name: string; phone: string }>(
  options: BatchUpsertOptions<T>
): Promise<UpsertResult> {
  const { collectionName, items, existing, beforeSave, onSaved } = options;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  const existingMap = new Map<string, T & { id: string }>();
  for (const item of existing) {
    if (item.name || item.phone) {
      existingMap.set(makeUniqueKey(item.name, item.phone), item);
    }
  }

  const operations: BatchOp<T>[] = [];
  const now = Timestamp.now();

  for (let i = 0; i < items.length; i++) {
    const raw = cloneRowEntity(items[i] as Record<string, unknown>) as T;
    if (!raw.name && !raw.phone) {
      skipped++;
      continue;
    }

    const item = beforeSave ? await beforeSave(raw) : raw;
    const key = makeUniqueKey(item.name, item.phone);
    const found = existingMap.get(key);
    const { id: _omitId, createdAt: _c, updatedAt: _u, ...rest } = item as Record<string, unknown>;
    const compatibilityPayload =
      collectionName === USERS_COLLECTION
        ? {
            assigned_workers: (item as Record<string, unknown>).assignedHelperIds ?? [],
            txtUSex: (item as Record<string, unknown>).gender ?? "",
            txtUMemostop: (item as Record<string, unknown>).terminationReason ?? "",
          }
        : collectionName === WORKERS_COLLECTION
          ? {
              assigned_users: (item as Record<string, unknown>).assignedUserIds ?? [],
              txtHSex: (item as Record<string, unknown>).gender ?? "",
            }
          : {};

    const basePayload = sanitizeForFirestore({
      ...rest,
      ...compatibilityPayload,
      updatedAt: now,
    });

    if (found?.id) {
      const mergedPayload = pruneEmptyUpdatePayload(basePayload);
      const mergedItem = { ...found, ...item };

      if (collectionName === USERS_COLLECTION) {
        const userFound = found as unknown as ServiceUser;
        const userItem = item as unknown as ServiceUser;
        if (userItem.contractStatus === "서비스중") {
          delete mergedPayload.contractStatus;
        }
        if (!userItem.assignedHelperIds || userItem.assignedHelperIds.length === 0) {
          mergedPayload.assignedHelperIds = userFound.assignedHelperIds ?? [];
          mergedPayload.assignedHelperNames = userFound.assignedHelperNames ?? [];
          mergedPayload.assignedHelperPhones = userFound.assignedHelperPhones ?? [];
          mergedPayload.assigned_workers = userFound.assigned_workers ?? [];

          (mergedItem as unknown as ServiceUser).assignedHelperIds = userFound.assignedHelperIds ?? [];
          (mergedItem as unknown as ServiceUser).assignedHelperNames = userFound.assignedHelperNames ?? [];
          (mergedItem as unknown as ServiceUser).assignedHelperPhones = userFound.assignedHelperPhones ?? [];
          (mergedItem as unknown as ServiceUser).assigned_workers = userFound.assigned_workers ?? [];
        }
      } else if (collectionName === WORKERS_COLLECTION) {
        const workerFound = found as unknown as Worker;
        const workerItem = item as unknown as Worker;
        if (workerItem.contractStatus === "대기") {
          delete mergedPayload.contractStatus;
        }
        if (workerItem.experience === "경력없음") {
          delete mergedPayload.experience;
        }
        if (!workerItem.assignedUserIds || workerItem.assignedUserIds.length === 0) {
          mergedPayload.assignedUserIds = workerFound.assignedUserIds ?? [];
          mergedPayload.assignedUserNames = workerFound.assignedUserNames ?? [];
          mergedPayload.assignedUserPhones = workerFound.assignedUserPhones ?? [];
          mergedPayload.assigned_users = workerFound.assigned_users ?? [];

          (mergedItem as unknown as Worker).assignedUserIds = workerFound.assignedUserIds ?? [];
          (mergedItem as unknown as Worker).assignedUserNames = workerFound.assignedUserNames ?? [];
          (mergedItem as unknown as Worker).assignedUserPhones = workerFound.assignedUserPhones ?? [];
          (mergedItem as unknown as Worker).assigned_users = workerFound.assigned_users ?? [];
        }
      }

      operations.push({
        type: "update",
        id: found.id,
        item,
        payload: mergedPayload,
      });
      existingMap.set(key, mergedItem);
      updated++;
    } else {
      const newRef = doc(collection(db, collectionName));
      operations.push({
        type: "create",
        id: newRef.id,
        item,
        payload: { ...basePayload, createdAt: now },
      });
      existingMap.set(key, { id: newRef.id, ...item } as T & { id: string });
      inserted++;
    }
  }

  if (operations.length > 0) {
    await commitBatchChunks(collectionName, operations);
  } else if (typeof window !== "undefined") {
    alert("업로드할 유효 데이터가 없습니다. 미리보기 표의 이름/연락처 값을 확인해 주세요.");
  }

  for (const op of operations) {
    await onSaved?.(op.id, op.item, op.type === "update");
  }

  return { inserted, updated, skipped };
}
