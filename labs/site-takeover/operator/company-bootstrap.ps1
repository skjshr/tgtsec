[CmdletBinding()]
param(
    [switch]$Install,
    [switch]$ConfirmPersonalTether,
    [switch]$DownloadRelease,
    [switch]$SelfTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repository = 'skjshr/tgtsec'
$branch = 'feat/live-usb-b2r'
$releaseTag = 'site-takeover-live-v0.1.0-rc1'
$releaseDirectory = 'C:\lab\site-takeover-release'
$releaseAssetNames = @(
    'site-takeover-live-amd64.iso'
    'site-takeover-live-amd64.iso.sha256'
    'site-takeover-live-amd64.boot.txt'
)
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

function Get-VerifiedRelease {
    $releaseJson = @(
        & gh release view $releaseTag `
            --repo $repository `
            --json isDraft,isPrerelease,targetCommitish,assets 2>&1
    )
    if ($LASTEXITCODE -ne 0) {
        throw "GitHub release metadata could not be read: $($releaseJson -join ' ')"
    }

    $release = ($releaseJson -join "`n") | ConvertFrom-Json
    if (-not $release.isDraft -or -not $release.isPrerelease) {
        throw "Release $releaseTag is not both draft and prerelease."
    }
    if ([string]$release.targetCommitish -notmatch '^[0-9a-f]{40}$') {
        throw "Release $releaseTag does not target an exact commit."
    }

    $availableAssets = @($release.assets | ForEach-Object { [string]$_.name })
    foreach ($assetName in $releaseAssetNames) {
        if ($availableAssets -notcontains $assetName) {
            throw "Release $releaseTag is missing $assetName."
        }
    }

    return $release
}

function Download-VerifiedRelease {
    if (-not $ConfirmPersonalTether) {
        throw 'Release download was blocked. Confirm a personal tether, then pass -ConfirmPersonalTether.'
    }
    if ($Install) {
        throw 'Run -Install and -DownloadRelease as separate commands, reopening PowerShell between them.'
    }
    if ($null -eq (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw 'GitHub CLI is required. Install it first, reopen PowerShell, and run gh auth login.'
    }

    & gh auth status --hostname github.com *> $null
    if ($LASTEXITCODE -ne 0) {
        throw 'GitHub CLI is not logged in. Run gh auth login --hostname github.com --git-protocol https --web.'
    }

    Write-Section -Title 'Verified draft release download'
    $release = Get-VerifiedRelease

    if (Test-Path -LiteralPath $releaseDirectory) {
        $existing = @(Get-ChildItem -LiteralPath $releaseDirectory -Force)
        if ($existing.Count -gt 0) {
            throw "$releaseDirectory is not empty. Move it aside before downloading again."
        }
    } else {
        New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
    }

    foreach ($assetName in $releaseAssetNames) {
        & gh release download $releaseTag `
            --repo $repository `
            --dir $releaseDirectory `
            --pattern $assetName
        if ($LASTEXITCODE -ne 0) {
            throw "Download failed for $assetName."
        }
    }

    $isoName = $releaseAssetNames[0]
    $checksumName = $releaseAssetNames[1]
    $bootReportName = $releaseAssetNames[2]
    $isoPath = Join-Path $releaseDirectory $isoName
    $checksumPath = Join-Path $releaseDirectory $checksumName
    $bootReportPath = Join-Path $releaseDirectory $bootReportName

    $checksumLines = @(Get-Content -LiteralPath $checksumPath | Where-Object {
        $_ -match '\s+\*?site-takeover-live-amd64\.iso$'
    })
    if ($checksumLines.Count -ne 1) {
        throw 'The checksum file does not contain exactly one entry for the ISO.'
    }

    $expected = (($checksumLines[0].Trim() -split '\s+')[0]).ToLowerInvariant()
    $actual = (Get-FileHash -LiteralPath $isoPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($expected -notmatch '^[0-9a-f]{64}$' -or $actual -cne $expected) {
        throw "SHA-256 mismatch: expected=$expected actual=$actual"
    }

    $isoAsset = @($release.assets | Where-Object name -eq $isoName)
    if ($isoAsset.Count -eq 1 -and
        -not [string]::IsNullOrWhiteSpace([string]$isoAsset[0].digest) -and
        [string]$isoAsset[0].digest -cne "sha256:$actual") {
        throw "GitHub asset digest does not match the downloaded ISO: $($isoAsset[0].digest)"
    }

    $bootReport = Get-Content -LiteralPath $bootReportPath -Raw
    if ($bootReport -notmatch 'BIOS' -or $bootReport -notmatch 'UEFI') {
        throw 'The boot report does not contain both BIOS and UEFI entries.'
    }

    Write-Check -State OK -Message "Draft prerelease $releaseTag targets $($release.targetCommitish)."
    Write-Check -State OK -Message "SHA-256 verified: $actual"
    Write-Check -State OK -Message 'BIOS and UEFI boot entries are present.'
    Write-Check -State OK -Message "Files are ready under $releaseDirectory"
    Write-Check -State WARN -Message 'No USB was formatted or written. Continue with operator\USB.md and the exact physical-disk identity check.'
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
    if ($releaseAssetNames.Count -ne 3) {
        $failures.Add('Exactly three release assets were expected.')
    }
    foreach ($requiredAsset in @(
        'site-takeover-live-amd64.iso',
        'site-takeover-live-amd64.iso.sha256',
        'site-takeover-live-amd64.boot.txt'
    )) {
        if ($releaseAssetNames -notcontains $requiredAsset) {
            $failures.Add("Release asset is missing: $requiredAsset")
        }
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
Write-Host 'Default mode is diagnostic only. -DownloadRelease creates verified files but never formats or writes a USB.'

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
$specsToCheck = if ($DownloadRelease) {
    @($toolSpecs | Where-Object Command -eq 'gh')
} else {
    $toolSpecs
}
$statuses = @($specsToCheck | ForEach-Object { Get-ToolStatus -Spec $_ })
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

if ($DownloadRelease) {
    Download-VerifiedRelease
    return
}

Write-Section -Title 'Next manual commands'
Write-Host 'Authentication is intentionally manual. The script never receives or saves a token.'
foreach ($command in $nextCommands) {
    Write-Host $command
}
Write-Host ''
Write-Host 'After cloning, follow operator/COMPANY-SETUP.md. Do not write the USB until a verified ISO and SHA-256 exist.'
