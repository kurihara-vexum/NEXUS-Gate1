import { BusinessError, MESSAGES } from "./messages.js";

export function getAssigneePermissions({ inquiry, actor }) {
  if (inquiry.status === "DONE") {
    return {
      canChange: false,
      canClear: false,
      showUnassignedOption: actor.role === "ADMIN",
      allowedUserIds: [],
      guidance: MESSAGES.doneAssignee,
    };
  }

  if (actor.role === "MEMBER") {
    const canAssignSelf = inquiry.assignee_id == null;
    return {
      canChange: canAssignSelf,
      canClear: false,
      showUnassignedOption: false,
      allowedUserIds: canAssignSelf ? [actor.id] : [],
      guidance: canAssignSelf ? null : "担当者の変更は管理者に依頼してください",
    };
  }

  return {
    canChange: true,
    canClear: inquiry.status === "NEW",
    showUnassignedOption: true,
    allowedUserIds: null,
    guidance: null,
  };
}

export function assertAssigneeChangeAllowed({ inquiry, actor, targetUser }) {
  if (inquiry.status === "DONE") {
    throw new BusinessError(MESSAGES.doneAssignee);
  }

  if (targetUser && !targetUser.is_active) {
    throw new BusinessError(MESSAGES.inactiveUser);
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

}
