# Run this script once to install the LIIMS auto-start shortcut.
# No administrator privileges required.

$StartupDir = [Environment]::GetFolderPath('Startup')
$ScriptPath = Join-Path $PSScriptRoot "startup.ps1"
$ShortcutPath = Join-Path $StartupDir "LIIMS.lnk"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`""
$Shortcut.Description = "Start LIIMS Docker stack"
$Shortcut.Save()

Write-Host "Installed: $ShortcutPath"
Write-Host "LIIMS will now start automatically at every login."
Write-Host "To remove: Delete $ShortcutPath"
