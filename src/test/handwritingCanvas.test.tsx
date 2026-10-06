import { createRef } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import HandwritingCanvas, { type HandwritingCanvasHandle } from "@/components/HandwritingCanvas";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  HTMLCanvasElement.prototype.hasPointerCapture = () => false;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 1600, height: 1000, left: 0, top: 0, right: 1600, bottom: 1000, x: 0, y: 0, toJSON() {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it.each(["close", "cancel", "lost", "resize", "unmount"])("진행 중 stroke는 %s 전에도 로컬 미저장 작업으로 전달", mode => {
  const ref = createRef<HandwritingCanvasHandle>(), pending = vi.fn(), change = vi.fn();
  const view = render(<HandwritingCanvas ref={ref} strokes={[]} width={1600} height={1000} onChange={change} onPending={pending} />);
  const canvas = screen.getByRole("img");
  fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, button: 0 });
  fireEvent.pointerMove(canvas, { clientX: 40, clientY: 40 });
  expect(pending.mock.calls.at(-1)?.[0][0].points).toHaveLength(2);
  if (mode === "close") act(() => ref.current?.finalize());
  if (mode === "cancel") fireEvent.pointerCancel(canvas);
  if (mode === "lost") fireEvent.lostPointerCapture(canvas);
  if (mode === "resize") { fireEvent(window, new Event("resize")); act(() => ref.current?.finalize()); }
  if (mode === "unmount") view.unmount();
  else expect(change.mock.calls.at(-1)?.[0][0].points).toHaveLength(2);
});
it("pointerdown만 한 경우 빈 stroke가 아닌 한 점을 보존", () => {
  const ref=createRef<HandwritingCanvasHandle>(), change=vi.fn(), pending=vi.fn();
  render(<HandwritingCanvas ref={ref} strokes={[]} width={1600} height={1000} onChange={change} onPending={pending}/>);
  fireEvent.pointerDown(screen.getByRole("img"),{clientX:10,clientY:10,button:0});
  act(()=>ref.current?.finalize());
  expect(change.mock.calls[0][0][0].points).toHaveLength(1);
  expect(pending.mock.calls[0][0][0].points).toHaveLength(1);
});
