import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Manual from "@/pages/Manual";

describe("사용 매뉴얼", () => {
  it("마크다운을 제목, 목록, 표가 있는 문서로 렌더링한다", () => {
    const { container } = render(<Manual />);

    expect(screen.getByRole("heading", { name: "동백 활동지원센터 프로그램 사용 매뉴얼" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "1. 화면 이동과 설치" })).toBeInTheDocument();
    expect(screen.getAllByRole("table")).toHaveLength(2);
    expect(container.textContent).not.toContain("# 동백 활동지원센터 프로그램 사용 매뉴얼");
    expect(container.textContent).not.toContain("| 메뉴 | 주요 용도 |");
  });
});
