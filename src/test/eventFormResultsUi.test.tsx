import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EventFormResults from "@/pages/EventFormResults";
import type { EventFormSlot, EventFormSubmission, EventFormVersion } from "@/types/eventForms";

const xlsx = vi.hoisted(() => ({
  aoaToSheet: vi.fn((value: unknown) => value),
  jsonToSheet: vi.fn((value: unknown) => value),
  appendSheet: vi.fn(),
  newBook: vi.fn(() => ({})),
  writeFile: vi.fn(),
}));

vi.mock("xlsx", () => ({
  utils: {
    aoa_to_sheet: xlsx.aoaToSheet,
    json_to_sheet: xlsx.jsonToSheet,
    book_append_sheet: xlsx.appendSheet,
    book_new: xlsx.newBook,
  },
  writeFile: xlsx.writeFile,
}));

const currentForm: EventFormSlot = {
  id: "form-1",
  ownerUid: "admin-1",
  title: "현재 수정된 제목",
  description: "현재 수정된 설명",
  eventDateTime: "2026-12-20 10:00",
  location: "현재 장소",
  completionMessage: "완료",
  status: "open",
  activeRoundId: "round-current",
  activeVersionId: "version-current",
  duplicatePolicy: "none",
};

const versions: Record<string, EventFormVersion> = {
  "version-current": {
    id: "version-current",
    formId: "form-1",
    roundId: "round-current",
    version: 2,
    fields: [{ id: "current-name", type: "shortText", title: "현재 질문", required: false, visible: true, order: 0 }],
    formSnapshot: { title: "현재 회차", description: "현재 설명", eventDateTime: "2026-12-20 10:00", location: "현재 장소", completionMessage: "완료" },
  },
  "version-old": {
    id: "version-old",
    formId: "form-1",
    roundId: "round-old",
    version: 1,
    fields: [
      { id: "old-second", type: "shortText", title: "과거 두 번째 질문", required: false, visible: true, order: 2 },
      { id: "old-first", type: "shortText", title: "과거 첫 번째 질문", required: false, visible: true, order: 1 },
    ],
    formSnapshot: { title: "과거 교육 제목", description: "과거 교육 설명", eventDateTime: "2026-01-10 14:00", location: "과거 교육실", completionMessage: "과거 완료", expectedTargetCount: 40 },
  },
};

const oldSubmission: EventFormSubmission = {
  id: "submission-old",
  formId: "form-1",
  roundId: "round-old",
  versionId: "version-old",
  sequence: 1,
  answers: { "old-first": "첫 답변", "old-second": "둘째 답변" },
  status: "submitted",
  submittedAt: "2026-01-01T00:00:00.000Z",
};

vi.mock("@/lib/eventFormApi", () => ({
  eventFormApi: { updateSubmission: vi.fn() },
  loadEventForm: vi.fn(async () => currentForm),
  loadEventFormRounds: vi.fn(async () => [
    { id: "round-current", formId: "form-1", name: "현재 회차", status: "open", versionId: "version-current", responseCount: 0 },
    { id: "round-old", formId: "form-1", name: "과거 회차", status: "archived", versionId: "version-old", responseCount: 1 },
  ]),
  loadEventFormVersion: vi.fn(async (versionId: string) => versions[versionId] || null),
  loadEventFormSubmissions: vi.fn(async (roundId: string) => roundId === "round-old" ? [oldSubmission] : []),
}));

describe("과거 회차 결과 스냅샷 UI", () => {
  beforeEach(() => vi.clearAllMocks());

  it("현재 폼 수정과 무관하게 과거 회차의 정보·문항·엑셀·상세를 사용한다", async () => {
    render(<MemoryRouter initialEntries={["/event-forms/form-1/results"]}><Routes><Route path="/event-forms/:formId/results" element={<EventFormResults />} /></Routes></MemoryRouter>);
    await screen.findByRole("heading", { name: "현재 회차" });

    fireEvent.change(screen.getByLabelText("회차"), { target: { value: "round-old" } });
    await screen.findByRole("heading", { name: "과거 교육 제목" });

    expect(screen.getByText(/2026-01-10 14:00/)).toBeInTheDocument();
    expect(screen.getByText(/과거 교육실/)).toBeInTheDocument();
    expect(screen.getByText("과거 교육 설명")).toBeInTheDocument();
    expect(screen.getByText("예상 40명 대비 제출률")).toBeInTheDocument();
    expect(screen.getByText("2.5%")).toBeInTheDocument();
    const headers = screen.getAllByRole("columnheader").map((item) => item.textContent);
    expect(headers.indexOf("과거 첫 번째 질문")).toBeLessThan(headers.indexOf("과거 두 번째 질문"));

    fireEvent.click(screen.getByRole("button", { name: "엑셀 저장" }));
    await waitFor(() => {
      expect(xlsx.aoaToSheet).toHaveBeenCalledWith(expect.arrayContaining([
        ["폼 제목", "과거 교육 제목"],
        ["행사 일시", "2026-01-10 14:00"],
        ["장소", "과거 교육실"],
        ["설명", "과거 교육 설명"],
        ["예상 대상 인원", 40],
        ["제출률", "2.5%"],
      ]));
      expect(xlsx.writeFile).toHaveBeenCalledWith(expect.anything(), "과거 교육 제목_과거 회차.xlsx");
    });

    fireEvent.click(screen.getByRole("button", { name: "#1 상세 보기" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/과거 교육 제목/)).toBeInTheDocument();
    expect(within(dialog).getByText("과거 첫 번째 질문")).toBeInTheDocument();
    expect(within(dialog).getByText("첫 답변")).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).queryByText("현재 수정된 제목")).not.toBeInTheDocument());
  });
});
