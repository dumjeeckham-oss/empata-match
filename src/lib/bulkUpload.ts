import * as XLSX from "xlsx";
import type { ServiceUser, Worker } from "@/types";

export function safeStr(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function makeUniqueKey(name: string, phone: string): string {
  return `${name.trim()}::${normalizePhone(phone)}`;
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
  { field: "contractStatus", patterns: [/계약상태/, /서비스상태/, /이용상태/] },
  { field: "serviceStartDate", patterns: [/최초서비스/, /서비스시작/, /서비스제공/] },
  { field: "guardianName", patterns: [/보호자이름/, /보호자명/, /보호자\s*이름/] },
  { field: "guardianRelation", patterns: [/보호자관계/, /보호자\s*관계/] },
  { field: "guardianPhone", patterns: [/보호자연락/, /보호자\s*연락/, /보호자전화/] },
  { field: "notes", patterns: [/비고/, /메모/, /^note/i] },
  { field: "terminationReason", patterns: [/중단/, /중단사유/, /txtUMemostop/i, /해지사유/, /종료사유/] },
  { field: "assignedHelperName", patterns: [/담당.*지원사/, /활동지원사.*이름/, /매칭.*이름/, /담당자/] },
  { field: "assignedHelperPhone", patterns: [/담당.*연락/, /활동지원사.*연락/, /매칭.*연락/] },
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
  const nonEmpty = matrix.filter((row) => row.some((cell) => cell.trim()));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map((h) => h.trim());
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
  const lines = paste.trim().split(/\r?\n/);
  const matrix = lines.map((line) => line.split("\t").map(safeStr));
  return sheetFromMatrix(matrix);
}

export function buildHeaderMap(headers: string[]): Map<FieldKey, number> {
  const map = new Map<FieldKey, number>();
  headers.forEach((header, idx) => {
    const trimmed = header.trim();
    const compact = trimmed.toLowerCase().replace(/\s/g, "");
    for (const rule of HEADER_RULES) {
      if (map.has(rule.field)) continue;
      const matched = rule.patterns.some(
        (p) => p.test(trimmed) || p.test(compact) || p.test(header)
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

function splitList(val: string): string[] {
  if (!val) return [];
  return val.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
}

function parseYesNo(val: string): boolean {
  const v = val.trim().toLowerCase();
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
        w.name.trim() === name.trim() &&
        (!normPhone || normalizePhone(w.phone) === normPhone)
    );
    if (byName) return { id: byName.id, name: byName.name, phone: byName.phone };
  }
  return null;
}

/** Each call returns a fresh object — safe for row-by-row bulk insert. */
export function rowToServiceUser(
  row: string[],
  headerMap: Map<FieldKey, number>,
  workers: (Worker & { id: string })[] = []
): Omit<ServiceUser, "id" | "createdAt" | "updatedAt"> {
  const assignedHelperName = getCell(row, headerMap, "assignedHelperName");
  const assignedHelperPhone = getCell(row, headerMap, "assignedHelperPhone");
  const matched = resolveWorker(workers, assignedHelperName, assignedHelperPhone);

  return {
    name: getCell(row, headerMap, "name"),
    age: Number(getCell(row, headerMap, "age")) || 0,
    gender: getCell(row, headerMap, "gender") || "남성",
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
    contractStatus: (getCell(row, headerMap, "contractStatus") || "서비스중") as ServiceUser["contractStatus"],
    serviceStartDate: getCell(row, headerMap, "serviceStartDate"),
    guardianName: getCell(row, headerMap, "guardianName"),
    guardianRelation: getCell(row, headerMap, "guardianRelation"),
    guardianPhone: getCell(row, headerMap, "guardianPhone"),
    terminationReason: getCell(row, headerMap, "terminationReason"),
    assignedHelperId: matched?.id || "",
    assignedHelperName: matched?.name || assignedHelperName,
    assignedHelperPhone: matched?.phone || assignedHelperPhone,
  };
}

/** Each call returns a fresh object — safe for row-by-row bulk insert. */
export function rowToWorker(
  row: string[],
  headerMap: Map<FieldKey, number>
): Omit<Worker, "id" | "createdAt" | "updatedAt"> {
  return {
    name: getCell(row, headerMap, "name"),
    age: Number(getCell(row, headerMap, "age")) || 0,
    gender: getCell(row, headerMap, "gender") || "여성",
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
    serviceStartDate: getCell(row, headerMap, "serviceStartDate"),
    resignationDate: getCell(row, headerMap, "resignationDate"),
    notes: getCell(row, headerMap, "notes"),
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
    if (row.every((cell) => !cell.trim())) continue;
    const entity = mapper(row, headerMap, i);
    if (entity) results.push(entity);
  }

  return results;
}

export interface UpsertResult {
  inserted: number;
  updated: number;
  skipped: number;
}

export async function upsertByNamePhone<T extends { name: string; phone: string }>(
  items: T[],
  existing: (T & { id: string })[],
  addFn: (item: Omit<T, "id">) => Promise<unknown>,
  updateFn: (id: string, item: Partial<T>) => Promise<unknown>,
  beforeSave?: (item: T) => Promise<T>
): Promise<UpsertResult> {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  const existingMap = new Map<string, T & { id: string }>();
  for (const item of existing) {
    if (item.name || item.phone) {
      existingMap.set(makeUniqueKey(item.name, item.phone), item);
    }
  }

  for (let i = 0; i < items.length; i++) {
    const raw = { ...items[i] };
    if (!raw.name && !raw.phone) {
      skipped++;
      continue;
    }

    const item = beforeSave ? await beforeSave(raw) : raw;
    const key = makeUniqueKey(item.name, item.phone);
    const found = existingMap.get(key);

    if (found?.id) {
      await updateFn(found.id, item);
      existingMap.set(key, { ...found, ...item });
      updated++;
    } else {
      await addFn(item);
      inserted++;
    }
  }

  return { inserted, updated, skipped };
}
