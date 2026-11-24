param([switch]$AttachOnly)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$node = (Get-Command node.exe).Source
$loader = Join-Path $root 'scripts\sidebar.mjs'

if (!(Test-Path -LiteralPath (Join-Path $root 'dist\sidebar.js'))) {
    throw '请先在项目目录运行 npm ci 和 npm run build。'
}

if ($AttachOnly) {
    & $node $loader apply
    exit $LASTEXITCODE
}

function Get-CodexDebugTargets {
    try {
        Invoke-RestMethod -Uri 'http://127.0.0.1:9335/json/list' -TimeoutSec 2
    } catch {
        return $null
    }
}

$targets = Get-CodexDebugTargets
if (!$targets) {
    $package = Get-AppxPackage -Name 'OpenAI.Codex' | Select-Object -First 1
    if (!$package) {
        throw '找不到当前用户安装的 Microsoft Store 版 ChatGPT/Codex。'
    }
    $app = (Get-AppxPackageManifest -Package $package).Package.Applications.Application |
        Where-Object Id -eq 'App' | Select-Object -First 1
    if (!$app) { throw '找不到官方客户端的 Windows 启动入口。' }
    $executable = Join-Path $package.InstallLocation $app.Executable
    $running = Get-Process -Name 'ChatGPT' -ErrorAction SilentlyContinue |
        Where-Object Path -eq $executable
    if ($running) { throw '请从托盘完整退出当前 ChatGPT/Codex，再运行本脚本。' }

    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class CodexSidebarLauncher
{
    [ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IApplicationActivationManager
    {
        int ActivateApplication(
            [MarshalAs(UnmanagedType.LPWStr)] string appId,
            [MarshalAs(UnmanagedType.LPWStr)] string arguments,
            uint options, out uint processId);
    }

    public static void Launch(string appId, string arguments)
    {
        var type = Type.GetTypeFromCLSID(new Guid("45ba127d-10a8-46ea-8ab7-56ea9078943c"));
        var manager = (IApplicationActivationManager)Activator.CreateInstance(type);
        int result = manager.ActivateApplication(appId, arguments, 0, out _);
        Marshal.ThrowExceptionForHR(result);
    }
}
'@
    $appId = "$($package.PackageFamilyName)!$($app.Id)"
    [CodexSidebarLauncher]::Launch($appId,
        '--remote-debugging-address=127.0.0.1 --remote-debugging-port=9335 --remote-allow-origins=http://127.0.0.1:9335')
}

$lastResult = ''
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    $lastResult = & $node $loader apply 2>&1
    if ($LASTEXITCODE -eq 0) {
        $lastResult
        exit 0
    }
    Start-Sleep -Seconds 1
}
throw "没有加载项目导航。$lastResult"
