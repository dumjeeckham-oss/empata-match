import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { decodeStrokes, encodeStrokes, type HandwritingStroke } from "@/lib/counselingHandwriting";

export type HandwritingCanvasHandle = { finalize: () => void };
type Props = { strokes: HandwritingStroke[]; width: number; height: number; onChange: (strokes: HandwritingStroke[]) => void; onPending?: (strokes: HandwritingStroke[]) => void; disabled?: boolean };

const HandwritingCanvas = forwardRef<HandwritingCanvasHandle, Props>(function HandwritingCanvas({ strokes, width, height, onChange, onPending, disabled }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const value = useRef(strokes);
  const current = useRef<HandwritingStroke | null>(null);
  const pointer = useRef<number | null>(null);
  const history = useRef<HandwritingStroke[][]>([]);
  const redo = useRef<HandwritingStroke[][]>([]);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [penWidth, setPenWidth] = useState<2 | 4 | 7>(4);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [limitNotice, setLimitNotice] = useState("");
  const transform = useRef({ scale: 1, x: 0, y: 0 });
  const frame = useRef(0);

  function paint() {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const size = host.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, Math.floor(size.width)), ch = Math.max(1, Math.floor(size.height));
    if (canvas.width !== cw * ratio || canvas.height !== ch * ratio) { canvas.width = cw * ratio; canvas.height = ch * ratio; }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = "#e5e7eb"; ctx.fillRect(0, 0, cw, ch);
    const scale = Math.min(cw / width, ch / height), x = (cw - width * scale) / 2, y = (ch - height * scale) / 2;
    transform.current = { scale, x, y };
    ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#111827"; ctx.fillStyle = "#111827"; ctx.lineJoin = "round"; ctx.lineCap = "round";
    for (const stroke of [...value.current, ...(current.current ? [current.current] : [])]) {
      if (!stroke.points.length) continue;
      ctx.lineWidth = stroke.width;
      ctx.beginPath(); ctx.moveTo(stroke.points[0][0], stroke.points[0][1]);
      for (const [px, py] of stroke.points.slice(1)) ctx.lineTo(px, py);
      ctx.stroke();
      if (stroke.points.length === 1) { ctx.beginPath(); ctx.arc(stroke.points[0][0], stroke.points[0][1], stroke.width / 2, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  function schedulePaint() { if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; paint(); }); }

  useEffect(() => {
    if (JSON.stringify(value.current) !== JSON.stringify(strokes)) {
      history.current = []; redo.current = [];
      setUndoCount(0); setRedoCount(0);
    }
    value.current = strokes;
    schedulePaint();
  // Canvas는 부모의 필기 데이터 변경만 반영하며 pointermove는 ref에서 처리한다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes]);
  useEffect(() => {
    const observer = new ResizeObserver(schedulePaint);
    if (hostRef.current) observer.observe(hostRef.current);
    schedulePaint();
    return () => { observer.disconnect(); cancelAnimationFrame(frame.current); frame.current = 0; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  function point(event: React.PointerEvent<HTMLCanvasElement>): [number, number, number] | null {
    const rect = event.currentTarget.getBoundingClientRect();
    const t = transform.current;
    const x = (event.clientX - rect.left - t.x) / t.scale, y = (event.clientY - rect.top - t.y) / t.scale;
    if (x < 0 || y < 0 || x > width || y > height) return null;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round((event.pressure || 0.5) * 100) / 100];
  }
  function commit(next: HandwritingStroke[]) {
    try { decodeStrokes(encodeStrokes(next), width, height); }
    catch { setLimitNotice("필기량 한도에 도달했습니다. 정식 상담으로 옮긴 후 삭제하거나 일부 필기를 지워주세요."); schedulePaint(); return; }
    setLimitNotice("");
    history.current.push(value.current); if (history.current.length > 30) history.current.shift();
    redo.current = []; value.current = next;
    setUndoCount(history.current.length); setRedoCount(0); onChange(next); schedulePaint();
  }
  function erase(p: [number, number, number]) {
    const radius = 18 / transform.current.scale;
    const next = value.current.filter(s => !s.points.some(([x, y]) => Math.hypot(x - p[0], y - p[1]) < radius));
    if (next.length !== value.current.length) { value.current = next; schedulePaint(); }
  }
  const beforeErase = useRef<HandwritingStroke[] | null>(null);
  function finalize() {
    if (pointer.current === null) return;
    pointer.current = null;
    if (tool === "pen" && current.current) { const next = [...value.current, current.current]; current.current = null; commit(next); }
    if (tool === "eraser" && beforeErase.current) { const next = value.current; value.current = beforeErase.current; beforeErase.current = null; commit(next); }
  }
  useImperativeHandle(ref, () => ({ finalize }));
  function finish(event: React.PointerEvent<HTMLCanvasElement>) {
    if (pointer.current !== event.pointerId) return;
    finalize();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function preservePending() {
    const next = current.current ? [...value.current, current.current] : value.current;
    try { decodeStrokes(encodeStrokes(next), width, height); onPending?.(next); }
    catch { finalize(); setLimitNotice("필기량 한도에 도달했습니다. 추가 필기를 멈추고 정식 상담으로 옮겨주세요."); }
  }
  return <div className="flex h-full min-h-0 min-w-0 flex-col gap-2" data-no-swipe>
    {limitNotice && <p role="status" className="text-sm break-words">{limitNotice}</p>}
    <div className="flex flex-wrap gap-2 [&_button]:min-h-11 [&_button]:min-w-11">
      <Button variant={tool === "pen" ? "default" : "outline"} disabled={disabled} onClick={() => setTool("pen")}>펜</Button>
      <Button variant={tool === "eraser" ? "default" : "outline"} disabled={disabled} onClick={() => setTool("eraser")}>지우개</Button>
      <label className="flex min-h-11 items-center gap-1 text-sm">굵기<select aria-label="펜 굵기" className="h-11 rounded border bg-background px-2" disabled={disabled} value={penWidth} onChange={e => setPenWidth(Number(e.target.value) as 2 | 4 | 7)}><option value={2}>가는 선</option><option value={4}>보통</option><option value={7}>굵은 선</option></select></label>
      <Button variant="outline" disabled={disabled || !undoCount} onClick={() => { const previous = history.current.pop(); if (!previous) return; redo.current.push(value.current); value.current = previous; setUndoCount(history.current.length); setRedoCount(redo.current.length); onChange(previous); schedulePaint(); }}>↶ 실행 취소</Button>
      <Button variant="outline" disabled={disabled || !redoCount} onClick={() => { const next = redo.current.pop(); if (!next) return; history.current.push(value.current); value.current = next; setUndoCount(history.current.length); setRedoCount(redo.current.length); onChange(next); schedulePaint(); }}>↷ 다시 실행</Button>
      <Button variant="outline" disabled={disabled || !strokes.length} onClick={() => { if (window.confirm("필기 영역을 모두 비울까요? 실행 취소로 되돌릴 수 있습니다.")) commit([]); }}>전체 지우기</Button>
    </div>
    <div ref={hostRef} className="relative min-h-[230px] min-w-0 flex-1 overflow-hidden rounded border bg-white">
      <canvas ref={canvasRef} aria-label="임시 손글씨 필기 영역" role="img" className="absolute inset-0 h-full w-full touch-none select-none" style={{ touchAction: "none" }}
        onPointerDown={e => {
          if (disabled || pointer.current !== null || e.button !== 0) return;
          const p = point(e); if (!p) return;
          e.preventDefault(); pointer.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId);
          if (tool === "eraser") { beforeErase.current = value.current; erase(p); }
          else current.current = { id: crypto.randomUUID(), width: penWidth, points: [p] };
          preservePending();
          schedulePaint();
        }}
        onPointerMove={e => {
          if (pointer.current !== e.pointerId) return;
          e.preventDefault(); const p = point(e); if (!p) return;
          if (tool === "eraser") erase(p);
          else if (current.current) { const previous = current.current.points[current.current.points.length - 1]; if (Math.hypot(p[0] - previous[0], p[1] - previous[1]) >= 1.5) {
            current.current.points.push(p);
            try { decodeStrokes(encodeStrokes([...value.current, current.current]), width, height); }
            catch { current.current.points.pop(); finalize(); setLimitNotice("필기량 한도에 도달했습니다."); return; }
          } }
          preservePending();
          schedulePaint();
        }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} />
    </div>
  </div>;
});
export default HandwritingCanvas;
