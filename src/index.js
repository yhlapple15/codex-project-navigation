import {
  isGlobalCodexNewChat,
  isStatusStyleChange,
  nativeActivityButton,
  nativeCreateProjectButton,
  observedAttributes,
  projectsSectionSelector,
  readRecents,
  readSidebar,
  sidebarSelector,
  sidebarSignature,
  threadRowsSnapshot,
} from "./sidebar.js";
import { createInlineActivity, hasInlineActivity } from "./inline-activity.js";
import { openProjectMenu } from "./project-menu.js";
import "./style.css";

const storageKey = "ct-project-tree.preferences.v1";
const hideNativeMarker = "data-codex-tweaks-project-tree-hide-native";
const projectPageSize = 5;
const defaultState = () => ({ folders: [], placements: {}, expanded: {} });

function loadState() {
  try {
    const state = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(state?.folders) && state.placements && state.expanded) return state;
  } catch {
    // Local storage may be unavailable in the renderer.
  }
  return defaultState();
}

function element(tag, className, label) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (label) node.textContent = label;
  return node;
}

function button(label, className, action) {
  const node = element("button", className, label);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}

function option(value, label) {
  const node = element("option", "", label);
  node.value = value;
  return node;
}

function unreadBadge(label) {
  const badge = element("span", "ctpt-unread");
  badge.setAttribute("role", "img");
  badge.setAttribute("aria-label", label);
  badge.title = label;
  return badge;
}

const iconPaths = {
  folder: ["M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z", "M3 10h18"],
  openFolder: ["M3 17V7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2", "M5 19h13a2 2 0 0 0 1.9-1.4L22 11H7L4 17a1.4 1.4 0 0 0 1 2Z"],
  chevron: ["m8 10 4 4 4-4"],
  more: ["M5 12h.01M12 12h.01M19 12h.01"],
  plus: ["M12 5v14M5 12h14"],
};

function icon(name) {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", name === "more" ? "3" : "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("class", "ctpt-icon ctpt-icon-" + name);
  for (const shape of iconPaths[name]) {
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("d", shape);
    svg.append(path);
  }
  return svg;
}

export function activate({ onCleanup }) {
  const state = loadState();
  const panel = element("section", "ctpt-panel");
  panel.setAttribute("data-codex-tweaks-project-tree", "");
  panel.setAttribute("aria-label", "项目导航");
  const activityPanel = element("section", "ctpt-panel");
  activityPanel.setAttribute("data-codex-tweaks-recent-activity", "");
  activityPanel.setAttribute("aria-label", "最近活动");
  const activityHeading = element("div", "ctpt-heading");
  const activityTitle = element("h2");
  const activityList = element("div", "ctpt-activity-list");
  const activityToggle = button("最近活动", "ctpt-section-toggle", () => {
    activityList.hidden = !activityList.hidden;
    activityToggle.setAttribute("aria-expanded", String(!activityList.hidden));
    state.expanded.recentActivity = !activityList.hidden;
    save();
  });
  activityToggle.append(icon("chevron"));
  activityList.hidden = state.expanded.recentActivity === false;
  activityToggle.setAttribute("aria-expanded", String(!activityList.hidden));
  activityTitle.append(activityToggle);
  const openNativeActivity = button("原版", "ctpt-small", () => {
    invoke(nativeActivityButton, "请用 Ctrl+Alt+U 打开原生活动视图", activityStatus);
  });
  openNativeActivity.title = "打开原生活动视图";
  openNativeActivity.setAttribute("aria-label", openNativeActivity.title);
  activityHeading.append(activityTitle, openNativeActivity);
  const activityStatus = element("div", "ctpt-status");
  activityStatus.setAttribute("role", "status");
  activityPanel.append(activityHeading, activityList, activityStatus);

  const heading = element("div", "ctpt-heading");
  const title = element("h2", "");
  const tree = element("div", "ctpt-tree");
  const organizer = element("div", "ctpt-organizer");
  organizer.hidden = true;
  const toggle = button("项目导航", "ctpt-section-toggle", () => {
    tree.hidden = !tree.hidden;
    toggle.setAttribute("aria-expanded", String(!tree.hidden));
    state.expanded.navigation = !tree.hidden;
    save();
  });
  toggle.append(icon("chevron"));
  tree.hidden = state.expanded.navigation === false;
  toggle.setAttribute("aria-expanded", String(!tree.hidden));
  title.append(toggle);
  const createProject = button("", "ctpt-icon-button ctpt-header-add", () => {
    invoke(() => nativeCreateProjectButton(sidebar), "原生新建项目入口暂不可用");
  });
  createProject.append(icon("plus"));
  createProject.title = "新建项目";
  createProject.setAttribute("aria-label", createProject.title);
  createProject.hidden = true;
  const edit = button("", "ctpt-icon-button ctpt-organizer-toggle", () => {
    organizer.hidden = !organizer.hidden;
    edit.setAttribute("aria-expanded", String(!organizer.hidden));
  });
  edit.append(icon("more"));
  edit.title = "整理项目导航";
  edit.setAttribute("aria-label", edit.title);
  edit.setAttribute("aria-expanded", "false");
  heading.append(title, createProject, edit);
  const status = element("div", "ctpt-status");
  status.setAttribute("role", "status");
  panel.append(heading, organizer, tree, status);

  const folderName = element("input");
  folderName.placeholder = "分组名称";
  folderName.setAttribute("aria-label", "分组名称");
  folderName.maxLength = 50;
  folderName.required = true;
  const parent = element("select");
  parent.setAttribute("aria-label", "上级分组");
  const folderForm = element("form", "ctpt-form");
  const add = element("button", "ctpt-small", "新建分组");
  add.type = "submit";
  folderForm.append(folderName, parent, add);
  const projectSelect = element("select");
  projectSelect.setAttribute("aria-label", "要移动的项目");
  const destination = element("select");
  destination.setAttribute("aria-label", "移入分组");
  const move = button("移动项目", "ctpt-small", () => {
    if (!projects.has(projectSelect.value)) return;
    change(() => {
      state.placements[projectSelect.value] = destination.value;
      if (destination.value) state.expanded["folder:" + destination.value] = true;
    });
  });
  const moveForm = element("div", "ctpt-form");
  moveForm.append(projectSelect, destination, move);
  const manageFolder = element("select");
  manageFolder.setAttribute("aria-label", "要管理的分组");
  const renameInput = element("input");
  renameInput.setAttribute("aria-label", "新的分组名称");
  renameInput.placeholder = "新的分组名称";
  renameInput.maxLength = 50;
  renameInput.required = true;
  const rename = element("button", "ctpt-small", "重命名");
  rename.type = "submit";
  const manageForm = element("form", "ctpt-form");
  const remove = button("移除分组", "ctpt-small", () => {
    const folder = state.folders.find(({ id }) => id === manageFolder.value);
    if (!folder) return;
    change(() => {
      for (const child of state.folders) {
        if (child.parent === folder.id) child.parent = folder.parent;
      }
      for (const id of Object.keys(state.placements)) {
        if (state.placements[id] === folder.id) state.placements[id] = folder.parent;
      }
      state.folders = state.folders.filter(({ id }) => id !== folder.id);
      delete state.expanded["folder:" + folder.id];
    });
  });
  manageForm.append(manageFolder, renameInput, rename, remove);
  manageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const folder = state.folders.find(({ id }) => id === manageFolder.value);
    const name = renameInput.value.trim();
    if (!folder || !name || name === folder.name) return;
    if (state.folders.some((item) => item.parent === folder.parent && item.name === name)) {
      status.textContent = "这一层已有同名分组";
      return;
    }
    change(() => {
      folder.name = name;
      renameInput.value = name;
    });
  });
  manageFolder.addEventListener("change", updateFolderActions);
  const hideNative = element("input");
  hideNative.type = "checkbox";
  hideNative.checked = state.hideNativeProjects === true;
  hideNative.disabled = true;
  const hideNativeLabel = element("label", "ctpt-visibility");
  hideNativeLabel.append(hideNative, document.createTextNode("隐藏原生项目列表"));
  hideNative.addEventListener("change", () => {
    state.hideNativeProjects = hideNative.checked;
    save();
    syncNativeVisibility();
  });
  const activityMode = element("input");
  activityMode.type = "checkbox";
  activityMode.checked = state.recentActivity === true;
  const activityModeLabel = element("label", "ctpt-visibility");
  activityModeLabel.append(activityMode, document.createTextNode("最近按活动状态分组"));
  activityMode.addEventListener("change", () => {
    state.recentActivity = activityMode.checked;
    save();
    syncActivity();
  });
  const standaloneMode = element("input");
  standaloneMode.type = "checkbox";
  standaloneMode.checked = state.standaloneTopChat !== false;
  const standaloneLabel = element("label", "ctpt-visibility");
  standaloneLabel.append(standaloneMode, document.createTextNode("顶部新聊天使用独立对话"));
  standaloneMode.addEventListener("change", () => {
    state.standaloneTopChat = standaloneMode.checked;
    save();
  });
  organizer.append(folderForm, moveForm, manageForm, hideNativeLabel, activityModeLabel, standaloneLabel);

  let sidebar = null;
  let projects = new Map();
  let signature = null;
  let frame = null;
  let hiddenNativeSection = null;
  let hiddenRecentsSection = null;
  let activitySignature = null;
  const projectLimits = new Map();
  const inlineActivity = createInlineActivity();

  function syncActivity() {
    const { section, threads } = readRecents(sidebar);
    activityMode.disabled = !section;
    const nativeTimeline = hasInlineActivity(sidebar);
    const next = nativeTimeline || (activityMode.checked && threads.size > 0) ? section : null;
    if (hiddenRecentsSection !== next) {
      hiddenRecentsSection?.removeAttribute(hideNativeMarker);
      hiddenRecentsSection = next;
      next?.setAttribute(hideNativeMarker, "");
    }
    if (!next || nativeTimeline) {
      activityPanel.remove();
      activitySignature = null;
      return;
    }
    openNativeActivity.hidden = !nativeActivityButton();
    if (activityPanel.nextElementSibling !== next) next.before(activityPanel);
    const snapshot = JSON.stringify(threadRowsSnapshot(threads));
    if (activitySignature === snapshot) return;
    activitySignature = snapshot;

    const groups = [
      ["待处理", []],
      ["未读", []],
      ["运行中", []],
      ["最近", []],
    ];
    for (const thread of threads.values()) {
      const group = thread.attention ? 0 : thread.unread ? 1 : thread.running ? 2 : 3;
      groups[group][1].push(thread);
    }
    const focusKey = activityList.contains(document.activeElement) ? document.activeElement.dataset.focusKey : null;
    const fragment = document.createDocumentFragment();
    let nextFocus;
    for (const [label, items] of groups) {
      if (!items.length) continue;
      const group = element("div", "ctpt-activity-group");
      group.append(element("h3", "ctpt-activity-label", label));
      for (const thread of items) {
        const row = threadButton(thread, thread.key, () => {
          invoke(() => readRecents(sidebar).threads.get(thread.key)?.button, "会话已移出最近列表", activityStatus);
        });
        group.append(row);
        if (thread.key === focusKey) nextFocus = row;
      }
      fragment.append(group);
    }
    activityList.replaceChildren(fragment);
    nextFocus?.focus({ preventScroll: true });
  }

  function syncNativeVisibility() {
    const section = panel.isConnected ? sidebar?.querySelector(projectsSectionSelector) : null;
    hideNative.disabled = !section;
    const next = hideNative.checked ? section ?? null : null;
    if (hiddenNativeSection !== next) {
      hiddenNativeSection?.removeAttribute(hideNativeMarker);
      hiddenNativeSection = next;
      hiddenNativeSection?.setAttribute(hideNativeMarker, "");
    }
  }

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      status.textContent = "";
    } catch {
      status.textContent = "当前设置仅在本次运行中生效";
    }
  }

  function change(update) {
    update();
    save();
    renderOrganizer();
    renderTree();
  }

  folderForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = folderName.value.trim();
    if (!name) return;
    const parentId = parent.value;
    if (state.folders.some((folder) => folder.parent === parentId && folder.name === name)) {
      status.textContent = "这一层已有同名分组";
      return;
    }
    change(() => {
      const id = crypto.randomUUID();
      state.folders.push({ id, name, parent: parentId });
      state.expanded["folder:" + id] = true;
      if (parentId) state.expanded["folder:" + parentId] = true;
      folderName.value = "";
    });
  });

  function renderOrganizer() {
    const folderOptions = (rootLabel) => {
      const options = [option("", rootLabel)];
      function append(parentId, prefix) {
        for (const folder of state.folders.filter((item) => item.parent === parentId)) {
          const path = prefix + folder.name;
          options.push(option(folder.id, path));
          append(folder.id, path + " / ");
        }
      }
      append("", "");
      return options;
    };
    for (const [select, options] of [
      [parent, folderOptions("顶层分组")],
      [destination, folderOptions("顶层项目")],
      [manageFolder, folderOptions("管理已有分组")],
      [projectSelect, Array.from(projects.values(), ({ id, title }) => option(id, title))],
    ]) {
      const selected = select.value;
      select.replaceChildren(...options);
      if (options.some(({ value }) => value === selected)) select.value = selected;
    }
    updateFolderActions();
    move.disabled = projects.size === 0;
  }

  function updateFolderActions() {
    const folder = state.folders.find(({ id }) => id === manageFolder.value);
    const id = folder?.id ?? "";
    if (renameInput.dataset.folderId !== id) {
      renameInput.dataset.folderId = id;
      renameInput.value = folder?.name ?? "";
    }
    renameInput.disabled = rename.disabled = remove.disabled = !folder;
  }

  function branch(key, label, kind) {
    const details = element("details", "ctpt-" + kind);
    details.open = state.expanded[key] ?? false;
    const summary = element("summary", "ctpt-row");
    const leading = element("span", "ctpt-leading");
    leading.append(icon("folder"), icon("openFolder"));
    summary.append(icon("chevron"), leading, element("span", "ctpt-label", label));
    summary.title = label;
    summary.dataset.focusKey = key;
    const children = element("div", "ctpt-children");
    details.append(summary, children);
    summary.addEventListener("click", () => {
      state.expanded[key] = !details.open;
      save();
    });
    return { details, children, summary };
  }

  function invoke(getTarget, missingMessage, feedback = status) {
    const target = getTarget();
    if (target?.isConnected && typeof target.click === "function") {
      target.click();
      feedback.textContent = "";
      return;
    }
    feedback.textContent = missingMessage;
    queueRefresh();
  }

  function threadButton(thread, focusKey, action) {
    const row = button("", "ctpt-row ctpt-thread", action);
    row.append(element("span", "ctpt-label", thread.title));
    row.title = thread.title;
    row.dataset.focusKey = focusKey;
    if (thread.selected) row.setAttribute("aria-current", "true");
    if (thread.running) {
      const running = element("span", "ctpt-running");
      running.setAttribute("role", "img");
      running.setAttribute("aria-label", "运行中");
      row.append(running);
    } else if (thread.unread) {
      row.append(unreadBadge("会话有未读更新"));
    }
    return row;
  }

  function projectBranch(project) {
    const { details, children, summary } = branch("project:" + project.id, project.title, "project");
    if (project.unread) summary.append(unreadBadge("项目有未读会话"));
    summary.addEventListener("click", () => {
      if (details.open) return;
      const collapsed = currentProject(project.id)?.expand;
      if (collapsed?.isConnected) collapsed.click();
    });
    const limit = projectLimits.get(project.id) ?? projectPageSize;
    const loaded = Array.from(project.threads.values());
    for (const thread of loaded.slice(0, limit)) {
      const row = threadButton(thread, JSON.stringify([project.id, thread.key]), () => {
        invoke(() => currentProject(project.id)?.threads.get(thread.key)?.button, "会话暂未加载，请展开原项目后重试");
      });
      children.append(row);
    }
    if (project.expand && !loaded.length) {
      children.append(button("加载项目会话", "ctpt-small ctpt-action", () => {
        invoke(() => currentProject(project.id)?.expand, "原项目暂不可展开");
      }));
    } else if (loaded.length > limit || project.more) {
      children.append(button("显示更多会话", "ctpt-small ctpt-action", () => {
        const current = currentProject(project.id);
        if (!current) return;
        const next = Math.max(projectPageSize, Math.min(limit, current.threads.size) + projectPageSize);
        projectLimits.set(project.id, next);
        if (current.threads.size < next && current.more?.getAttribute("aria-disabled") !== "true") {
          current.more?.click();
        }
        renderTree();
      }));
    } else if (!project.threads.size) {
      children.append(element("div", "ctpt-empty", "暂无可显示的会话"));
    }
    if (!project.newChat && !project.menu) return details;

    const shell = element("div", "ctpt-project-shell");
    const actions = element("div", "ctpt-project-actions");
    if (project.newChat) {
      const start = button("", "ctpt-icon-button", () => {
        invoke(() => currentProject(project.id)?.newChat, "原生项目的新聊天入口暂不可用");
      });
      start.append(icon("plus"));
      start.title = `在 ${project.title} 中开始新聊天`;
      start.setAttribute("aria-label", start.title);
      start.dataset.focusKey = JSON.stringify(["new", project.id]);
      actions.append(start);
    }
    if (project.menu) {
      const menu = button("", "ctpt-icon-button", async (event) => {
        const nativeMenu = currentProject(project.id)?.menu;
        if (!nativeMenu?.isConnected) {
          status.textContent = "原生项目菜单暂不可用";
          return;
        }
        try {
          await openProjectMenu(nativeMenu, event.currentTarget);
        } catch (error) {
          console.warn("Codex 项目菜单打开失败", error);
          status.textContent = "项目菜单暂不可用";
        }
      });
      menu.append(icon("more"));
      menu.title = `${project.title} 的项目操作`;
      menu.setAttribute("aria-label", menu.title);
      menu.setAttribute("aria-haspopup", "menu");
      menu.dataset.focusKey = JSON.stringify(["menu", project.id]);
      actions.append(menu);
    }
    if (actions.childElementCount === 2) shell.classList.add("ctpt-two-actions");
    shell.append(details, actions);
    return shell;
  }

  function currentProject(id) {
    if (!sidebar?.isConnected) return null;
    return readSidebar(sidebar).get(id);
  }

  function renderTree() {
    const active = tree.contains(document.activeElement) ? document.activeElement.dataset.focusKey : null;
    const fragment = document.createDocumentFragment();
    const folderIds = new Set(state.folders.map(({ id }) => id));

    function append(container, folderId) {
      let unread = false;
      for (const folder of state.folders.filter(({ parent }) => parent === folderId)) {
        const { details, children, summary } = branch("folder:" + folder.id, folder.name, "folder");
        if (append(children, folder.id)) {
          summary.append(unreadBadge("分组有未读会话"));
          unread = true;
        }
        if (!children.childElementCount) children.append(element("div", "ctpt-empty", "空分组"));
        container.append(details);
      }
      for (const project of projects.values()) {
        const placement = state.placements[project.id];
        if ((folderIds.has(placement) ? placement : "") === folderId) {
          container.append(projectBranch(project));
          unread ||= project.unread;
        }
      }
      return unread;
    }

    append(fragment, "");
    tree.replaceChildren(fragment);
    if (active) {
      Array.from(tree.querySelectorAll("[data-focus-key]"))
        .find(({ dataset }) => dataset.focusKey === active)?.focus({ preventScroll: true });
    }
  }

  function refresh() {
    sidebar = Array.from(document.querySelectorAll(sidebarSelector))
      .find((candidate) => candidate.getClientRects().length && !candidate.closest("[hidden]"));
    inlineActivity.attach(sidebar);
    const nativeCreate = nativeCreateProjectButton(sidebar);
    createProject.hidden = !nativeCreate;
    createProject.disabled = Boolean(nativeCreate?.disabled || nativeCreate?.getAttribute("aria-disabled") === "true");
    syncActivity();
    projects = sidebar ? readSidebar(sidebar) : new Map();
    if (!projects.size) {
      panel.remove();
      syncNativeVisibility();
      signature = null;
      return;
    }

    const nextSignature = sidebarSignature(projects);
    if (nextSignature !== signature) {
      signature = nextSignature;
      renderOrganizer();
      renderTree();
    }
    if (panel.parentElement !== sidebar) sidebar.prepend(panel);
    syncNativeVisibility();
  }

  function queueRefresh() {
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      refresh();
    });
  }

  function touchesSidebar({ target, addedNodes, removedNodes, attributeName }) {
    if (panel.contains(target) || activityPanel.contains(target)) return false;
    if (attributeName === "class" && !isStatusStyleChange(target)) return false;
    if (sidebar?.contains(target)) return true;
    return [...addedNodes, ...removedNodes].some((node) => node instanceof Element &&
      (node.matches(sidebarSelector) || node.querySelector(sidebarSelector)));
  }

  const observer = new MutationObserver((records) => {
    if (records.some(touchesSidebar)) queueRefresh();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [...observedAttributes, "class"],
  });
  function openStandaloneChat(event) {
    if (!standaloneMode.checked || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey ||
      !window.electronBridge || !isGlobalCodexNewChat(event.target, sidebar)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // This native Codex command opens the composer with activeProject set to null.
    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      origin: window.location.origin,
      data: { type: "new-projectless-task" },
    }));
  }
  document.addEventListener("click", openStandaloneChat, true);
  window.addEventListener("resize", queueRefresh);
  onCleanup(() => {
    observer.disconnect();
    window.removeEventListener("resize", queueRefresh);
    document.removeEventListener("click", openStandaloneChat, true);
    if (frame !== null) cancelAnimationFrame(frame);
    panel.remove();
    syncNativeVisibility();
    activityPanel.remove();
    hiddenRecentsSection?.removeAttribute(hideNativeMarker);
    inlineActivity.restore();
  });
  refresh();
}
