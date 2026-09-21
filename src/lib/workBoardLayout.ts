export const WORK_BOARD_WIDGET_IDS = ["todos", "scheduleStarts", "calendar", "quickLinks", "matching", "annualSchedules"] as const;
export type WorkBoardWidgetId = (typeof WORK_BOARD_WIDGET_IDS)[number];

export function normalizeWorkBoardOrder(value: unknown): WorkBoardWidgetId[] {
  const requested = Array.isArray(value) ? value.filter((id): id is WorkBoardWidgetId => WORK_BOARD_WIDGET_IDS.includes(id as WorkBoardWidgetId)) : [];
  return [...new Set(requested), ...WORK_BOARD_WIDGET_IDS.filter((id) => !requested.includes(id))];
}

export function moveWorkBoardWidget(order: WorkBoardWidgetId[], dragged: WorkBoardWidgetId, target: WorkBoardWidgetId): WorkBoardWidgetId[] {
  const normalized = normalizeWorkBoardOrder(order);
  if (dragged === target) return normalized;
  const withoutDragged = normalized.filter((id) => id !== dragged);
  const targetIndex = withoutDragged.indexOf(target);
  withoutDragged.splice(targetIndex < 0 ? withoutDragged.length : targetIndex, 0, dragged);
  return withoutDragged;
}
