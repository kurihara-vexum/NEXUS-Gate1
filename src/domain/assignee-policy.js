import { BusinessError, MESSAGES } from "./messages.js";

export function assertAssigneeChangeAllowed({ inquiry, actor, targetUser }) {
  if (inquiry.status === "DONE") {
    throw new BusinessError(MESSAGES.doneAssignee);
  }

  if (actor.role === "MEMBER") {
    const isSelfAssignment = inquiry.assignee_id == null && targetUser?.id === actor.id;
    if (!isSelfAssignment) {
      throw new BusinessError(MESSAGES.forbidden, 403);
    }
  }

  if (actor.role === "ADMIN" && targetUser == null && inquiry.status !== "NEW") {
    throw new BusinessError(MESSAGES.forbidden, 403);
  }

  if (targetUser && !targetUser.is_active) {
    throw new BusinessError(MESSAGES.inactiveUser);
  }
}

