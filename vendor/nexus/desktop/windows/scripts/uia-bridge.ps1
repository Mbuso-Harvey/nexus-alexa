param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("ListWindows", "DumpTree", "Click", "RightClick", "SendText", "SendHotkey", "Screenshot", "Focus", "WindowState")]
    [string]$Action,
    [string]$TitlePattern = "",
    [int]$ProcessId = 0,
    [string]$WindowHandle = "",
    [int]$MaxDepth = 8,
    [int]$MaxChildren = 250,
    [int]$X = 0,
    [int]$Y = 0,
    [string]$Text = "",
    [string]$WindowState = "Restore"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$win32TypeDef = @"
using System;
using System.Runtime.InteropServices;
public class Win32BridgeNative {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
}
"@
if (-not ([System.Management.Automation.PSTypeName]'Win32BridgeNative').Type) {
    Add-Type -TypeDefinition $win32TypeDef -ErrorAction SilentlyContinue
}

function Get-WindowList {
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
    $results = @()
    foreach ($w in $windows) {
        try {
            $cur = $w.Current
            if (-not [string]::IsNullOrWhiteSpace($cur.Name) -and -not $cur.IsOffscreen) {
                $rect = $cur.BoundingRectangle
                if ($rect.Width -gt 50 -and $rect.Height -gt 50) {
                    $pName = ""
                    try { $pName = ([System.Diagnostics.Process]::GetProcessById($cur.ProcessId)).ProcessName } catch {}
                    $results += [PSCustomObject]@{
                        windowId = "$($cur.NativeWindowHandle)"
                        title = $cur.Name
                        processName = $pName
                        processId = $cur.ProcessId
                        bounds = [ordered]@{
                            x = [Math]::Round($rect.Left)
                            y = [Math]::Round($rect.Top)
                            width = [Math]::Round($rect.Width)
                            height = [Math]::Round($rect.Height)
                        }
                    }
                }
            }
        } catch {}
    }
    $results | ConvertTo-Json -Depth 5 -Compress
}

function Get-UiaNodeHierarchy($element, [int]$depth, [int]$depthLimit) {
    if ($null -eq $element -or $depth -gt $depthLimit) { return $null }
    try {
        $cur = $element.Current
        # Skip Chromium D3D intermediate presentation surfaces which block cross-process COM
        if ($cur.ClassName -eq "Intermediate D3D Window") { return $null }

        $rect = $cur.BoundingRectangle
        $rectObj = $null
        if ($rect -and $rect.Width -gt 0 -and $rect.Height -gt 0) {
            $rectObj = [ordered]@{
                x = [Math]::Round($rect.Left); y = [Math]::Round($rect.Top)
                width = [Math]::Round($rect.Width); height = [Math]::Round($rect.Height)
            }
        }

        $node = [ordered]@{
            automationId = $cur.AutomationId
            name = $cur.Name
            controlType = $cur.ControlType.ProgrammaticName
            localizedControlType = $cur.LocalizedControlType
            className = $cur.ClassName
            isEnabled = $cur.IsEnabled
            isOffscreen = $cur.IsOffscreen
            processId = $cur.ProcessId
            frameworkId = $cur.FrameworkId
        }
        if ($null -ne $rectObj) { $node["boundingRectangle"] = $rectObj }

        $children = @()
        if ($depth -lt $depthLimit) {
            $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
            $child = $walker.GetFirstChild($element)
            $count = 0
            while ($null -ne $child -and $count -lt $MaxChildren) {
                $cNode = Get-UiaNodeHierarchy $child ($depth + 1) $depthLimit
                if ($null -ne $cNode) { $children += $cNode }
                $child = $walker.GetNextSibling($child)
                $count++
            }
        }
        if ($children.Count -gt 0) { $node["children"] = $children }
        return $node
    } catch { return $null }
}

function Find-TargetWindow {
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($w in $windows) {
        try {
            $cur = $w.Current
            if ($WindowHandle -ne "" -and "$($cur.NativeWindowHandle)" -eq $WindowHandle) { return $w }
            if ($ProcessId -gt 0 -and $cur.ProcessId -eq $ProcessId) { return $w }
            if ($TitlePattern -ne "" -and $cur.Name -like "*$TitlePattern*") { return $w }
        } catch {}
    }
    return $null
}

switch ($Action) {
    "ListWindows" { Get-WindowList }
    "DumpTree" {
        $win = Find-TargetWindow
        if ($null -eq $win) {
            Write-Error "Window not found matching TitlePattern='$TitlePattern', ProcessId=$ProcessId, WindowHandle='$WindowHandle'"
            exit 1
        }
        $hierarchy = Get-UiaNodeHierarchy $win 0 $MaxDepth
        $hierarchy | ConvertTo-Json -Depth 25 -Compress
    }
    "Screenshot" {
        Add-Type -AssemblyName System.Drawing
        Add-Type -AssemblyName System.Windows.Forms
        $win = Find-TargetWindow
        $rect = if ($win) { $win.Current.BoundingRectangle } else { [System.Windows.Forms.Screen]::PrimaryScreen.Bounds }
        $w = [Math]::Max(100, [Math]::Round($rect.Width))
        $h = [Math]::Max(100, [Math]::Round($rect.Height))
        $x = [Math]::Max(0, [Math]::Round($rect.Left))
        $y = [Math]::Max(0, [Math]::Round($rect.Top))
        $bmp = New-Object System.Drawing.Bitmap($w, $h)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.CopyFromScreen($x, $y, 0, 0, $bmp.Size)
        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $b64 = [Convert]::ToBase64String($ms.ToArray())
        $g.Dispose(); $bmp.Dispose(); $ms.Dispose()
        [PSCustomObject]@{ base64 = $b64 } | ConvertTo-Json -Compress
    }
    "Click" {
        $null = [Win32BridgeNative]::SetCursorPos($X, $Y)
        Start-Sleep -Milliseconds 30
        [Win32BridgeNative]::mouse_event(0x02, 0, 0, 0, 0)
        Start-Sleep -Milliseconds 40
        [Win32BridgeNative]::mouse_event(0x04, 0, 0, 0, 0)
        [PSCustomObject]@{ status = "ok"; x = $X; y = $Y; action = "click" } | ConvertTo-Json -Compress
    }
    "RightClick" {
        $null = [Win32BridgeNative]::SetCursorPos($X, $Y)
        Start-Sleep -Milliseconds 30
        [Win32BridgeNative]::mouse_event(0x08, 0, 0, 0, 0)
        Start-Sleep -Milliseconds 40
        [Win32BridgeNative]::mouse_event(0x10, 0, 0, 0, 0)
        [PSCustomObject]@{ status = "ok"; x = $X; y = $Y; action = "rightClick" } | ConvertTo-Json -Compress
    }
    "SendText" {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.SendKeys]::SendWait($Text)
        [PSCustomObject]@{ status = "ok"; text = $Text } | ConvertTo-Json -Compress
    }
    "SendHotkey" {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.SendKeys]::SendWait($Text)
        [PSCustomObject]@{ status = "ok"; hotkey = $Text } | ConvertTo-Json -Compress
    }
    "Focus" {
        $win = Find-TargetWindow
        if ($win) {
            $hwnd = [IntPtr][int64]$win.Current.NativeWindowHandle
            $null = [Win32BridgeNative]::ShowWindow($hwnd, 9)
            $null = [Win32BridgeNative]::SetForegroundWindow($hwnd)
            $null = [Win32BridgeNative]::BringWindowToTop($hwnd)
            [PSCustomObject]@{ status = "ok"; windowId = "$hwnd" } | ConvertTo-Json -Compress
        } else {
            Write-Error "Target window not found"
            exit 1
        }
    }
    "WindowState" {
        $win = Find-TargetWindow
        if ($win) {
            $hwnd = [IntPtr][int64]$win.Current.NativeWindowHandle
            $cmd = switch ($WindowState) {
                "Minimize" { 6 }
                "Maximize" { 3 }
                default { 9 }
            }
            [Win32BridgeNative]::ShowWindow($hwnd, $cmd)
            [PSCustomObject]@{ status = "ok"; windowId = "$hwnd"; state = $WindowState } | ConvertTo-Json -Compress
        } else {
            Write-Error "Target window not found"
            exit 1
        }
    }
}
