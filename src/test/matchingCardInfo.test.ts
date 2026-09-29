import { describe, expect, it } from "vitest";
import {
  formatUserMatchingTime,
  formatUserVoucherHours,
  getUserCautionTags,
  getUserRequestTags,
  getWorkerAdditionalInfoTags,
  getWorkerAvailableTags,
  getWorkerPreviewAddress,
  getWorkerPreviewNotes,
  getWorkerUnavailableTags,
} from "@/lib/matchingCardInfo";
import type { ServiceUser, Worker } from "@/types";

const user = {
  voucherTier: 15,
  voucherHours: 90,
  provinceAdditionalHours: 5,
  cityAdditionalHours: 5,
  requiredDays: "월~금",
  requiredHours: "13시~17시",
  supportTypes: ["가사지원"],
  environmentTags: ["기저귀"],
  wantsWeekendSupport: true,
  hasPet: true,
  petNote: "대형견",
  usesDiaper: true,
} as ServiceUser;

describe("matching comparison card information", () => {
  it("shows requested monthly time and total voucher hours", () => {
    expect(formatUserMatchingTime(user)).toContain("월 80시간");
    expect(formatUserVoucherHours(user)).toBe("월 100시간");
  });

  it("collects checked requests and caution conditions without duplicates", () => {
    expect(getUserRequestTags(user)).toEqual(expect.arrayContaining(["가사지원", "주말 지원"]));
    expect(getUserCautionTags(user)).toEqual(expect.arrayContaining(["기저귀", "기저귀 케어", "반려동물: 대형견"]));
  });

  it("turns worker rejection choices into easy-to-read unavailable labels", () => {
    const worker = {
      rejectionTypes: ["주말거부", "목욕거부"],
      animalAllergy: true,
      rejectedTasks: "대형견 가정",
    } as Worker;
    expect(getWorkerUnavailableTags(worker)).toEqual(["주말 불가", "목욕 불가", "반려동물 불가", "대형견 가정"]);
  });

  it("uses road and detail address before integrated and regional legacy addresses", () => {
    expect(getWorkerPreviewAddress({ roadAddress: "경기도 부천시 길주로 1", detailAddress: "101호", address: "기존 주소", residenceArea: "중동" } as unknown as Worker)).toBe("경기도 부천시 길주로 1 101호");
    expect(getWorkerPreviewAddress({ address: "경기도 부천시 원미구", residenceArea: "중동" } as Worker)).toBe("경기도 부천시 원미구");
    expect(getWorkerPreviewAddress({ address: "", residenceArea: "중동" } as Worker)).toBe("중동");
  });

  it("separates checked activity, additional information, notes, and rejection data", () => {
    const worker = {
      supportTypes: ["신체지원", "가사지원"],
      canDrive: true,
      isForeigner: true,
      hasF4: true,
      hasF5: false,
      notes: "휠체어 이동 경험이 많음",
      rejectionTypes: ["주말거부"],
      rejectedTasks: "대형견 가정",
    } as Worker;

    expect(getWorkerAvailableTags(worker)).toEqual(["신체지원", "가사지원", "운전 가능"]);
    expect(getWorkerAdditionalInfoTags(worker)).toEqual(["외국인", "F4 체류자격"]);
    expect(getWorkerPreviewNotes(worker)).toBe("휠체어 이동 경험이 많음");
    expect(getWorkerUnavailableTags(worker)).toEqual(["주말 불가", "대형견 가정"]);
  });

  it("hides empty optional sections and never stringifies object-shaped legacy values", () => {
    const worker = {
      supportTypes: [null, { label: "잘못된 값" }],
      rejectionTypes: undefined,
      rejectedTasks: { text: "잘못된 값" },
      notes: { text: "잘못된 값" },
    } as unknown as Worker;

    expect(getWorkerAvailableTags(worker)).toEqual([]);
    expect(getWorkerAdditionalInfoTags(worker)).toEqual([]);
    expect(getWorkerUnavailableTags(worker)).toEqual([]);
    expect(getWorkerPreviewNotes(worker)).toBe("");
  });

  it("keeps a notes-only worker separate from all empty checkbox sections", () => {
    const worker = { notes: "특이사항만 등록됨" } as Worker;
    expect(getWorkerPreviewNotes(worker)).toBe("특이사항만 등록됨");
    expect(getWorkerAvailableTags(worker)).toEqual([]);
    expect(getWorkerAdditionalInfoTags(worker)).toEqual([]);
    expect(getWorkerUnavailableTags(worker)).toEqual([]);
  });

  it("preserves long address and counseling text for wrapping in the preview", () => {
    const longAddress = "경기도 부천시 원미구 매우 긴 도로명 주소 123 아주 긴 공동주택 이름 101동 202호";
    const longNotes = "장시간 상담에서 기록한 특이사항입니다. ".repeat(20).trim();
    expect(getWorkerPreviewAddress({ address: longAddress } as Worker)).toBe(longAddress);
    expect(getWorkerPreviewNotes({ notes: longNotes } as Worker)).toBe(longNotes);
  });
});
