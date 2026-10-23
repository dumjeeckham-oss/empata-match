import { describe, expect, it } from "vitest";
import type { Worker } from "@/types";
import { calculateAge, matchesWorkerFilters } from "@/lib/workerFilters";

const base = (overrides: Partial<Worker> = {}) => ({
  name: "지원사", gender: "여성", rejectionTypes: [], animalAllergy: false, availableHours: "09:00~18:00", weeklySchedule: [],
  ...overrides,
} as Worker);

describe("worker search filters", () => {
  it("calculates age from birth date and rejects invalid dates", () => {
    expect(calculateAge("1990-10-24", new Date("2026-10-24"))).toBe(36);
    expect(calculateAge("not-a-date", new Date("2026-10-24"))).toBeNull();
  });
  it("applies gender OR and capability/time groups as AND", () => {
    expect(matchesWorkerFilters(base({ gender: "여성", canSupportDiaper: true }), { genders: ["여성", "남성"], timeBands: ["오전"], canSupportDiaper: true, noAnimalAllergy: true, canSupportAdults: false, canSupportMaleUsers: false }, new Date("2026-10-24"))).toBe(true);
    expect(matchesWorkerFilters(base({ gender: "여성", canSupportDiaper: false }), { genders: ["여성"], timeBands: ["오전"], canSupportDiaper: true, noAnimalAllergy: true, canSupportAdults: false, canSupportMaleUsers: false }, new Date("2026-10-24"))).toBe(false);
  });
  it("does not treat missing birth date or time as a match for active filters", () => {
    const filters = { genders: [], minAge: 30, maxAge: 40, timeBands: ["오전"] as ("오전" | "오후")[], canSupportDiaper: false, noAnimalAllergy: false, canSupportAdults: false, canSupportMaleUsers: false };
    expect(matchesWorkerFilters(base({ birthDate: "" }), filters)).toBe(false);
    expect(matchesWorkerFilters(base({ birthDate: "1990-01-01", availableHours: "" }), filters)).toBe(false);
  });
  it("includes all-day schedules in either time band", () => {
    const worker = base({ availableHours: "종일" });
    const common = { genders: [], canSupportDiaper: false, noAnimalAllergy: false, canSupportAdults: false, canSupportMaleUsers: false };
    expect(matchesWorkerFilters(worker, { ...common, timeBands: ["오전"] })).toBe(true);
    expect(matchesWorkerFilters(worker, { ...common, timeBands: ["오후"] })).toBe(true);
  });
});
