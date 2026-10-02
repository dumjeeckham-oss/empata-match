import { describe, expect, it } from "vitest";
import {
  formatUserMatchingTime,
  formatUserVoucherHours,
  getUserCautionTags,
  getUserRequestTags,
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
});
