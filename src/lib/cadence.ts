// Touch cadence per stage (target days between touches), shared by the deal
// drawer and My Week so they never drift.
export const STAGE_CADENCE: Record<string, number> = {
  connection: 14,
  pursue: 7,
  attack: 5,
  close: 3,
  won: 30,
  lost: 0,
};

export const TOUCH_KINDS = ["touch", "call", "email", "meeting"];

const DAY = 86400000;

export interface TouchStatus {
  cadence: number;
  lastTouch: Date | null;
  nextTouch: Date;
  daysOverdue: number; // >0 overdue, 0 due today, <0 due in future
}

// Given a deal's stage, its last logged touch (or null) and days-in-stage as a
// fallback, work out when the next touch is due and how overdue it is.
export function touchStatus(
  stage: string,
  lastTouchISO: string | null,
  daysInStage: number,
  now: number = Date.now(),
): TouchStatus {
  const cadence = STAGE_CADENCE[stage] ?? 7;
  const lastMs = lastTouchISO
    ? new Date(lastTouchISO).getTime()
    : now - daysInStage * DAY; // no touch logged → assume last contact was when it entered the stage
  const nextMs = lastMs + cadence * DAY;
  return {
    cadence,
    lastTouch: lastTouchISO ? new Date(lastTouchISO) : null,
    nextTouch: new Date(nextMs),
    daysOverdue: Math.floor((now - nextMs) / DAY),
  };
}
