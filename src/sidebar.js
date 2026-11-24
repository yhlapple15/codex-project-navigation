const data = "data-app-action-sidebar-";
const attr = (element, name) => element.getAttribute(data + name);
const selector = (name) => `[${data + name}]`;

export const sidebarSelector = selector("scroll");
export const projectsSectionSelector = `${selector("section")}[${data}section-heading="Projects"]`;
const recentsSectionSelector = `${selector("section")}[${data}section-heading="Recents"]`;
export const observedAttributes = [
  "project-id", "project-label", "project-collapsed", "project-list-id", "section-heading",
  "thread-id", "thread-title", "thread-selected",
  "thread-host-id", "thread-kind", "project-show-all",
].map((name) => data + name).concat("data-sidebar-indicator", "aria-disabled", "aria-haspopup", "disabled");
const runningIndicator = '[role="status"] :is([class~="motion-safe:animate-spin"], [class~="animate-spin"])';
const projectIndicator = '[class*="--sidebar-row-indicator-visibility"]';
const unreadIndicator = '[data-sidebar-indicator="unread"]';
const unreadDot = ".size-2.rounded-full.bg-accent";
const attentionKinds = new Set(["input", "approval", "error"]);
const nativeActivityLabels = /^(?:活动视图|查看活动(?:[，,].*)?|活动檢視|活動檢視|查看活動(?:[，,].*)?|Activity view|View activity(?:,.*)?)$/i;
const newChatLabel = /^(?:新聊天|新对话|新建聊天|新對話|New chat|New conversation)$/i;
const projectChatLabel = /^(?:在\s*.+\s*中(?:开始|新建|建立|启动)新?(?:聊天|对话|對話)|在\s*.+\s*中開始新(?:聊天|對話)|(?:start|create|open)(?: a)? new (?:chat|conversation) in .+|new (?:chat|conversation) in .+)$/i;

export function nativeCreateProjectButton(sidebar) {
  return sidebar?.querySelector(`${projectsSectionSelector} ${selector("project-create")}`);
}

export function nativeActivityButton() {
  return Array.from(document.querySelectorAll("button[aria-label]")).find((button) =>
    nativeActivityLabels.test(button.getAttribute("aria-label")) && button.getClientRects().length
  );
}

export function isGlobalCodexNewChat(target, sidebar) {
  const button = target instanceof Element ? target.closest("button") : null;
  if (!button?.closest("[data-codex-tab-conversation-drop-target]")) return false;
  if (button.disabled || button.getAttribute("aria-disabled") === "true") return false;
  const nav = button.closest("nav");
  if (!sidebar || !nav?.contains(sidebar) || !newChatLabel.test(
    (button.getAttribute("aria-label") || button.textContent).trim()
  )) return false;
  return Array.from(nav.querySelectorAll('button[aria-haspopup="menu"]')).some((entry) =>
    entry.textContent.trim() === "Codex" || /[：:]\s*Codex\s*$/i.test(entry.getAttribute("aria-label") ?? "")
  );
}

export function isStatusStyleChange(element) {
  return Boolean(element.closest(`[role="status"], ${projectIndicator}`));
}

function nativeButton(row) {
  if (row.matches('button, a[href], [role="button"], [role="link"]')) return row;
  return row.querySelector('button:not([aria-hidden="true"]), a[href], [role="button"], [role="link"]');
}

function readThread(row) {
  const id = attr(row, "thread-id");
  const title = attr(row, "thread-title") || row.getAttribute("aria-label");
  const button = nativeButton(row);
  if (!id || !title || !button) return null;
  const indicator = row.getAttribute("data-sidebar-indicator");

  return {
    key: JSON.stringify([attr(row, "thread-kind"), attr(row, "thread-host-id"), id]),
    title,
    attention: attentionKinds.has(indicator),
    running: indicator === "working" || row.querySelector(runningIndicator) !== null,
    unread: row.matches(unreadIndicator),
    selected: attr(row, "thread-selected") === "true",
    button,
  };
}

function readThreads(container) {
  const threads = new Map();
  for (const row of container?.querySelectorAll(selector("thread-row")) ?? []) {
    const thread = readThread(row);
    if (thread && !threads.has(thread.key)) threads.set(thread.key, thread);
  }
  return threads;
}

export function readRecents(sidebar) {
  const section = sidebar?.querySelector(recentsSectionSelector) ?? null;
  return { section, threads: readThreads(section) };
}

function projectMoreButton(list) {
  if (!list) return null;
  const marked = list.querySelector(selector("project-show-all-toggle"));
  if (marked && attr(list, "project-show-all") !== "true") return marked;
  return Array.from(list.querySelectorAll("button[aria-expanded]")).find((button) =>
    !button.closest(selector("thread-row")) &&
    /^(?:Show more(?: chats)?|Load more(?: chats)?|显示更多(?:会话|聊天)?|加载更多(?:会话|聊天)?|顯示更多(?:對話|聊天)?|載入更多(?:對話|聊天)?)$/i.test(button.textContent.trim())
  ) ?? null;
}

export function readSidebar(sidebar) {
  const projects = new Map();
  const lists = new Map();
  for (const list of sidebar.querySelectorAll(selector("project-list-id"))) {
    const id = attr(list, "project-list-id");
    if (!lists.has(id) || list.querySelector(selector("thread-row"))) lists.set(id, list);
  }

  for (const row of sidebar.querySelectorAll(selector("project-row"))) {
    const id = attr(row, "project-id");
    const title = attr(row, "project-label");
    if (!id || !title || projects.has(id)) continue;

    const list = lists.get(id);
    const threads = readThreads(list);
    projects.set(id, {
      id,
      title,
      threads,
      unread: Boolean(row.querySelector(`${projectIndicator} ${unreadDot}`))
        || Array.from(threads.values()).some((thread) => thread.unread),
      expand: attr(row, "project-collapsed") === "true" ? nativeButton(row) : null,
      more: projectMoreButton(list),
      menu: row.querySelector('button[aria-haspopup="menu"]:not([disabled], [aria-disabled="true"])'),
      newChat: Array.from(row.querySelectorAll("button[aria-label]")).find((button) =>
        projectChatLabel.test(button.getAttribute("aria-label")) &&
        !button.disabled && button.getAttribute("aria-disabled") !== "true"
      ) ?? null,
    });
  }
  return projects;
}

export function threadRowsSnapshot(threads) {
  return Array.from(threads.values(), ({ key, title, attention, running, unread, selected }) => [
    key, title, attention, running, unread, selected,
  ]);
}

export function sidebarSignature(projects) {
  return JSON.stringify(Array.from(projects.values(), (project) => [
    project.id, project.title, Boolean(project.expand), Boolean(project.more),
    Boolean(project.newChat), Boolean(project.menu), project.unread,
    threadRowsSnapshot(project.threads),
  ]));
}
