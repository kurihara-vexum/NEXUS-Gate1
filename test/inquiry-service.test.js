import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "../src/db.js";
import { MESSAGES } from "../src/domain/messages.js";
import { getAllowedTransitions } from "../src/domain/status.js";
import { changeAssignee, changeStatus, getInquiryDetail } from "../src/services/inquiry-service.js";

function setup() {
  return createDatabase(":memory:");
}

test("状態遷移表は仕様の5遷移だけを許可する", () => {
  assert.deepEqual(getAllowedTransitions("NEW"), ["IN_PROGRESS"]);
  assert.deepEqual(getAllowedTransitions("IN_PROGRESS"), ["PENDING", "DONE"]);
  assert.deepEqual(getAllowedTransitions("PENDING"), ["IN_PROGRESS"]);
  assert.deepEqual(getAllowedTransitions("DONE"), ["IN_PROGRESS"]);
});

test("NEWでは対応中だけ、PENDINGではエラー確認用の完了も表示候補に含める", () => {
  const db = setup();
  assert.deepEqual(getInquiryDetail(db, 1, 2).displayTransitions, ["IN_PROGRESS"]);
  assert.deepEqual(getInquiryDetail(db, 3, 2).displayTransitions, ["IN_PROGRESS", "DONE"]);
});

test("NEWからIN_PROGRESSで未割り当てなら操作者を自動設定し履歴を2件残す", () => {
  const db = setup();
  const before = getInquiryDetail(db, 1, 2);
  const result = changeStatus(db, {
    inquiryId: 1, actorId: 2, nextStatus: "IN_PROGRESS", expectedUpdatedAt: before.inquiry.updated_at,
  });
  const after = getInquiryDetail(db, 1, 2);
  assert.equal(result.message, "ステータスを「対応中」に変更しました。");
  assert.equal(after.inquiry.status, "IN_PROGRESS");
  assert.equal(after.inquiry.assignee_id, 2);
  assert.equal(after.histories.length, 2);
  assert.deepEqual(after.histories.map((h) => h.field_name), ["status", "assignee"]);
});

test("NEWからDONEへの直接遷移を拒否する", () => {
  const db = setup();
  const before = getInquiryDetail(db, 1, 2);
  assert.throws(
    () => changeStatus(db, { inquiryId: 1, actorId: 2, nextStatus: "DONE", expectedUpdatedAt: before.inquiry.updated_at }),
    { message: MESSAGES.invalidTransition },
  );
  assert.equal(getInquiryDetail(db, 1, 2).inquiry.status, "NEW");
});

test("DONEからIN_PROGRESSへの再オープンでclosed_atをクリアする", () => {
  const db = setup();
  const before = getInquiryDetail(db, 4, 2);
  changeStatus(db, { inquiryId: 4, actorId: 2, nextStatus: "IN_PROGRESS", expectedUpdatedAt: before.inquiry.updated_at });
  const after = getInquiryDetail(db, 4, 2);
  assert.equal(after.inquiry.status, "IN_PROGRESS");
  assert.equal(after.inquiry.closed_at, null);
});

test("IN_PROGRESSからDONEでclosed_atを設定する", () => {
  const db = setup();
  const before = getInquiryDetail(db, 2, 2);
  changeStatus(db, { inquiryId: 2, actorId: 2, nextStatus: "DONE", expectedUpdatedAt: before.inquiry.updated_at });
  assert.ok(getInquiryDetail(db, 2, 2).inquiry.closed_at);
});

test("MEMBERは未割り当ての問い合わせを自分に割り当てられる", () => {
  const db = setup();
  const before = getInquiryDetail(db, 1, 2);
  changeAssignee(db, { inquiryId: 1, actorId: 2, assigneeId: 2, expectedUpdatedAt: before.inquiry.updated_at });
  assert.equal(getInquiryDetail(db, 1, 2).inquiry.assignee_id, 2);
});

test("MEMBERは未割り当ての問い合わせを他人に割り当てられない", () => {
  const db = setup();
  const before = getInquiryDetail(db, 1, 2);
  assert.throws(
    () => changeAssignee(db, { inquiryId: 1, actorId: 2, assigneeId: 3, expectedUpdatedAt: before.inquiry.updated_at }),
    { message: MESSAGES.forbidden },
  );
});

test("MEMBERは他人が担当している問い合わせの担当者を変更できない", () => {
  const db = setup();
  const before = getInquiryDetail(db, 3, 2);
  assert.equal(before.inquiry.assignee_id, 3);
  assert.throws(
    () => changeAssignee(db, { inquiryId: 3, actorId: 2, assigneeId: 2, expectedUpdatedAt: before.inquiry.updated_at }),
    { message: MESSAGES.forbidden },
  );
});

test("DONEの担当者はADMINでも変更できない", () => {
  const db = setup();
  const before = getInquiryDetail(db, 4, 1);
  assert.throws(
    () => changeAssignee(db, { inquiryId: 4, actorId: 1, assigneeId: 3, expectedUpdatedAt: before.inquiry.updated_at }),
    { message: MESSAGES.doneAssignee },
  );
});

test("無効ユーザーを担当者に指定できない", () => {
  const db = setup();
  const before = getInquiryDetail(db, 1, 1);
  assert.throws(
    () => changeAssignee(db, { inquiryId: 1, actorId: 1, assigneeId: 4, expectedUpdatedAt: before.inquiry.updated_at }),
    { message: MESSAGES.inactiveUser },
  );
});

test("担当者候補には有効ユーザーだけを返す", () => {
  const db = setup();
  const detail = getInquiryDetail(db, 1, 1);
  assert.deepEqual(detail.users.map((user) => user.id), [1, 2, 3]);
  assert.equal(detail.users.some((user) => user.id === 4), false);
});

test("ADMINはNEWの担当者を未割り当てに戻せる", () => {
  const db = setup();
  let before = getInquiryDetail(db, 1, 1);
  changeAssignee(db, { inquiryId: 1, actorId: 1, assigneeId: 3, expectedUpdatedAt: before.inquiry.updated_at });
  before = getInquiryDetail(db, 1, 1);
  const result = changeAssignee(db, { inquiryId: 1, actorId: 1, assigneeId: null, expectedUpdatedAt: before.inquiry.updated_at });
  assert.equal(result.message, MESSAGES.assigneeCleared);
  assert.equal(getInquiryDetail(db, 1, 1).inquiry.assignee_id, null);
});

test("コメントが201文字なら拒否する", () => {
  const db = setup();
  const before = getInquiryDetail(db, 1, 2);
  assert.throws(
    () => changeStatus(db, { inquiryId: 1, actorId: 2, nextStatus: "IN_PROGRESS", comment: "あ".repeat(201), expectedUpdatedAt: before.inquiry.updated_at }),
    { message: MESSAGES.commentTooLong },
  );
});

test("updated_atが一致しない更新を拒否する", () => {
  const db = setup();
  assert.throws(
    () => changeStatus(db, { inquiryId: 1, actorId: 2, nextStatus: "IN_PROGRESS", expectedUpdatedAt: "stale" }),
    { message: MESSAGES.conflict },
  );
});

test("仕様の処理結果メッセージ9種類が句読点まで一致する", () => {
  assert.equal(MESSAGES.statusChanged("対応中"), "ステータスを「対応中」に変更しました。");
  assert.equal(MESSAGES.assigneeChanged("佐藤 花子"), "担当者を「佐藤 花子」に変更しました。");
  assert.equal(MESSAGES.assigneeCleared, "担当者を未割り当てに戻しました。");
  assert.equal(MESSAGES.invalidTransition, "このステータスへは変更できません。画面を再読み込みしてください。");
  assert.equal(MESSAGES.forbidden, "この操作を行う権限がありません。");
  assert.equal(MESSAGES.doneAssignee, "完了済みの問い合わせは担当者を変更できません。");
  assert.equal(MESSAGES.inactiveUser, "指定されたユーザーは選択できません。");
  assert.equal(MESSAGES.commentTooLong, "コメントは200文字以内で入力してください。");
  assert.equal(MESSAGES.notFound, "指定された問い合わせは存在しません。");
});

test("履歴登録が失敗した場合は本体更新もロールバックする", () => {
  const db = setup();
  const before = getInquiryDetail(db, 2, 2);
  db.exec(`CREATE TRIGGER reject_history BEFORE INSERT ON inquiry_histories BEGIN SELECT RAISE(ABORT, 'history failure'); END;`);
  assert.throws(() => changeStatus(db, {
    inquiryId: 2, actorId: 2, nextStatus: "PENDING", expectedUpdatedAt: before.inquiry.updated_at,
  }));
  const after = getInquiryDetail(db, 2, 2);
  assert.equal(after.inquiry.status, "IN_PROGRESS");
  assert.equal(after.inquiry.updated_at, before.inquiry.updated_at);
});
