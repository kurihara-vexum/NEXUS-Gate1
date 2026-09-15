import { assertAssigneeChangeAllowed, getAssigneePermissions } from "../domain/assignee-policy.js";
import { canTransition, getAllowedTransitions, getDisplayTransitions, statusLabel } from "../domain/status.js";
import { BusinessError, MESSAGES } from "../domain/messages.js";

function nowAfter(previous) {
  const now = Date.now();
  const previousTime = Date.parse(previous);
  return new Date(Math.max(now, previousTime + 1)).toISOString();
}

function getActor(db, actorId) {
  const actor = db.prepare("SELECT id, name, role, is_active FROM users WHERE id = ?").get(actorId);
  if (!actor || !actor.is_active) throw new BusinessError(MESSAGES.forbidden, 403);
  return actor;
}

function getInquiryRow(db, inquiryId) {
  return db.prepare("SELECT * FROM inquiries WHERE id = ?").get(inquiryId);
}

function assertExpectedVersion(inquiry, expectedUpdatedAt) {
  if (!expectedUpdatedAt || inquiry.updated_at !== expectedUpdatedAt) {
    throw new BusinessError(MESSAGES.conflict, 409);
  }
}

function inTransaction(db, operation) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function addHistory(db, values) {
  db.prepare(`
    INSERT INTO inquiry_histories
      (inquiry_id, changed_by, field_name, old_value, new_value, changed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    values.inquiryId,
    values.actorId,
    values.fieldName,
    values.oldValue,
    values.newValue,
    values.changedAt,
  );
}

export function getInquiryDetail(db, inquiryId, actorId) {
  const actor = getActor(db, actorId);
  const inquiry = db.prepare(`
    SELECT i.*, u.name AS assignee_name
    FROM inquiries i
    LEFT JOIN users u ON u.id = i.assignee_id
    WHERE i.id = ?
  `).get(inquiryId);
  if (!inquiry) throw new BusinessError(MESSAGES.notFound, 404);

  const users = db.prepare("SELECT id, name, role FROM users WHERE is_active = 1").all();
  users.sort((a, b) => new Intl.Collator("ja").compare(a.name, b.name));

  const histories = db.prepare(`
    SELECT h.*, u.name AS changed_by_name
    FROM inquiry_histories h
    JOIN users u ON u.id = h.changed_by
    WHERE h.inquiry_id = ?
    ORDER BY h.changed_at DESC, h.id DESC
    LIMIT 20
  `).all(inquiryId);

  return {
    actor,
    inquiry,
    users,
    histories,
    allowedTransitions: getAllowedTransitions(inquiry.status),
    displayTransitions: getDisplayTransitions(inquiry.status),
    assigneePermissions: getAssigneePermissions({ inquiry, actor }),
  };
}

export function changeStatus(db, { inquiryId, actorId, nextStatus, comment = "", expectedUpdatedAt }) {
  if (Array.from(String(comment)).length > 200) {
    throw new BusinessError(MESSAGES.commentTooLong);
  }

  const actor = getActor(db, actorId);
  const initial = getInquiryRow(db, inquiryId);
  if (!initial) throw new BusinessError(MESSAGES.notFound, 404);
  assertExpectedVersion(initial, expectedUpdatedAt);
  if (!canTransition(initial.status, nextStatus)) {
    throw new BusinessError(MESSAGES.invalidTransition);
  }

  return inTransaction(db, () => {
    const inquiry = getInquiryRow(db, inquiryId);
    assertExpectedVersion(inquiry, expectedUpdatedAt);
    const changedAt = nowAfter(inquiry.updated_at);
    const autoAssign = inquiry.status === "NEW" && nextStatus === "IN_PROGRESS" && inquiry.assignee_id == null;
    let closedAt = inquiry.closed_at;
    if (nextStatus === "DONE") closedAt = changedAt;
    if (inquiry.status === "DONE" && nextStatus === "IN_PROGRESS") closedAt = null;

    if (autoAssign) {
      db.prepare("UPDATE inquiries SET assignee_id = ? WHERE id = ?").run(actor.id, inquiryId);
      addHistory(db, {
        inquiryId,
        actorId: actor.id,
        fieldName: "assignee",
        oldValue: null,
        newValue: actor.name,
        changedAt,
      });
    }

    db.prepare("UPDATE inquiries SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?")
      .run(nextStatus, closedAt, changedAt, inquiryId);
    addHistory(db, {
      inquiryId,
      actorId: actor.id,
      fieldName: "status",
      oldValue: inquiry.status,
      newValue: nextStatus,
      changedAt,
    });

    return {
      message: MESSAGES.statusChanged(statusLabel(nextStatus)),
      updatedAt: changedAt,
    };
  });
}

export function changeAssignee(db, { inquiryId, actorId, assigneeId, expectedUpdatedAt }) {
  const actor = getActor(db, actorId);
  const initial = getInquiryRow(db, inquiryId);
  if (!initial) throw new BusinessError(MESSAGES.notFound, 404);
  assertExpectedVersion(initial, expectedUpdatedAt);

  const normalizedAssigneeId = assigneeId == null || assigneeId === "" ? null : Number(assigneeId);
  const targetUser = normalizedAssigneeId == null
    ? null
    : db.prepare("SELECT id, name, role, is_active FROM users WHERE id = ?").get(normalizedAssigneeId);

  if (normalizedAssigneeId != null && !targetUser) {
    throw new BusinessError(MESSAGES.inactiveUser);
  }
  assertAssigneeChangeAllowed({ inquiry: initial, actor, targetUser });

  return inTransaction(db, () => {
    const inquiry = getInquiryRow(db, inquiryId);
    assertExpectedVersion(inquiry, expectedUpdatedAt);
    assertAssigneeChangeAllowed({ inquiry, actor, targetUser });
    const oldUser = inquiry.assignee_id == null
      ? null
      : db.prepare("SELECT name FROM users WHERE id = ?").get(inquiry.assignee_id);
    const changedAt = nowAfter(inquiry.updated_at);

    db.prepare("UPDATE inquiries SET assignee_id = ?, updated_at = ? WHERE id = ?")
      .run(normalizedAssigneeId, changedAt, inquiryId);
    addHistory(db, {
      inquiryId,
      actorId: actor.id,
      fieldName: "assignee",
      oldValue: oldUser?.name ?? null,
      newValue: targetUser?.name ?? null,
      changedAt,
    });

    return {
      message: targetUser ? MESSAGES.assigneeChanged(targetUser.name) : MESSAGES.assigneeCleared,
      updatedAt: changedAt,
    };
  });
}
