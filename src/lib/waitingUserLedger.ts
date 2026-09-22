import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  VerticalMergeType,
  WidthType,
} from "docx";
import type { MatchingHistoryRecord, ServiceUser, WeeklySchedule } from "@/types";
import { formatVoucherTier } from "@/lib/userVoucher";

const MINIMUM_CONSULTATION_ROWS = 5;
const DAY_ORDER = ["월", "화", "수", "목", "금", "토", "일"];

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function voucherTotal(user: ServiceUser): number {
  const base = Number(user.voucherHours) || 0;
  const splitExtra = (Number(user.provinceAdditionalHours) || 0) + (Number(user.cityAdditionalHours) || 0);
  return base + (splitExtra > 0 ? splitExtra : Number(user.additionalHours) || 0);
}

function supportChecklist(user: ServiceUser): string {
  const selected = new Set((user.supportTypes || []).filter((item) => item !== "목욕"));
  const standard = ["사회지원", "신체지원", "가사지원"];
  const rows = standard.map((item) => `${selected.has(item) ? "■" : "□"} ${item}`);
  const others = [...selected].filter((item) => !standard.includes(item));
  return [...rows, ...others.map((item) => `■ ${item}`)].join("\n");
}

function slotTime(slot: number): string {
  const minutes = slot * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function ranges(slots: number[]): string[] {
  const sorted = [...new Set(slots)].filter((slot) => slot >= 0 && slot <= 47).sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const result: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (const slot of sorted.slice(1)) {
    if (slot === previous + 1) {
      previous = slot;
      continue;
    }
    result.push(`${slotTime(start)}~${slotTime(previous + 1)}`);
    start = slot;
    previous = slot;
  }
  result.push(`${slotTime(start)}~${slotTime(previous + 1)}`);
  return result;
}

function groupScheduleByTime(schedule: WeeklySchedule[], slotKey: "slots" | "alternativeSlots"): string {
  const timeGroups = new Map<string, string[]>();
  for (const day of schedule) {
    for (const range of ranges(day[slotKey] || [])) {
      timeGroups.set(range, [...(timeGroups.get(range) || []), day.day]);
    }
  }
  return [...timeGroups.entries()]
    .map(([range, days]) => `요일: ${days.join("·")}\n시간: ${range}`)
    .join("\n\n");
}

export function formatDesiredServiceTime(user: Pick<ServiceUser, "weeklySchedule" | "requiredDays" | "requiredHours">): string {
  const schedule = [...(user.weeklySchedule || [])].sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day));
  const primary = groupScheduleByTime(schedule, "slots");
  const alternatives = groupScheduleByTime(schedule, "alternativeSlots");
  if (primary || alternatives) {
    if (primary && alternatives) return `1안\n${primary}\n\n2안\n${alternatives}`;
    return primary || `2안\n${alternatives}`;
  }
  const fallback = [
    text(user.requiredDays) ? "요일: " + text(user.requiredDays) : "",
    text(user.requiredHours) ? "시간: " + text(user.requiredHours) : "",
  ].filter(Boolean);
  return fallback.join("\n") || "미등록";
}

function profileConsultationContent(user: ServiceUser): string {
  const lines: string[] = [];
  const addIfPresent = (label: string, value: unknown) => {
    const normalized = text(value);
    if (normalized) lines.push(`[${label}] ${normalized}`);
  };
  const requests = [
    user.needsAftercare ? "배변 뒤처리" : "",
    user.wantsWeekendSupport ? "주말 지원" : "",
    user.needsSchoolSupport ? "학교 내 지원" : "",
    user.femaleOnly ? "여성 활동지원사" : "",
    user.maleOnly ? "남성 활동지원사" : "",
  ].filter(Boolean);
  const supportTypes = (user.supportTypes || []).filter((item) => item !== "목욕");

  addIfPresent("거주자", user.livingWith || user.familyMembers);
  addIfPresent("주소", user.address);
  lines.push(
    "[반려동물] " + (user.hasPet ? "있음" + (text(user.petNote) ? " (" + text(user.petNote) + ")" : "") : "없음"),
    "[차량] " + (user.needsVehicle ? "필요" : "불필요"),
    "[기저귀] " + (user.usesDiaper ? "사용" : "미사용"),
  );
  if (supportTypes.length) lines.push("[지원종류] " + supportTypes.join(", "));
  if (requests.length) lines.push("[추가요청] " + requests.join(", "));
  addIfPresent("이동 시 유의점", user.movementNote);
  addIfPresent("가사 지원 시 유의점", user.houseworkNote);
  addIfPresent("희망 활동지원사", user.preferredWorkerTraits);
  addIfPresent("특이사항", user.notes);
  return lines.join("\n");
}

function attemptContent(record: MatchingHistoryRecord | undefined, sequence: number): string {
  if (!record) return "";
  const isFailure = record.type === "실패" || record.status === "매칭 실패";
  const isSuccess = record.type === "매칭" && !isFailure;
  const status = isFailure ? "매칭 실패" : isSuccess ? "매칭 계약 성사" : "매칭 진행 중";
  const details = isSuccess
    ? [record.reason, record.reasonDetail, record.attemptResult, record.notes]
    : [record.failureReason, record.attemptResult, record.reasonDetail, record.notes];
  const reason = Array.from(new Set(details.map(text).filter(Boolean))).join(" - ");
  return sequence + "차: 활동지원사 " + (text(record.workerName) || "미등록") + " " + status + (reason ? " (" + reason + ")" : "");
}

export interface WaitingLedgerRange {
  startDate?: string;
  endDate?: string;
}

function isMatchingProgressRecord(record: MatchingHistoryRecord): boolean {
  return record.type === "시도" || record.type === "실패" || record.type === "매칭";
}

export function shouldIncludeUserInWaitingLedger(user: ServiceUser, matchingRecords: MatchingHistoryRecord[]): boolean {
  const isWaiting = user.contractStatus === "대기"
    || user.contractStatus === "작성중"
    || !(user.assignedHelperIds || []).length;
  return isWaiting || matchingRecords.some((record) => record.userId === user.id && isMatchingProgressRecord(record));
}

export interface WaitingLedgerRow {
  userId: string;
  name: string;
  disabilityVoucher: string;
  supportTypes: string;
  desiredServiceTime: string;
  stage: string;
  consultationDate: string;
  consultationContent: string;
}

export const WAITING_LEDGER_HEADERS = [
  "이름",
  "장애유형 / 바우처",
  "지원종류",
  "희망 제공시간",
  "상담차수",
  "상담일",
  "상담내용 / 매칭시도 결과",
  "비고",
] as const;

/** Returns the vertical span for the first row of a user, and 0 for continuation rows. */
export function getWaitingLedgerRowSpan(rows: WaitingLedgerRow[], index: number): number {
  const current = rows[index];
  if (!current || (index > 0 && rows[index - 1]?.userId === current.userId)) return 0;
  let span = 1;
  while (rows[index + span]?.userId === current.userId) span += 1;
  return span;
}

function isDateInRange(date: string, range?: WaitingLedgerRange): boolean {
  if (!date) return !range?.startDate && !range?.endDate;
  return (!range?.startDate || date >= range.startDate) && (!range?.endDate || date <= range.endDate);
}

export function buildWaitingUserLedgerRows(
  users: ServiceUser[],
  matchingRecords: MatchingHistoryRecord[],
  range?: WaitingLedgerRange,
): WaitingLedgerRow[] {
  return users.flatMap((user) => {
    const allProgressRecords = matchingRecords
      .filter((record) => record.userId === user.id && isMatchingProgressRecord(record))
      .sort((a, b) => text(a.attemptDate || a.date).localeCompare(text(b.attemptDate || b.date)));
    const receiptInRange = isDateInRange(text(user.receiptDate), range);
    const progressRecords = allProgressRecords.filter((record) => isDateInRange(text(record.attemptDate || record.date), range));
    if ((range?.startDate || range?.endDate) && !receiptInRange && progressRecords.length === 0) return [];
    const rowCount = Math.max(MINIMUM_CONSULTATION_ROWS, progressRecords.length + 1);
    return Array.from({ length: rowCount }, (_, index) => {
      const attempt = index > 0 ? progressRecords[index - 1] : undefined;
      const sequence = index + 1;
      return {
        userId: text(user.id),
        name: [user.name, user.gender, user.age ? String(user.age) + "세" : ""].filter(Boolean).join("\n"),
        disabilityVoucher: [[user.disabilityType, user.secondaryDisabilityType].filter(Boolean).join(" / "), formatVoucherTier(user), voucherTotal(user) ? String(voucherTotal(user)) + "시간" : ""].filter(Boolean).join("\n"),
        supportTypes: supportChecklist(user),
        desiredServiceTime: formatDesiredServiceTime(user),
        stage: index === 0 ? "초기 상담" : String(sequence) + "차 상담",
        consultationDate: index === 0 ? text(user.receiptDate) : text(attempt?.attemptDate || attempt?.date),
        consultationContent: index === 0 ? profileConsultationContent(user) : attemptContent(attempt, sequence),
      };
    });
  });
}
const border = { style: BorderStyle.SINGLE, size: 4, color: "333333" };
const borders = { top: border, bottom: border, left: border, right: border };

function paragraphs(value: string, bold = false, center = false): Paragraph[] {
  const lines = String(value || "").split("\n");
  return lines.map((line) => new Paragraph({
    alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before: 0, after: 0, line: 240 },
    children: [new TextRun({ text: line, bold, size: 18, font: "맑은 고딕" })],
  }));
}

function cell(value: string, width: number, options?: { header?: boolean; center?: boolean; merge?: (typeof VerticalMergeType)[keyof typeof VerticalMergeType] }): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders,
    verticalAlign: VerticalAlign.CENTER,
    verticalMerge: options?.merge,
    shading: options?.header ? { fill: "E9EEF5" } : undefined,
    margins: { top: 70, bottom: 70, left: 70, right: 70 },
    children: paragraphs(value, options?.header, options?.center),
  });
}

export function buildWaitingUserLedgerDocument(users: ServiceUser[], matchingRecords: MatchingHistoryRecord[], range?: WaitingLedgerRange): Document {
  const rows = buildWaitingUserLedgerRows(users, matchingRecords, range);
  const seen = new Map<string, number>();
  const tableRows = rows.map((row) => {
    const occurrence = seen.get(row.userId) || 0;
    seen.set(row.userId, occurrence + 1);
    const merge = occurrence === 0 ? VerticalMergeType.RESTART : VerticalMergeType.CONTINUE;
    const mergedValue = (value: string) => occurrence === 0 ? value : "";
    return new TableRow({
      cantSplit: true,
      children: [
        cell(mergedValue(row.name), 900, { center: true, merge }),
        cell(mergedValue(row.disabilityVoucher), 1200, { center: true, merge }),
        cell(mergedValue(row.supportTypes), 1100, { merge }),
        cell(mergedValue(row.desiredServiceTime), 1500, { center: true, merge }),
        cell(row.stage, 850, { center: true }),
        cell(row.consultationDate, 1050, { center: true }),
        cell(row.consultationContent, 4800),
        cell("", 1400),
      ],
    });
  });

  return new Document({
    styles: { default: { document: { run: { font: "맑은 고딕", size: 18 } } } },
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE, width: 11906, height: 16838 },
          margin: { top: 500, right: 450, bottom: 500, left: 450 },
        },
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 180 },
          children: [new TextRun({ text: "이용자 매칭 상담 대장", bold: true, size: 34, font: "맑은 고딕" })],
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                cell(WAITING_LEDGER_HEADERS[0], 900, { header: true, center: true }),
                cell(WAITING_LEDGER_HEADERS[1], 1200, { header: true, center: true }),
                cell(WAITING_LEDGER_HEADERS[2], 1100, { header: true, center: true }),
                cell(WAITING_LEDGER_HEADERS[3], 1500, { header: true, center: true }),
                cell(WAITING_LEDGER_HEADERS[4], 850, { header: true, center: true }),
                cell(WAITING_LEDGER_HEADERS[5], 1050, { header: true, center: true }),
                cell(WAITING_LEDGER_HEADERS[6], 4800, { header: true, center: true }),
                cell(WAITING_LEDGER_HEADERS[7], 1400, { header: true, center: true }),
              ],
            }),
            ...tableRows,
          ],
        }),
      ],
    }],
  });
}

export async function buildWaitingUserLedgerBlob(users: ServiceUser[], matchingRecords: MatchingHistoryRecord[], range?: WaitingLedgerRange): Promise<Blob> {
  return Packer.toBlob(buildWaitingUserLedgerDocument(users, matchingRecords, range));
}
