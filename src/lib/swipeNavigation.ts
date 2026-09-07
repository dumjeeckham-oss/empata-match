export const SWIPE_MIN_DISTANCE = 70;
export type SwipePoint = { x: number; y: number; at: number };

export function getSwipeDirection(start: SwipePoint, end: SwipePoint): "left" | "right" | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (end.at - start.at > 900 || Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.35) return null;
  return dx < 0 ? "left" : "right";
}

export function getAdjacentPath(paths: string[], currentPath: string, direction: "left" | "right"): string | null {
  const index = paths.indexOf(currentPath);
  if (index < 0) return null;
  return paths[direction === "left" ? index + 1 : index - 1] || null;
}
