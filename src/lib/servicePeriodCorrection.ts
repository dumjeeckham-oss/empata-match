/** 정정 전 종료 이벤트를 보존하면서 현재 이력에서 제외한다. */
export function correctedPeriodLog(type: "매칭" | "해제", start: string, end: string, hasMatching: boolean, hasClosing: boolean, previousEnd?: string) {
  const periodCorrectionVoided = !end && hasMatching && type === "해제";
  return {
    date: start,
    type: !end && !periodCorrectionVoided ? "매칭" : end && !hasClosing ? "해제" : type,
    endDate: end && (type === "해제" || !hasClosing || previousEnd) ? end : "",
    periodCorrectionVoided,
  };
}

export function isValidServicePeriod(start: string, end: string): boolean {
  return Boolean(start) && (!end || end >= start);
}
