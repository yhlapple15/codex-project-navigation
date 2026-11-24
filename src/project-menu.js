const chineseLabels = {
  "edit-project": "编辑项目…",
  "pin-project": "置顶项目",
  "unpin-project": "取消置顶",
  "move-to-custom-section": "移动到分区",
  "reveal-project-folder": "在文件资源管理器中打开",
  "mark-project-chats-read": "将会话全部标为已读",
  "archive-project-threads": "归档项目会话…",
  "remove-project": "移除项目…",
};

const copyPathId = "ctpt-copy-project-path";

function readProjectMenu(trigger) {
  const key = Object.keys(trigger).find((name) => name.startsWith("__reactFiber$"));
  const row = trigger.closest("[data-app-action-sidebar-project-row]");
  const projectId = row?.getAttribute("data-app-action-sidebar-project-id");
  let menuProps;
  let path;
  for (let fiber = key ? trigger[key] : null; fiber; fiber = fiber.return) {
    const props = fiber.memoizedProps;
    if (!menuProps && typeof props?.getContextMenuItems === "function" && "useNativeItemDescriptors" in props) {
      menuProps = props;
    }
    const project = props?.project;
    if (projectId && project?.projectId === projectId && typeof project.path === "string" && project.path.trim()) {
      path = project.path;
    }
    if ((menuProps && path) || (row && fiber.stateNode === row)) break;
  }
  return { menuProps, path };
}

export async function openProjectMenu(trigger, anchor) {
  const bridge = window.electronBridge;
  if (!bridge?.showContextMenu) {
    trigger.click();
    return;
  }
  const { menuProps, path } = readProjectMenu(trigger);
  const items = await menuProps?.getContextMenuItems();
  if (!items?.length) {
    trigger.click();
    return;
  }
  const actions = new Map();
  const chinese = /^(?:zh|cmn)(?:-|$)/i.test(document.documentElement.lang || navigator.language);
  function serialize(entries) {
    return entries.map((item) => {
      if (item.type === "separator") return { id: item.id, label: "", type: "separator" };
      const label = (chinese && chineseLabels[item.id]) ||
        item.message?.defaultMessage || item.message || item.id;
      actions.set(item.id, item);
      return {
        id: item.id,
        label: String(label).replace(/\{([^{}]+)\}/g, (match, key) => item.messageValues?.[key] ?? match),
        enabled: item.enabled !== false && item.type !== "label",
        role: item.nativeRole,
        type: item.type === "radio" ? "radio" : undefined,
        checked: item.type === "radio" ? Boolean(item.checked) : undefined,
        submenu: item.submenu?.length ? serialize(item.submenu) : undefined,
      };
    });
  }
  const bounds = anchor.getBoundingClientRect();
  const menuItems = serialize(items);
  if (path) {
    const copyItem = { id: copyPathId, label: chinese ? "复制项目路径" : "Copy project path", enabled: true };
    const revealIndex = menuItems.findIndex(({ id }) => id === "reveal-project-folder");
    menuItems.splice(revealIndex < 0 ? menuItems.length : revealIndex + 1, 0, copyItem);
  }
  const choice = await bridge.showContextMenu(menuItems, { x: bounds.left, y: bounds.bottom });
  if (choice?.id === copyPathId && path) {
    try {
      await navigator.clipboard.writeText(path);
      return "path-copied";
    } catch {
      return "path-copy-failed";
    }
  }
  const selected = actions.get(choice?.id);
  if (selected && selected.enabled !== false && !selected.nativeRole && trigger.isConnected) {
    await selected.onSelect?.();
  }
}
