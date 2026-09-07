import { describe, expect, it } from "vitest";
import { getAdjacentPath, getSwipeDirection } from "@/lib/swipeNavigation";

describe("mobile swipe navigation", () => {
  it("recognizes a deliberate horizontal swipe", () => {
    expect(getSwipeDirection({ x: 200, y: 50, at: 0 }, { x: 90, y: 58, at: 300 })).toBe("left");
    expect(getSwipeDirection({ x: 80, y: 50, at: 0 }, { x: 180, y: 55, at: 300 })).toBe("right");
  });
  it("ignores short, vertical, and slow gestures", () => {
    expect(getSwipeDirection({ x: 100, y: 50, at: 0 }, { x: 60, y: 52, at: 100 })).toBeNull();
    expect(getSwipeDirection({ x: 100, y: 50, at: 0 }, { x: 20, y: 140, at: 100 })).toBeNull();
    expect(getSwipeDirection({ x: 200, y: 50, at: 0 }, { x: 90, y: 50, at: 1200 })).toBeNull();
  });
  it("stops at the first and last menu", () => {
    const paths = ["/", "/work-board", "/users"];
    expect(getAdjacentPath(paths, "/work-board", "left")).toBe("/users");
    expect(getAdjacentPath(paths, "/", "right")).toBeNull();
    expect(getAdjacentPath(paths, "/users", "left")).toBeNull();
  });
});
