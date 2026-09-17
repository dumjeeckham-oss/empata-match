import { describe, expect, it } from "vitest";
import { shouldIgnoreSwipeTarget } from "@/lib/swipeNavigation";

describe("mobile swipe interaction boundaries", () => {
  it("allows navigation from ordinary page content", () => {
    expect(shouldIgnoreSwipeTarget(document.createElement("p"))).toBe(false);
  });
  it("does not navigate while scrolling a table or calendar", () => {
    const wrapper = document.createElement("div");
    wrapper.className = "overflow-x-auto";
    const child = wrapper.appendChild(document.createElement("span"));
    expect(shouldIgnoreSwipeTarget(child)).toBe(true);
    wrapper.className = "";
    wrapper.setAttribute("data-no-swipe", "");
    expect(shouldIgnoreSwipeTarget(child)).toBe(true);
  });
  it("does not navigate while editing or using a popup", () => {
    expect(shouldIgnoreSwipeTarget(document.createElement("input"))).toBe(true);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    expect(shouldIgnoreSwipeTarget(dialog.appendChild(document.createElement("p")))).toBe(true);
  });
  it("ignores editable content and safely handles missing targets", () => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    expect(shouldIgnoreSwipeTarget(editable)).toBe(true);
    expect(shouldIgnoreSwipeTarget(null)).toBe(false);
  });
});