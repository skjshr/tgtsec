[CmdletBinding()]
param(
    [switch]$Install,
    [switch]$ConfirmPersonalTether,
    [switch]$SelfTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repository = 'skjshr/tgtsec'
$branch = 'feat/live-usb-b2r'
$codexInstaller = 'https://chatgpt.com/codex/install.ps1'
$toolSpecs = @(
    [pscustomobject]@{ Name = 'Git'; Command = 'git'; WingetId = 'Git.Git'; VersionArgs = @('--version') }
    [pscustomobject]@{ Name = 'GitHub CLI'; Command = 'gh'; WingetId = 'GitHub.cli'; VersionArgs = @('--version') }
    [pscustomobject]@{ Name = 'Codex CLI'; Command = 'codex'; WingetId = $null; VersionArgs = @('--version') }
)
$nextCommands = @(
    'gh auth login --hostname github.com --git-protocol https --web'
    'codex login'
    'New-Item -ItemType Directory -Force C:\lab'
    'Set-Location C:\lab'
    "gh repo clone $repository"
    'Set-Location tgtsec'
    'git fetch origin'
    "git switch $branch"
    'codex'
)

function Write-Section {
    param([Parameter(Mandatory)][string]$Title)
    Write-Host ''
    Write-Host "== $Title =="
}

function Write-Check {
    param(
        [Parameter(Mandatory)][ValidateSet('OK', 'WARN', 'INFO')][string]$State,
        [Parameter(Mandatory)][string]$Message
    )
    Write-Host "[$State] $Message"
}

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-ToolStatus {
    param([Parameter(Mandatory)]$Spec)

    $resolved = Get-Command $Spec.Command -ErrorAction SilentlyContinue
    if ($null -eq $resolved) {
        return [pscustomobject]@{
            Spec = $Spec
            Installed = $false
            Version = $null
        }
    }

    $versionOutput = @(& $resolved.Source @($Spec.VersionArgs) 2>&1)
    $versionLine = ($versionOutput | Select-Object -First 1 | Out-String).Trim()
    return [pscustomobject]@{
        Spec = $Spec
        Installed = $true
        Version = $versionLine
    }
}

function Get-WingetInstallArguments {
    param([Parameter(Mandatory)][string]$PackageId)
    return @(
        'install',
        '--id', $PackageId,
        '--exact',
        '--accept-package-agreements',
        '--accept-source-agreements'
    )
}

function Install-WingetTool {
    param([Parameter(Mandatory)]$Spec)

    $arguments = Get-WingetInstallArguments -PackageId $Spec.WingetId
    Write-Host "Installing $($Spec.Name) with winget..."
    & winget @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "winget could not install $($Spec.Name) (exit $LASTEXITCODE)."
    }
}

function Install-CodexCli {
    Write-Host "Installing Codex CLI from $codexInstaller ..."
    $installerSource = Invoke-RestMethod -Uri $codexInstaller
    if ([string]::IsNullOrWhiteSpace([string]$installerSource)) {
        throw 'The Codex installer download was empty.'
    }
    & ([scriptblock]::Create([string]$installerSource))
}

function Invoke-SelfTest {
    $failures = [System.Collections.Generic.List[string]]::new()

    if ($toolSpecs.Count -ne 3) {
        $failures.Add('Exactly three supported tools were expected.')
    }
    if (($toolSpecs.WingetId -ne $null) -notcontains 'Git.Git') {
        $failures.Add('Git winget package is missing.')
    }
    if (($toolSpecs.WingetId -ne $null) -notcontains 'GitHub.cli') {
        $failures.Add('GitHub CLI winget package is missing.')
    }

    $wingetArgs = Get-WingetInstallArguments -PackageId 'Example.Package'
    foreach ($required in @('install', '--id', 'Example.Package', '--exact')) {
        if ($wingetArgs -notcontains $required) {
            $failures.Add("winget arguments do not include $required.")
        }
    }

    foreach ($requiredCommand in @(
        'gh auth login --hostname github.com --git-protocol https --web',
        'codex login',
        "gh repo clone $repository",
        "git switch $branch"
    )) {
        if ($nextCommands -notcontains $requiredCommand) {
            $failures.Add("Manual next step is missing: $requiredCommand")
        }
    }

    if ($failures.Count -gt 0) {
        $failures | ForEach-Object { Write-Check -State WARN -Message $_ }
        throw "Self-test failed with $($failures.Count) error(s)."
    }

    Write-Check -State OK -Message 'Self-test passed. No installer, login, disk, or USB action was run.'
}

if ($SelfTest) {
    Invoke-SelfTest
    return
}

if ($env:OS -ne 'Windows_NT') {
    throw 'Run this script in Windows PowerShell or PowerShell on Windows.'
}

Write-Host 'Site Takeover Lab - company Windows readiness check'
Write-Host 'Default mode is diagnostic only. It does not log in, clone, format, repair, or write a USB.'

Write-Section -Title 'Network safety'
Write-Check -State WARN -Message 'Do not use the company LAN or company Wi-Fi. Connect through your personal tether only.'
if ($ConfirmPersonalTether) {
    Write-Check -State OK -Message 'Operator explicitly confirmed personal tether use.'
} else {
    Write-Check -State INFO -Message 'For installation, rerun with -Install -ConfirmPersonalTether after checking the active network.'
}

try {
    $profiles = @(Get-NetConnectionProfile -ErrorAction Stop)
    if ($profiles.Count -eq 0) {
        Write-Check -State WARN -Message 'Windows reports no active network profile.'
    } else {
        foreach ($profile in $profiles) {
            Write-Check -State INFO -Message (
                "Active profile: {0} / {1} / IPv4 {2}" -f
                $profile.InterfaceAlias, $profile.NetworkCategory, $profile.IPv4Connectivity
            )
        }
        Write-Check -State WARN -Message 'Windows cannot prove that a profile is personal tethering. Verify its name yourself.'
    }
} catch {
    Write-Check -State WARN -Message "Could not list network profiles: $($_.Exception.Message)"
}

Write-Section -Title 'Windows'
try {
    $windows = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
    Write-Check -State OK -Message "$($windows.Caption) $($windows.Version), PowerShell $($PSVersionTable.PSVersion)"
} catch {
    Write-Check -State INFO -Message "$([Environment]::OSVersion.VersionString), PowerShell $($PSVersionTable.PSVersion)"
}

if (Test-IsAdministrator) {
    Write-Check -State INFO -Message 'PowerShell is running as administrator. The readiness check itself does not require this.'
} else {
    Write-Check -State OK -Message 'PowerShell is not elevated. winget may request elevation if an installer needs it.'
}

$winget = Get-Command winget -ErrorAction SilentlyContinue
if ($null -eq $winget) {
    Write-Check -State WARN -Message 'winget is missing. Install or update Microsoft App Installer before using -Install.'
} else {
    $wingetVersion = (& $winget.Source --version 2>&1 | Select-Object -First 1 | Out-String).Trim()
    Write-Check -State OK -Message "winget $wingetVersion"
}

Write-Section -Title 'Developer tools'
$statuses = @($toolSpecs | ForEach-Object { Get-ToolStatus -Spec $_ })
foreach ($status in $statuses) {
    if ($status.Installed) {
        Write-Check -State OK -Message "$($status.Spec.Name): $($status.Version)"
    } else {
        Write-Check -State WARN -Message "$($status.Spec.Name) is not installed or is not on PATH."
    }
}

Write-Section -Title 'USB visibility (read only)'
try {
    $usbDisks = @(Get-Disk -ErrorAction Stop | Where-Object BusType -eq 'USB')
    if ($usbDisks.Count -eq 0) {
        Write-Check -State INFO -Message 'No USB disk is currently visible.'
    } else {
        foreach ($disk in $usbDisks) {
            $sizeGiB = [math]::Round($disk.Size / 1GB, 1)
            Write-Check -State INFO -Message (
                "Disk {0}: {1}, {2} GiB, health {3}, operational {4}" -f
                $disk.Number, $disk.FriendlyName, $sizeGiB, $disk.HealthStatus,
                ($disk.OperationalStatus -join ',')
            )
        }
        Write-Check -State WARN -Message 'This script only reports USB disks. It never repairs, formats, erases, or writes them.'
    }
} catch {
    Write-Check -State WARN -Message "Could not list USB disks: $($_.Exception.Message)"
}

if ($Install) {
    Write-Section -Title 'Explicit installation'
    if (-not $ConfirmPersonalTether) {
        throw 'Installation was blocked. Confirm a personal tether, then pass -ConfirmPersonalTether with -Install.'
    }
    if ($null -eq $winget) {
        throw 'Installation was blocked because winget is unavailable.'
    }

    foreach ($status in $statuses) {
        if ($status.Installed) {
            Write-Check -State INFO -Message "$($status.Spec.Name) is already present; skipped."
        } elseif ($status.Spec.Command -eq 'codex') {
            Install-CodexCli
        } else {
            Install-WingetTool -Spec $status.Spec
        }
    }
    Write-Check -State OK -Message 'Requested installers finished. Open a new PowerShell before the next commands.'
}

Write-Section -Title 'Next manual commands'
Write-Host 'Authentication is intentionally manual. The script never receives or saves a token.'
foreach ($command in $nextCommands) {
    Write-Host $command
}
Write-Host ''
Write-Host 'After cloning, follow operator/COMPANY-SETUP.md. Do not write the USB until a verified ISO and SHA-256 exist.'
