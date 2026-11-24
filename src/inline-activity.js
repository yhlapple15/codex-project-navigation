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

function recentProjectSection(fiber) {
  for (let parent = fiber.return; parent; parent = parent.return) {
    if (!("priorityFilterEntrypoint" in (parent.memoizedProps ?? {}))) continue;
    // React's compiled sidebar keeps the last regular section tree when Activity is open.
    for (const candidate of [parent, parent.alternate]) {
      for (const slots of candidate?.updateQueue?.memoCache?.data ?? []) {
        for (const value of slots) {
          if (!Array.isArray(value)) continue;
          const node = codexSection(value, "unified");
          if (node && "catalogPageScope" in node.props) return node;
        }
      }
    }
    break;
  }
  return null;
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
    const fiber = sidebarFiber(sidebar);
    if (!fiber || !("elementType" in fiber)) return;
    const nodes = fiber.memoizedProps.sidebarSectionNodes;
    const regular = codexSection(nodes, "unified");
    const activity = codexSection(nodes, "priority");
    if (!regular && !activity) {
      restore();
      return;
    }

    if (!binding || !binding.fibers.has(fiber)) {
      restore();
      const original = fiber.type;
      const current = {
        sidebar,
        original,
        active: true,
        fibers: new Set([fiber, fiber.alternate].filter(Boolean)),
        regular: regular ?? recentProjectSection(fiber),
      };
      current.wrapper = function projectTreeInlineActivity(props, ...rest) {
        const sections = props.sidebarSectionNodes;
        if (!current.active || !Array.isArray(sections)) {
          return Reflect.apply(original, this, [props, ...rest]);
        }
        const normal = codexSection(sections, "unified");
        const priority = codexSection(sections, "priority");
        if (normal) current.regular = normal;
        if (!priority || !current.regular) return Reflect.apply(original, this, [props, ...rest]);

        const host = {
          ...current.regular,
          type: "div",
          key: "ctpt-inline-projects",
          props: {
            [projectHostMarker]: "",
            style: { display: "contents" },
            children: current.regular,
          },
        };
        return Reflect.apply(original, this, [{
          ...props,
          sidebarSectionNodes: sections.flatMap((node) => node === priority ? [host, node] : [node]),
        }, ...rest]);
      };
      binding = current;
    } else {
      binding.sidebar = sidebar;
      if (regular) binding.regular = regular;
    }
    for (const candidate of [fiber, fiber.alternate]) {
      if (candidate?.type !== binding.original) continue;
      binding.fibers.add(candidate);
      candidate.type = binding.wrapper;
    }
  }

  return { attach, restore };
}
