# Codex Project Navigation

[简体中文](README.md) · [Releases](https://github.com/yhlapple15/codex-project-navigation/releases/latest) · [Report an issue](https://github.com/yhlapple15/codex-project-navigation/issues)

A customizable project tree for Codex on Windows. Organize existing projects in nested virtual folders while using Codex’s built-in project actions, conversations, and activity timeline. The standalone launcher requires no Codex Tweaks installation.

## Quick start

You’ll need the Microsoft Store edition of ChatGPT/Codex and [Node.js 22 or later](https://nodejs.org/en/download).

1. Download **Source code (zip)** from [Releases](https://github.com/yhlapple15/codex-project-navigation/releases/latest) and extract it, or clone this repository.
2. Quit Codex completely, including the system tray process.
3. Open PowerShell in the extracted directory and run the following commands.

```powershell
npm.cmd ci
npm.cmd run build
.\Start-CodexSidebar.ps1
```

For subsequent launches, run `.\Start-CodexSidebar.ps1` from the same directory. If the project tree is missing, switch to Codex mode and expand the built-in Projects section.

## What you can do

- Create and rename virtual folders without moving project directories.
- Expand a project to see its five most recent chats and load five more at a time.
- Start a chat in a specific project or use the top New chat button for an independent conversation.
- Open the built-in project menu, create a project, and see unread indicators on collapsed projects.
- Use **Copy project path** in the project’s **⋯** menu to copy its folder path to the clipboard.
- Hide the duplicate Projects list and show the activity timeline below your project groups.

## Update and remove

Download and extract the new release, then repeat the setup commands. If you cloned the repository, pull the latest `main`, run `npm.cmd ci` and `npm.cmd run build`, then run `npm.cmd run apply` in the open Codex session.

Run `npm.cmd run status` to check the loaded version and `npm.cmd run remove` to remove the sidebar changes from the current window. To stop the debugger session too, quit Codex completely and launch it normally from the Windows Start menu.

## Compatibility

This community project relies on internal sidebar components. A Codex update can require an adjustment. The sidebar structure was checked against Windows client package `26.1120.5083.0`.

The launcher opens a DevTools listener on `127.0.0.1:9335` for the current session. Other local processes can reach this port. The launcher leaves the installed application files and Windows security settings intact. Folder preferences are stored locally in Codex.

When reporting an issue, please include your Windows, Codex, and project navigation versions and steps to reproduce it. Redact project paths and chat contents from screenshots.
