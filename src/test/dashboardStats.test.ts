import { describe, expect, it } from "vitest";
import { getPersonDetailPath } from "@/lib/dashboardStats";

describe("dashboard shortcuts", () => {
  it("이용자와 활동지원사 상세 경로를 안전하게 만든다", () => {
    expect(getPersonDetailPath("user", "user 1")).toBe("/users?detailId=user%201");
    expect(getPersonDetailPath("worker", "worker/1")).toBe("/workers?detailId=worker%2F1");
  });
});
