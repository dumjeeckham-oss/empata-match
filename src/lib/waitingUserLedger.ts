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
  const selected = new Set(user.supportTypes || []);
  const standard = ["사회지원", "신체지원", "가사지원", "목욕"];
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

export function formatDesiredServiceTime(user: Pick<ServiceUser, "weeklySchedule" | "requiredDays" | "requiredHours">): string {
  const schedule = [...(user.weeklySchedule || [])].sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day));
  const primary = schedule.flatMap((day: WeeklySchedule) => ranges(day.slots || []).map((range) => `${day.day} ${range}`));
  const alternatives = schedule.flatMap((day: WeeklySchedule) => ranges(day.alternativeSlots || []).map((range) => `${day.day} ${range}`));
  if (primary.length || alternatives.length) {
    return [primary.join("\n"), alternatives.length ? `2안\n${alternatives.join("\n")}` : ""].filter(Boolean).join("\n");
  }
  return [text(user.requiredDays), text(user.requiredHours)].filter(Boolean).join("\n") || "미등록";
}

function profileConsultationContent(user: ServiceUser): string {
  const requests = [
    user.needsAftercare ? "배변 뒤처리" : "",
    user.wantsWeekendSupport ? "주말 지원" : "",
    user.needsSchoolSupport ? "학교 내 지원" : "",
    user.femaleOnly ? "여성 활동지원사" : "",
    user.maleOnly ? "남성 활동지원사" : "",
  ].filter(Boolean);
  return [
    "[거주자] " + (text(user.livingWith || user.familyMembers) || "미등록"),
    "[주소] " + (text(user.address) || "미등록"),
    "[반려동물] " + (user.hasPet ? "있음" + (text(user.petNote) ? " (" + text(user.petNote) + ")" : "") : "없음"),
    "[차량] " + (user.needsVehicle ? "필요" : "불필요"),
    "[기저귀] " + (user.usesDiaper ? "사용" : "미사용"),
    "[지원종류] " + ((user.supportTypes || []).join(", ") || "미등록"),
    "[추가요청] " + (requests.join(", ") || "없음"),
    "[비고] " + (text(user.notes) || "없음"),
  ].join("\n");
}

function attemptContent(record: MatchingHistoryRecord | undefined, sequence: number): string {
  if (!record) return "";
  const status = record.type === "실패" ? "매칭 실패" : "매칭 시도";
  const reason = Array.from(new Set([record.failureReason, record.attemptResult, record.reasonDetail, record.notes].map(text).filter(Boolean))).join(" - ");
  return sequence + "차: 활동지원사 " + (text(record.workerName) || "미등록") + " " + status + (reason ? " (" + reason + ")" : "");
}

export interface WaitingLedgerRange {
  startDate?: string;
  endDate?: string;
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
    const allAttempts = matchingRecords
      .filter((record) => record.userId === user.id && (record.type === "시도" || record.type === "실패"))
      .sort((a, b) => text(a.attemptDate || a.date).localeCompare(text(b.attemptDate || b.date)));
    const receiptInRange = isDateInRange(text(user.receiptDate), range);
    const attempts = allAttempts.filter((record) => isDateInRange(text(record.attemptDate || record.date), range));
    if ((range?.startDate || range?.endDate) && !receiptInRange && attempts.length === 0) return [];
    const rowCount = Math.max(MINIMUM_CONSULTATION_ROWS, attempts.length + 1);
    return Array.from({ length: rowCount }, (_, index) => {
      const attempt = index > 0 ? attempts[index - 1] : undefined;
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
    return new TableRow({
      cantSplit: true,
      children: [
        cell(row.name, 900, { center: true, merge }),
        cell(row.disabilityVoucher, 1200, { center: true, merge }),
        cell(row.supportTypes, 1100, { merge }),
        cell(row.desiredServiceTime, 1500, { center: true, merge }),
        cell(row.stage, 850, { center: true }),
        cell(row.consultationDate, 1050, { center: true }),
        cell(row.consultationContent, 5600),

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
                cell("이름", 900, { header: true, center: true }),
                cell("장애유형 / 바우처", 1200, { header: true, center: true }),
                cell("지원종류", 1100, { header: true, center: true }),
                cell("희망 제공시간", 1500, { header: true, center: true }),
                cell("상담차수", 850, { header: true, center: true }),
                cell("상담일", 1050, { header: true, center: true }),
                cell("상담내용 / 매칭시도 결과", 5600, { header: true, center: true }),

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
