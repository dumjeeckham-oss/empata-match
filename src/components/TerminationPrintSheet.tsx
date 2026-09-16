import type { CSSProperties, ReactNode } from "react";
import type { TerminationDocument } from "@/types";

const PRINT_REASONS = [
  ["사망", "이중서비스", "기관변경", "타서비스전환"],
  ["등급변경", "병원장기입원", "사업변경", "가족활동가"],
] as const;
const reasonAliases: Record<string, string[]> = {
  이중서비스: ["이용자퇴소"], 병원장기입원: ["법령변경기인임"],
  사업변경: ["품목변경", "시설변경"], 가족활동가: ["가족희망"],
};
const isSelected = (reasons: string[], reason: string) =>
  reasons.includes(reason) || (reasonAliases[reason] || []).some((alias) => reasons.includes(alias));
const dateParts = (value?: string) => {
  const match = String(value || "").match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  return match ? { year: match[1], month: match[2], day: match[3] } : { year: "", month: "", day: "" };
};
const border: CSSProperties = { border: "0.35mm solid #000", padding: "1.4mm 2mm", verticalAlign: "middle", fontWeight: 400 };
const label: CSSProperties = { ...border, width: "24mm", textAlign: "center", fontWeight: 400 };
const Cell = ({ children, style, colSpan, rowSpan }: { children?: ReactNode; style?: CSSProperties; colSpan?: number; rowSpan?: number }) =>
  <td colSpan={colSpan} rowSpan={rowSpan} style={{ ...border, ...style }}>{children}</td>;

interface Props { document: TerminationDocument; address: string; workerNames: string; logoSrc: string; }

export function TerminationPrintSheet({ document, address, workerNames, logoSrc }: Props) {
  const endDate = dateParts(document.date);
  const approvalDate = dateParts(document.approvalDate || document.date);
  const checkbox = (checked: boolean) => checked ? "■" : "□";
  return (
    <div className="hidden print:block fixed inset-0 z-[10000] bg-white text-black">
      <div style={{ width: "186mm", height: "267mm", overflow: "hidden", fontFamily: "'Malgun Gothic','Dotum',sans-serif", fontSize: "10.5pt", lineHeight: 1.45 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", marginBottom: "3mm" }}>
          <tbody><tr>
            <Cell rowSpan={2} style={{ width: "55%", height: "22mm", textAlign: "center", fontSize: "22pt", fontWeight: 700, letterSpacing: "5mm" }}>종 결 승 인 서</Cell>
            <Cell style={{ width: "22.5%", height: "9mm", textAlign: "center", fontWeight: 700 }}>담당</Cell>
            <Cell style={{ width: "22.5%", textAlign: "center", fontWeight: 700 }}>센터장</Cell>
          </tr><tr><Cell style={{ height: "13mm", textAlign: "center" }}>{document.approverDandang || ""}</Cell><Cell style={{ textAlign: "center" }}>{document.approverCenterJang || ""}</Cell></tr></tbody>
        </table>
        <div style={{ border: "0.35mm solid #000", padding: "2mm", marginBottom: "1mm", minHeight: "26mm" }}>
          부천의료복지사회적협동조합 동백장애인활동지원센터에서 장애인활동지원서비스를 제공 받았던 장애인 이용자를 아래와 같은 사유로 종결하고자 합니다. 검토후 재가바랍니다.
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", marginBottom: "5mm" }}>
          <tbody>
            <tr><th style={label}>사업명</th><Cell>{document.projectName || "동백장애인활동지원센터"}</Cell><th style={label}>담당활동지원사</th><Cell>{workerNames || document.assignedWorkerName || ""}</Cell></tr>
            <tr><th style={label}>종결자</th><Cell>{document.userName || ""}</Cell><th style={label}>주민번호</th><Cell>{document.residentNumber || ""}</Cell></tr>
            <tr><th style={label}>주 소</th><Cell colSpan={3}>{address || ""}</Cell></tr>
            <tr><th style={label}>종결 일시</th><Cell colSpan={3}><span style={{ marginLeft: "8mm" }}>{endDate.year}</span><span style={{ marginLeft: "10mm" }}>년</span><span style={{ marginLeft: "10mm" }}>{endDate.month}</span><span style={{ marginLeft: "8mm" }}>월</span><span style={{ marginLeft: "10mm" }}>{endDate.day}</span><span style={{ marginLeft: "8mm" }}>일</span></Cell></tr>
          </tbody>
        </table>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <tbody>
            <tr><th rowSpan={4} style={{ ...label, fontWeight: 700 }}>종결<br />종류</th>{PRINT_REASONS[0].map((reason) => <Cell key={reason} style={{ height: "12mm" }}>{checkbox(isSelected(document.reasons || [], reason))} {reason}</Cell>)}</tr>
            <tr>{PRINT_REASONS[1].map((reason) => <Cell key={reason} style={{ height: "12mm" }}>{checkbox(isSelected(document.reasons || [], reason))} {reason}</Cell>)}</tr>
            <tr><Cell colSpan={4} style={{ height: "23mm" }}>{checkbox(isSelected(document.reasons || [], "개인사정"))} 개인사정 <span style={{ color: "#f00", fontSize: "9.5pt" }}>(예시:대상자 가정 내 개인사정으로 인하여 종결요청.<br />이후 서비스 여부는 집안사정이 괜찮아지면 연락주겠다고 종결요청함.)</span></Cell></tr>
            <tr><Cell colSpan={4} style={{ height: "12mm" }}>{checkbox(isSelected(document.reasons || [], "기타"))} 기타 <span style={{ color: "#f00", fontSize: "9.5pt", marginLeft: "8mm" }}>예시: 활동지원사의 개인사정 / 활동지원사와의갈등으로 종결요청</span></Cell></tr>
            <tr><th style={{ ...label, height: "64mm", fontWeight: 700 }}>종결<br />사유</th><Cell colSpan={4} style={{ verticalAlign: "top", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{document.reasonDetail || ""}</Cell></tr>
          </tbody>
        </table>
        <div style={{ marginTop: "9mm", textAlign: "center", fontSize: "12pt", fontWeight: 700 }}>결 재 일 <span style={{ marginLeft: "23mm" }}>{approvalDate.year}</span><span style={{ marginLeft: "8mm" }}>년</span><span style={{ marginLeft: "10mm" }}>{approvalDate.month}</span><span style={{ marginLeft: "8mm" }}>월</span><span style={{ marginLeft: "10mm" }}>{approvalDate.day}</span><span style={{ marginLeft: "8mm" }}>일</span></div>
        <div style={{ marginTop: "7mm", textAlign: "center" }}><img src={logoSrc} alt="동백 장애인활동지원센터" style={{ width: "76mm", maxHeight: "22mm", objectFit: "contain" }} /></div>
      </div>
    </div>
  );
}
