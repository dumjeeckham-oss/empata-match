import { describe, expect, it } from "vitest";
import { getLinkedWorkerIds, replacePersonName, rewriteWorkerEntries } from "@/lib/profileCascade";

describe("worker profile cascade compatibility", () => {
  it("finds worker links stored only in the legacy assigned_workers field", () => {
    expect(getLinkedWorkerIds({ assigned_workers: ["worker-1"] })).toEqual(["worker-1"]);
  });

  it("rewrites historical worker names by stable worker id", () => {
    const result = rewriteWorkerEntries(
      [{ id: "history-1", workerId: "worker-1", workerName: "조운옥", workerPhone: "010-1111-2222" }],
      "worker-1",
      { name: "조윤옥", phone: "010-1111-2222" },
      { name: "조운옥", phone: "010-1111-2222" },
    );
    expect(result?.[0].workerName).toBe("조윤옥");
  });

  it("does not rewrite a legacy same-name record when its phone belongs to another person", () => {
    const result = rewriteWorkerEntries(
      [{ id: "history-2", workerId: "", workerName: "조운옥", workerPhone: "010-9999-9999" }],
      "worker-1",
      { name: "조윤옥", phone: "010-1111-2222" },
      { name: "조운옥", phone: "010-1111-2222" },
    );
    expect(result).toBeNull();
  });

  it("replaces a name inside a comma-separated termination worker list", () => {
    expect(replacePersonName("박수진, 조운옥", "조운옥", "조윤옥")).toBe("박수진, 조윤옥");
  });
});
