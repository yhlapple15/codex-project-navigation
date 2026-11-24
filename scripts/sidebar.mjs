import { readFile } from "node:fs/promises";

const endpoint = "http://127.0.0.1:9335";
const runtimeKey = "__CODEX_PROJECT_NAVIGATION__";
const action = process.argv[2] ?? "status";
const root = new URL("../", import.meta.url);

async function evaluate(expression) {
  const response = await fetch(endpoint + "/json/list", {
    redirect: "error",
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw Error("无法读取本机 Codex 调试连接。");
  const targets = (await response.json()).filter(({ type, url }) =>
    type === "page" && /^app:\/\/-\/index\.html(?:[?#]|$)/.test(url)
  );
  if (targets.length !== 1) throw Error("找不到唯一的 Codex 主窗口。");
  const url = new URL(targets[0].webSocketDebuggerUrl);
  if (url.origin !== "ws://127.0.0.1:9335" || !/^\/devtools\/page\/[a-z\d-]+$/i.test(url.pathname) ||
      url.username || url.password || url.search || url.hash) {
    throw Error("Codex 调试连接地址与预期不符。");
  }

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => finish(Error("Codex 响应超时。")), 5000);
    function finish(error, value) {
      clearTimeout(timer);
      socket.close();
      if (error) reject(error);
      else resolve(value);
    }
    socket.addEventListener("open", () => socket.send(JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: { expression, returnByValue: true },
    })), { once: true });
    socket.addEventListener("error", () => finish(Error("本机 Codex 调试连接失败。")), { once: true });
    socket.addEventListener("message", ({ data }) => {
      const reply = JSON.parse(data);
      if (reply.id !== 1) return;
      if (reply.error || reply.result?.exceptionDetails) {
        finish(Error(reply.result?.exceptionDetails?.exception?.description ?? reply.error?.message ?? "加载失败。"));
      } else {
        finish(null, reply.result.result.value);
      }
    });
  });
}

function inspect(key) {
  const panel = document.querySelector("[data-codex-tweaks-project-tree]");
  return {
    version: globalThis[key]?.version ?? null,
    codexTweaksActive: Boolean(globalThis.__CODEX_TWEAKS__),
    sidebarVisible: Boolean(panel?.getClientRects().length),
    topLevelGroupTint: Boolean(panel?.querySelector(".ctpt-tree > .ctpt-folder")),
    projectCreate: Boolean(panel?.querySelector(".ctpt-header-add:not([hidden])")),
    projectMenus: panel?.querySelectorAll('.ctpt-project-actions [aria-haspopup="menu"]').length ?? 0,
  };
}

function remove(key) {
  globalThis[key]?.cleanup();
  return inspect(key);
}

async function apply() {
  const [javascript, css, manifest] = await Promise.all([
    readFile(new URL("dist/sidebar.js", root), "utf8"),
    readFile(new URL("dist/sidebar.css", root), "utf8"),
    readFile(new URL("package.json", root), "utf8").then(JSON.parse),
  ]);
  const expression = `(() => {
    const inspect = ${inspect.toString()};
    const key = ${JSON.stringify(runtimeKey)};
    const version = ${JSON.stringify(manifest.version)};
    if (!document.querySelector("[data-app-action-sidebar-scroll]")) throw Error("Codex 侧栏尚未就绪。");
    const module = { exports: {} };
    (function(module, exports) {
      ${javascript}
    })(module, module.exports);
    if (typeof module.exports.activate !== "function") throw Error("找不到项目导航入口。");
    globalThis[key]?.cleanup();
    const old = globalThis.__CODEX_TWEAKS__;
    if (typeof old?.cleanup === "function") old.cleanup();
    const style = document.createElement("style");
    style.setAttribute("data-codex-project-navigation-style", "");
    style.textContent = ${JSON.stringify(css)};
    document.head.append(style);
    const callbacks = [];
    const runtime = {
      version,
      cleanup() {
        for (const fn of callbacks.splice(0).reverse()) fn();
        style.remove();
        if (globalThis[key] === runtime) delete globalThis[key];
      },
    };
    globalThis[key] = runtime;
    try {
      module.exports.activate({ onCleanup: (fn) => callbacks.push(fn) });
      return inspect(key);
    } catch (error) {
      runtime.cleanup();
      throw error;
    }
  })()`;
  return evaluate(expression);
}

try {
  let result;
  if (action === "apply") result = await apply();
  else if (action === "remove") {
    result = await evaluate(`(() => { const inspect = ${inspect.toString()}; return (${remove.toString()})(${JSON.stringify(runtimeKey)}); })()`);
  } else if (action === "status") result = await evaluate(`(${inspect.toString()})(${JSON.stringify(runtimeKey)})`);
  else throw Error("用法：node scripts/sidebar.mjs apply|remove|status");
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.cause?.code === "ECONNREFUSED" ? "Codex 没有开启本机调试连接。" : error.message);
  process.exitCode = 1;
}
