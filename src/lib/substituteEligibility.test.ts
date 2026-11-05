import { describe, expect, it } from "vitest";
import { assessWorkerEmployment, evaluateDiaperCare, evaluateDisabilityExperience, evaluateDriving, evaluateHousework } from "@/lib/substituteEligibility";
import type { SubstituteRequirements, SubstituteWorkerInput } from "@/types/substitute";

const requirements: SubstituteRequirements = {
  diaperCare: "REQUIRED", driving: "NONE", housework: "PREFERRED", transfer: "NONE", bathingAndBodyCare: "NONE", communication: "NONE", disabilityExperience: "PREFERRED", workerGender: "ANY", userDisabilityType: "ANY",
};
const worker = (overrides: Partial<SubstituteWorkerInput> = {}): SubstituteWorkerInput => ({ id: "w1", name: "합성 지원사", contractStatus: "대기", leaveStatus: "ACTIVE", ...overrides });

describe("substitute eligibility calculations", () => {
  it("includes a 근무중 worker", () => expect(assessWorkerEmployment(worker({ contractStatus: "근무중" }), "2026-11-09").eligibility).toBe("ELIGIBLE"));
  it("includes a 대기 worker", () => expect(assessWorkerEmployment(worker({ contractStatus: "대기" }), "2026-11-09").eligibility).toBe("ELIGIBLE"));
  it("includes a 변경 worker", () => expect(assessWorkerEmployment(worker({ contractStatus: "변경" }), "2026-11-09").eligibility).toBe("ELIGIBLE"));
  it("includes an unassigned employed worker", () => expect(assessWorkerEmployment(worker({ assignedUserIds: [] }), "2026-11-09").eligibility).toBe("ELIGIBLE"));
  it("excludes a retired worker", () => expect(assessWorkerEmployment(worker({ contractStatus: "퇴사", retirementDate: "2026-11-09" }), "2026-11-09").eligibility).toBe("INELIGIBLE"));
  it("keeps a future retirement date active", () => expect(assessWorkerEmployment(worker({ contractStatus: "퇴사", retirementDate: "2026-11-10" }), "2026-11-09").eligibility).toBe("ELIGIBLE"));
  it("flags conflicting rehire history for review", () => expect(assessWorkerEmployment(worker({ employmentHistory: [{ startDate: "2026-01-01", endDate: "2026-11-20", status: "퇴사" }, { startDate: "2026-11-10", endDate: null, status: "재직중" }] }), "2026-11-10").eligibility).toBe("REVIEW_REQUIRED"));
  it("does not invent a leave decision when leave status is unknown", () => expect(assessWorkerEmployment(worker({ leaveStatus: "UNKNOWN" }), "2026-11-09").eligibility).toBe("REVIEW_REQUIRED"));
  it("passes confirmed diaper care", () => expect(evaluateDiaperCare(worker({ diaperCareStatus: "가능" }), requirements.diaperCare).status).toBe("PASS"));
  it("fails explicitly unavailable diaper care", () => expect(evaluateDiaperCare(worker({ diaperCareStatus: "불가" }), requirements.diaperCare).status).toBe("FAIL"));
  it("reviews unknown diaper care", () => expect(evaluateDiaperCare(worker({}), requirements.diaperCare).status).toBe("REVIEW_REQUIRED"));
  it("reviews conflict between legacy refusal and new possible status", () => expect(evaluateDiaperCare(worker({ diaperCareStatus: "가능", rejectionTypes: ["기저귀거부"] }), requirements.diaperCare).status).toBe("REVIEW_REQUIRED"));
  it("uses supportTypes for housework preference", () => expect(evaluateHousework(worker({ supportTypes: ["가사지원"] }), requirements.housework).status).toBe("PASS"));
  it("does not treat missing housework data as failure", () => expect(evaluateHousework(worker({}), requirements.housework).status).toBe("UNKNOWN"));
  it("does not score disability experience when user type is ANY", () => expect(evaluateDisabilityExperience(worker({ disabilityExperienceTypes: ["지체장애"] }), requirements.disabilityExperience, "ANY").status).toBe("NOT_APPLICABLE"));
  it("does not apply a driving filter when driving is NONE", () => expect(evaluateDriving(worker({ canDrive: false }), requirements.driving).status).toBe("NOT_APPLICABLE"));
  it("evaluates explicit disability experience only when requested", () => expect(evaluateDisabilityExperience(worker({ disabilityExperienceTypes: ["지체장애"] }), requirements.disabilityExperience, "지체장애").status).toBe("PASS"));
});
