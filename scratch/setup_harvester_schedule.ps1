# ============================================================
# NKQM Attendance Harvester - Task Scheduler Setup
# ============================================================
# Registers a Windows Scheduled Task that runs the harvester
# every 3 hours on weekdays (Mon-Fri) from 7:00 AM to 7:00 PM
#
# Usage: Right-click and "Run as Administrator", OR run from
#        an elevated PowerShell terminal.
# ============================================================

$TaskName    = "NKQM_Attendance_Harvester"
$ScriptDir   = "$env:USERPROFILE\OneDrive\Desktop\SMS\scratch"
$BatchFile   = "$ScriptDir\run_harvester.bat"
$Description = "Uploads NKQM biometric attendance records to cloud every 3 hours on school days."

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  NKQM Attendance Harvester - Task Scheduler Setup" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# Verify the batch file exists
if (-not (Test-Path $BatchFile)) {
    Write-Host "[ERROR] Batch file not found: $BatchFile" -ForegroundColor Red
    Write-Host "Please ensure run_harvester.bat exists in the scratch folder." -ForegroundColor Red
    pause
    exit 1
}

Write-Host "[1/4] Removing any existing task named '$TaskName'..." -ForegroundColor Yellow
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# ── Build the action: run run_harvester.bat silently ────────────────────────
Write-Host "[2/4] Building task action..." -ForegroundColor Yellow
$Action = New-ScheduledTaskAction `
    -Execute  "cmd.exe" `
    -Argument "/c `"$BatchFile`"" `
    -WorkingDirectory $ScriptDir

# ── Build triggers: repeat every 3 hours, Mon-Fri, 7 AM – 7 PM ─────────────
Write-Host "[3/4] Building schedule triggers (every 3 hours, Mon-Fri, 07:00-19:00)..." -ForegroundColor Yellow

# Repetition interval & duration (trigger repeats within each day's window)
$Interval  = New-TimeSpan -Hours 3
$Duration  = New-TimeSpan -Hours 12   # 7:00 AM → 7:00 PM = 12 hours

$TriggerMon = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday    -At "07:00AM"
$TriggerTue = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Tuesday   -At "07:00AM"
$TriggerWed = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Wednesday -At "07:00AM"
$TriggerThu = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Thursday  -At "07:00AM"
$TriggerFri = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Friday    -At "07:00AM"

# Apply repetition (every 3 hrs for 12 hrs) to each trigger
foreach ($T in @($TriggerMon, $TriggerTue, $TriggerWed, $TriggerThu, $TriggerFri)) {
    $T.Repetition.Interval = [System.Xml.XmlConvert]::ToString($Interval)
    $T.Repetition.Duration  = [System.Xml.XmlConvert]::ToString($Duration)
}

$Triggers = @($TriggerMon, $TriggerTue, $TriggerWed, $TriggerThu, $TriggerFri)

# ── Settings ────────────────────────────────────────────────────────────────
$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit    (New-TimeSpan -Minutes 10) `
    -MultipleInstances     IgnoreNew `
    -StartWhenAvailable                        `  # run missed trigger ASAP
    -WakeToRun:$false `
    -RunOnlyIfNetworkAvailable:$false

# ── Principal: run as current user, only when logged on ─────────────────────
$Principal = New-ScheduledTaskPrincipal `
    -UserId    "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel  Highest

# ── Register the task ────────────────────────────────────────────────────────
Write-Host "[4/4] Registering scheduled task..." -ForegroundColor Yellow

$Task = Register-ScheduledTask `
    -TaskName   $TaskName `
    -Action     $Action `
    -Trigger    $Triggers `
    -Settings   $Settings `
    -Principal  $Principal `
    -Description $Description `
    -Force

if ($Task) {
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "  SUCCESS! Scheduled task created." -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Task Name : $TaskName" -ForegroundColor White
    Write-Host "  Schedule  : Every 3 hours, Mon-Fri, 07:00 AM - 07:00 PM" -ForegroundColor White
    Write-Host "  Script    : $BatchFile" -ForegroundColor White
    Write-Host "  Log File  : $ScriptDir\harvester.log" -ForegroundColor White
    Write-Host ""
    Write-Host "  Next runs: 07:00, 10:00, 13:00, 16:00, 19:00 each weekday." -ForegroundColor Cyan
    Write-Host ""

    # Ask if user wants to run it immediately
    $RunNow = Read-Host "Run the harvester RIGHT NOW to test it? (Y/N)"
    if ($RunNow -match "^[Yy]") {
        Write-Host ""
        Write-Host "Running harvester now..." -ForegroundColor Yellow
        Start-ScheduledTask -TaskName $TaskName
        Start-Sleep -Seconds 5
        $TaskInfo = Get-ScheduledTask -TaskName $TaskName | Get-ScheduledTaskInfo
        Write-Host "Last Run Time   : $($TaskInfo.LastRunTime)" -ForegroundColor White
        Write-Host "Last Run Result : $($TaskInfo.LastTaskResult) (0 = success)" -ForegroundColor White
        Write-Host ""
        Write-Host "Check the log for details:" -ForegroundColor Cyan
        Write-Host "  $ScriptDir\harvester.log" -ForegroundColor White
    }
} else {
    Write-Host ""
    Write-Host "[ERROR] Failed to create the scheduled task." -ForegroundColor Red
    Write-Host "Try running this script as Administrator." -ForegroundColor Red
}

Write-Host ""
pause
