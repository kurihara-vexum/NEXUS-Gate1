export const STATUSES = Object.freeze({
  NEW: { code: "NEW", label: "未対応" },
  IN_PROGRESS: { code: "IN_PROGRESS", label: "対応中" },
  PENDING: { code: "PENDING", label: "保留" },
  DONE: { code: "DONE", label: "完了" },
});

export const ALLOWED_TRANSITIONS = Object.freeze({
  NEW: Object.freeze(["IN_PROGRESS"]),
  IN_PROGRESS: Object.freeze(["PENDING", "DONE"]),
  PENDING: Object.freeze(["IN_PROGRESS"]),
  DONE: Object.freeze(["IN_PROGRESS"]),
});

export function getAllowedTransitions(currentStatus) {
  return ALLOWED_TRANSITIONS[currentStatus] ?? [];
}

// PENDING -> DONE is deliberately shown as an error-verification path.
// The server-side transition policy remains unchanged and rejects the update.
export function getDisplayTransitions(currentStatus) {
  if (currentStatus === "NEW") return ["IN_PROGRESS", "DONE"];
  return getAllowedTransitions(currentStatus);
}

export function canTransition(currentStatus, nextStatus) {
  return getAllowedTransitions(currentStatus).includes(nextStatus);
}

export function statusLabel(status) {
  return STATUSES[status]?.label ?? status;
}
