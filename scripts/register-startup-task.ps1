# Run this script once (as Administrator) to register the LIIMS auto-start task.
# After registration, LIIMS will start automatically every time you log in.

$ScriptPath = Join-Path $PSScriptRoot "startup.ps1"

$Action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`""

$Trigger = New-ScheduledTaskTrigger -AtLogOn

$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable

Register-ScheduledTask `
    -TaskName "LIIMS Auto-Start" `
    -Description "Starts the BHARAT Study LIIMS Docker stack after login." `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Force | Out-Null

Write-Host "Task 'LIIMS Auto-Start' registered. It will run at every login."
Write-Host "To remove it: Unregister-ScheduledTask -TaskName 'LIIMS Auto-Start' -Confirm:`$false"
