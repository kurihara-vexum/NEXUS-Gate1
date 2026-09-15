const STATUS_LABELS = {
  NEW: "未対応",
  IN_PROGRESS: "対応中",
  PENDING: "保留",
  DONE: "完了",
};

const PRIORITIES = {
  HIGH: { label: "高", className: "high" },
  MIDDLE: { label: "中", className: "middle" },
  LOW: { label: "低", className: "low" },
};

const pathMatch = location.pathname.match(/\/inquiries\/(\d+)/);
const inquiryId = Number(pathMatch?.[1] ?? 1);
const actorId = Number(new URLSearchParams(location.search).get("actorId") ?? 2);
let detail;

const elements = {
  message: document.querySelector("#message"),
  actorName: document.querySelector("#actor-name"),
  actorRole: document.querySelector("#actor-role"),
  title: document.querySelector("#title"),
  requester: document.querySelector("#requester"),
  priority: document.querySelector("#priority"),
  createdAt: document.querySelector("#created-at"),
  body: document.querySelector("#body"),
  statusSection: document.querySelector("#status-section"),
  currentStatus: document.querySelector("#current-status"),
  statusOptions: document.querySelector("#status-options"),
  statusForm: document.querySelector("#status-form"),
  comment: document.querySelector("#comment"),
  commentCount: document.querySelector("#comment-count"),
  currentAssignee: document.querySelector("#current-assignee"),
  assignee: document.querySelector("#assignee"),
  assigneeForm: document.querySelector("#assignee-form"),
  assigneeButton: document.querySelector("#assignee-button"),
  assigneeGuidance: document.querySelector("#assignee-guidance"),
  historyList: document.querySelector("#history-list"),
};

function formatDate(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(value));
}

function showMessage(message, type) {
  elements.message.textContent = message;
  elements.message.className = `message ${type}`;
  elements.message.hidden = false;
  elements.message.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message);
  return body;
}

function renderStatus() {
  elements.currentStatus.textContent = STATUS_LABELS[detail.inquiry.status];
  elements.statusOptions.replaceChildren();
  const displayTransitions = detail.displayTransitions ?? detail.allowedTransitions;
  elements.statusSection.hidden = displayTransitions.length === 0;
  displayTransitions.forEach((status, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "radio-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "status";
    input.id = `status-${status}`;
    input.value = status;
    input.checked = index === 0;
    const label = document.createElement("label");
    label.htmlFor = input.id;
    label.textContent = STATUS_LABELS[status];
    wrapper.append(input, label);
    elements.statusOptions.append(wrapper);
  });
}

function renderAssignee() {
  const { actor, inquiry, users, assigneePermissions } = detail;
  elements.currentAssignee.textContent = inquiry.assignee_name ?? "未割り当て";
  elements.assignee.replaceChildren();

  if (assigneePermissions.canClear) {
    const option = new Option("未割り当て", "");
    elements.assignee.add(option);
  }

  const visibleUsers = assigneePermissions.allowedUserIds == null
    ? users
    : users.filter((user) => assigneePermissions.allowedUserIds.includes(user.id));
  visibleUsers.forEach((user) => elements.assignee.add(new Option(user.name, user.id)));
  if (inquiry.assignee_id != null && !visibleUsers.some((user) => user.id === inquiry.assignee_id)) {
    elements.assignee.add(new Option(inquiry.assignee_name, inquiry.assignee_id));
  }
  elements.assignee.value = inquiry.assignee_id == null && assigneePermissions.canClear
    ? ""
    : String(inquiry.assignee_id ?? actor.id);

  elements.assigneeButton.disabled = !assigneePermissions.canChange;
  elements.assignee.disabled = !assigneePermissions.canChange;
  elements.assigneeGuidance.textContent = assigneePermissions.guidance ?? "";
  elements.assigneeGuidance.hidden = !assigneePermissions.guidance;
}

function renderHistory() {
  elements.historyList.replaceChildren();
  if (detail.histories.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "変更履歴はありません";
    elements.historyList.append(empty);
    return;
  }

  detail.histories.forEach((history) => {
    const item = document.createElement("article");
    item.className = "history-item";
    const time = document.createElement("time");
    time.className = "history-time";
    time.textContent = formatDate(history.changed_at);
    const user = document.createElement("span");
    user.className = "history-user";
    user.textContent = history.changed_by_name;
    const change = document.createElement("strong");
    const label = history.field_name === "status" ? "ステータス" : "担当者";
    const oldValue = history.field_name === "status"
      ? STATUS_LABELS[history.old_value]
      : history.old_value ?? "未割り当て";
    const newValue = history.field_name === "status"
      ? STATUS_LABELS[history.new_value]
      : history.new_value ?? "未割り当て";
    change.textContent = `${label}：${oldValue} → ${newValue}`;
    item.append(time, user, change);
    elements.historyList.append(item);
  });
}

function render() {
  const { actor, inquiry } = detail;
  elements.actorName.textContent = actor.name;
  elements.actorRole.textContent = actor.role;
  elements.title.textContent = inquiry.title;
  elements.requester.textContent = inquiry.requester_name;
  elements.body.textContent = inquiry.body;
  elements.createdAt.textContent = formatDate(inquiry.created_at);
  const priority = PRIORITIES[inquiry.priority];
  elements.priority.textContent = priority.label;
  elements.priority.className = `priority ${priority.className}`;
  renderStatus();
  renderAssignee();
  renderHistory();
}

async function load() {
  try {
    detail = await request(`/api/inquiries/${inquiryId}?actorId=${actorId}`);
    render();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

elements.comment.addEventListener("input", () => {
  elements.commentCount.textContent = `${Array.from(elements.comment.value).length} / 200`;
});

elements.statusForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const nextStatus = new FormData(elements.statusForm).get("status");
  try {
    const result = await request(`/api/inquiries/${inquiryId}/status`, {
      method: "POST",
      body: JSON.stringify({ actorId, nextStatus, comment: elements.comment.value, expectedUpdatedAt: detail.inquiry.updated_at }),
    });
    await load();
    elements.comment.value = "";
    elements.commentCount.textContent = "0 / 200";
    showMessage(result.message, "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

elements.assigneeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await request(`/api/inquiries/${inquiryId}/assignee`, {
      method: "POST",
      body: JSON.stringify({ actorId, assigneeId: elements.assignee.value || null, expectedUpdatedAt: detail.inquiry.updated_at }),
    });
    await load();
    showMessage(result.message, "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

load();
