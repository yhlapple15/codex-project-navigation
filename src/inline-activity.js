const projectHostMarker = "data-codex-tweaks-inline-projects";
const activityList = '[role="list"][class~="@container/priority-list"]';

function sidebarFiber(element) {
  const key = Object.keys(element).find((name) => name.startsWith("__reactFiber$"));
  for (let fiber = key ? element[key] : null; fiber; fiber = fiber.return) {
    const props = fiber.memoizedProps;
    if (Array.isArray(props?.sidebarSectionNodes) && "sidebarRef" in props &&
      "hasStickySectionHeaders" in props && typeof fiber.type === "function") {
      return fiber;
    }
  }
  return null;
}

function codexSection(nodes, key) {
  return nodes.find((node) => node?.key === key && node.props?.sidebarMode === "codex" &&
    typeof node.type === "function");
}

function recentProjectSection(owner) {
  // React's compiled sidebar keeps the last regular section tree when Activity is open.
  for (const candidate of [owner, owner.alternate]) {
    for (const slots of candidate?.updateQueue?.memoCache?.data ?? []) {
      for (const value of slots) {
        if (!Array.isArray(value)) continue;
        const node = codexSection(value, "unified");
        if (node && "catalogPageScope" in node.props) return node;
      }
    }
  }
  return null;
}

function withProjectSection(node, binding) {
  if (Array.isArray(node)) {
    const updated = node.map((child) => withProjectSection(child, binding));
    return updated.some((child, index) => child !== node[index]) ? updated : node;
  }
  if (!node?.props) return node;
  const { props } = node;
  const sections = props.sidebarSectionNodes;
  if (node.type === binding.sidebarType && Array.isArray(sections)) {
    const regular = codexSection(sections, "unified");
    if (regular) binding.regular = regular;
    const priority = codexSection(sections, "priority");
    if (!priority || !binding.regular || regular) return node;
    const host = {
      ...binding.regular,
      type: "div",
      key: "ctpt-inline-projects",
      props: {
        [projectHostMarker]: "",
        style: { display: "contents" },
        children: binding.regular,
      },
    };
    return {
      ...node,
      props: {
        ...props,
        sidebarSectionNodes: sections.flatMap((section) => section === priority ? [host, section] : [section]),
      },
    };
  }
  const children = withProjectSection(props.children, binding);
  return children === props.children ? node : { ...node, props: { ...props, children } };
}

export function hasInlineActivity(sidebar) {
  return Boolean(sidebar?.querySelector(`[${projectHostMarker}]`) && sidebar.querySelector(activityList));
}

export function createInlineActivity() {
  let binding = null;

  function restore() {
    if (!binding) return;
    binding.active = false;
    const { fibers, original, wrapper, sidebar } = binding;
    for (const fiber of fibers) {
      if (fiber.type === wrapper) fiber.type = original;
    }
    for (const host of sidebar.querySelectorAll(`[${projectHostMarker}]`)) {
      // React owns these nodes and will remove them on its next native sidebar render.
      host.style.display = "none";
      host.removeAttribute(projectHostMarker);
    }
    binding = null;
  }

  function attach(sidebar) {
    if (!sidebar && !binding?.sidebar.isConnected) {
      restore();
      return;
    }
    if (!sidebar) return;
    const container = sidebarFiber(sidebar);
    if (!container) return;
    const nodes = container.memoizedProps.sidebarSectionNodes;
    const regular = codexSection(nodes, "unified");
    const activity = codexSection(nodes, "priority");
    if (!regular && !activity) {
      restore();
      return;
    }
    // Activity adds a provider above the scroll container and remounts it.
    // Patch its stable owner so the sections are composed before React mounts either view.
    let owner = container.return;
    while (owner && !("priorityFilterEntrypoint" in (owner.memoizedProps ?? {}))) owner = owner.return;
    if (typeof owner?.type !== "function" || typeof container.elementType !== "function") return;

    if (!binding || !binding.fibers.has(owner)) {
      restore();
      const original = owner.type;
      const current = {
        sidebar,
        sidebarType: container.elementType,
        original,
        active: true,
        fibers: new Set(),
        regular: regular ?? recentProjectSection(owner),
      };
      current.wrapper = function projectTreeInlineActivity(...args) {
        const result = Reflect.apply(original, this, args);
        return current.active ? withProjectSection(result, current) : result;
      };
      binding = current;
    } else {
      binding.sidebar = sidebar;
      if (regular) binding.regular = regular;
    }
    for (const candidate of [owner, owner.alternate]) {
      if (candidate?.type !== binding.original) continue;
      binding.fibers.add(candidate);
      candidate.type = binding.wrapper;
    }
  }

  return { attach, restore };
}
