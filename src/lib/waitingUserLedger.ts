import * as XLSX from "xlsx";
import type { CounselingRecord, ServiceUser } from "@/types";

const CONSULTATION_STAGES = ["초기상담", "2차상담", "3차상담", "4차상담", "5차상담"] as const;

function text(value: unknown): string { return String(value ?? "").trim(); }

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

function counselingChannel(record?: CounselingRecord): "phone" | "face" | "none" {
  if (!record) return "none";
  return /대면|방문/.test(`${record.category || ""} ${record.content || ""}`) ? "face" : "phone";
}

function profileConsultationContent(user: ServiceUser): string {
  const requiredTime = [user.requiredDays, user.requiredHours].filter(Boolean).join(" · ");
  return [
    `[필요시간] ${requiredTime || "미등록"}`,
    `[이동 시 유의점] ${text(user.movementNote) || "없음"}`,
    `[가사 지원 시 유의점] ${text(user.houseworkNote) || "없음"}`,
    `[희망 활동지원사] ${text(user.preferredWorkerTraits) || "미등록"}`,
    `[특이사항] ${text(user.notes) || "없음"}`,
  ].join("\n");
}

export function buildWaitingUserLedgerWorkbook(users: ServiceUser[], counselingRecords: CounselingRecord[]): XLSX.WorkBook {
  const rows: unknown[][] = [["이용자 매칭 상담 대장"], [], ["이름", "장애유형 / 바우처", "지원 필요", "희망 제공시간", "상담차수", "상담일", "유선상담", "대면상담", "상담내용", "비고"]];
  const merges: XLSX.Range[] = [XLSX.utils.decode_range("A1:J1")];

  users.forEach((user) => {
    const startRow = rows.length;
    const records = counselingRecords.filter((record) => record.targetType === "이용자" && record.targetId === user.id).sort((a, b) => text(a.date).localeCompare(text(b.date))).slice(0, CONSULTATION_STAGES.length);
    CONSULTATION_STAGES.forEach((stage, index) => {
      const record = records[index];
      const channel = counselingChannel(record);
      const savedCounseling = record
        ? ["[상담기록]", record.content, record.result ? `[상담결과] ${record.result}` : ""].filter(Boolean).join("\n")
        : "";
      rows.push([
        index === 0 ? [user.name, user.gender, user.age ? `${user.age}세` : ""].filter(Boolean).join("\n") : "",
        index === 0 ? [user.disabilityType, voucherTotal(user) ? `${voucherTotal(user)}시간` : ""].filter(Boolean).join("\n") : "",
        index === 0 ? supportChecklist(user) : "",
        index === 0 ? [user.requiredDays, user.requiredHours].filter(Boolean).join("\n") : "",
        stage, record?.date || "",
        channel === "phone" ? "■ 유선상담" : "□ 유선상담",
        channel === "face" ? "■ 대면상담" : "□ 대면상담",
        [index === 0 ? profileConsultationContent(user) : "", savedCounseling].filter(Boolean).join("\n\n"),
        index === 0 ? user.notes || "" : "",
      ]);
    });
    const endRow = startRow + CONSULTATION_STAGES.length - 1;
    [0, 1, 2, 3, 9].forEach((column) => merges.push({ s: { r: startRow, c: column }, e: { r: endRow, c: column } }));
  });

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!merges"] = merges;
  worksheet["!cols"] = [{ wch: 11 }, { wch: 18 }, { wch: 15 }, { wch: 18 }, { wch: 11 }, { wch: 13 }, { wch: 12 }, { wch: 12 }, { wch: 65 }, { wch: 18 }];
  worksheet["!rows"] = rows.map((_, index) => ({ hpt: index === 0 ? 30 : index === 2 ? 24 : index > 2 ? 42 : 10 }));
  worksheet["!autofilter"] = { ref: `A3:J${Math.max(rows.length, 3)}` };
  worksheet["!margins"] = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
  worksheet["!pageSetup"] = { orientation: "landscape", fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "대기 이용자 상담대장");
  return workbook;
}
