import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  MobileDetailDialogBody,
  MobileDetailDialogContent,
  MobileDetailDialogFooter,
  MobileDetailDialogHeader,
} from "@/components/MobileDetailDialog";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { shouldIgnoreSwipeTarget } from "@/lib/swipeNavigation";

describe("mobile detail dialog", () => {
  it("stays inside the dynamic mobile viewport with independent body scrolling", () => {
    render(
      <Dialog open>
        <MobileDetailDialogContent>
          <MobileDetailDialogHeader>
            <DialogTitle>상세 정보</DialogTitle>
          </MobileDetailDialogHeader>
          <MobileDetailDialogBody data-testid="detail-body">내용</MobileDetailDialogBody>
          <MobileDetailDialogFooter data-testid="detail-footer">
            <button type="button">닫기</button>
          </MobileDetailDialogFooter>
        </MobileDetailDialogContent>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("h-[100dvh]", "max-h-[100dvh]", "overflow-hidden");
    expect(dialog).toHaveClass("flex");
    expect(dialog).not.toHaveClass("grid");
    expect(dialog).toHaveAttribute("data-no-swipe");
    expect(screen.getByTestId("detail-body")).toHaveClass("flex-1", "overflow-y-auto", "overscroll-contain");
    expect(screen.getByTestId("detail-footer")).toHaveClass("shrink-0", "grid-cols-2");
  });

  it("prevents page swipe navigation from interactions inside the detail screen", () => {
    render(
      <Dialog open>
        <MobileDetailDialogContent>
          <DialogTitle>상세 정보</DialogTitle>
          <p data-testid="detail-text">내용</p>
        </MobileDetailDialogContent>
      </Dialog>,
    );

    expect(shouldIgnoreSwipeTarget(screen.getByTestId("detail-text"))).toBe(true);
  });
});
