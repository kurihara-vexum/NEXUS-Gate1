export const MESSAGES = Object.freeze({
  statusChanged: (label) => `ステータスを「${label}」に変更しました。`,
  assigneeChanged: (name) => `担当者を「${name}」に変更しました。`,
  assigneeCleared: "担当者を未割り当てに戻しました。",
  invalidTransition: "このステータスへは変更できません。画面を再読み込みしてください。",
  forbidden: "この操作を行う権限がありません。",
  doneAssignee: "完了済みの問い合わせは担当者を変更できません。",
  inactiveUser: "指定されたユーザーは選択できません。",
  commentTooLong: "コメントは200文字以内で入力してください。",
  notFound: "指定された問い合わせは存在しません。",
  conflict: "他のユーザーが更新しました。画面を再読み込みしてください。",
});

export class BusinessError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "BusinessError";
    this.statusCode = statusCode;
  }
}

