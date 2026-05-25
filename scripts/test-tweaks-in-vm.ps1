<#
.SYNOPSIS
  Roundtrip every Reclaim tweak inside a prepared test VM and report which
  ones don't reverse cleanly.

.DESCRIPTION
  Connects to the VM via PowerShell Direct (no networking required), then for
  each tweak ID:
    1. baseline    = reclaim.exe --check-tweak <id> --json
    2. apply       = reclaim.exe --apply-tweak <id> --json --silent --no-elevate
    3. after-apply = reclaim.exe --check-tweak <id> --json    (expect "on")
    4. revert      = reclaim.exe --revert-tweak <id> --json --silent --no-elevate
    5. after-revert= reclaim.exe --check-tweak <id> --json    (expect baseline)

  Verdicts per tweak:
    pass        - apply turned it on, revert restored baseline
    apply-fail  - state did not flip to "on" after apply
    revert-fail - state did not return to baseline after revert (the v0.20.x
                  bug class: defaultValue == applied value -> revert no-op)
    crash       - reclaim.exe non-zero exit during any of the five steps

  Writes:
    test-output\tweaks-roundtrip-<UTC>.json  -- full per-tweak rows
    test-output\tweaks-roundtrip-<UTC>.md    -- short markdown summary

.PARAMETER VmName
  Name of the Hyper-V VM prepared by setup-test-vm.ps1.

.PARAMETER Credential
  Local-admin credential for the VM. Build with:
    $cred = [pscredential]::new('Reclaim-Test\TestAdmin', `
        (ConvertTo-SecureString 'Reclaim!Test1' -AsPlainText -Force))

.PARAMETER OnlyCategory
  Restrict to a single tweak category (e.g. "gaming") -- useful when chasing
  one specific class of failure.

.PARAMETER OnlyIds
  Comma-separated tweak IDs. Overrides -OnlyCategory.

.PARAMETER SkipAdminOnly
  Skip tweaks that touch HKLM or run shell -- they need elevated reclaim.exe
  inside the VM, which works since we're the local admin, but some tests
  flake on slow VMs.

.PARAMETER ContinueOnCrash
  Don't abort the whole run if reclaim.exe crashes on one tweak.

.EXAMPLE
  .\scripts\test-tweaks-in-vm.ps1 -VmName Reclaim-Test -Credential $cred

.EXAMPLE
  # only the five tweaks the static audit flagged as broken
  .\scripts\test-tweaks-in-vm.ps1 -VmName Reclaim-Test -Credential $cred `
      -OnlyIds "hide-gallery,hide-home,remote-desktop-off,game-mode-on,mmcss-gaming-priority"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$VmName,
    [Parameter(Mandatory)][PSCredential]$Credential,
    [string]$OnlyCategory,
    [string]$OnlyIds,
    [switch]$SkipAdminOnly,
    [switch]$ContinueOnCrash
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$tweaksJsonPath = Join-Path $repoRoot "src-tauri\data\tweaks.json"
if (-not (Test-Path $tweaksJsonPath)) {
    throw "tweaks.json missing -- run `pnpm catalog:export` first."
}

$allTweaks = Get-Content $tweaksJsonPath -Raw | ConvertFrom-Json

# pick the candidate set — wrap in @() to keep .Count working under StrictMode
# when only one entry passes the filter (PS unwraps single-item pipelines).
$candidates = @($allTweaks)
if ($OnlyIds) {
    $wanted = $OnlyIds -split "," | ForEach-Object { $_.Trim() }
    $candidates = @($candidates | Where-Object { $_.id -in $wanted })
    if (-not $candidates) { throw "None of the requested IDs exist in the catalog: $OnlyIds" }
} elseif ($OnlyCategory) {
    $candidates = @($candidates | Where-Object { $_.category -eq $OnlyCategory })
    if (-not $candidates) { throw "No tweaks in category '$OnlyCategory'." }
}
if ($SkipAdminOnly) {
    $candidates = @($candidates | Where-Object {
        $needsAdmin = $false
        foreach ($op in $_.apply) {
            if ($op.kind -eq "shell") { $needsAdmin = $true; break }
            if ($op.kind -eq "reg" -and $op.hive -eq "HKLM") { $needsAdmin = $true; break }
        }
        -not $needsAdmin
    })
}

Write-Host "[test] $($candidates.Count) tweak(s) selected" -ForegroundColor Cyan

# open a long-lived PS session into the VM
$session = New-PSSession -VMName $VmName -Credential $Credential
Write-Host "[test] PSDirect session open: $($session.Id)" -ForegroundColor Cyan

# verify reclaim.exe is staged
$exeProbe = Invoke-Command -Session $session -ScriptBlock {
    if (Test-Path "C:\Reclaim\reclaim.exe") {
        @{ exists = $true; size = (Get-Item "C:\Reclaim\reclaim.exe").Length }
    } else {
        @{ exists = $false }
    }
}
if (-not $exeProbe.exists) {
    Remove-PSSession $session
    throw "reclaim.exe not at C:\Reclaim\reclaim.exe in the VM. Re-run setup-test-vm.ps1."
}
Write-Host "[test] reclaim.exe in VM: $($exeProbe.size) bytes" -ForegroundColor Cyan

function Invoke-Reclaim {
    param([string]$IdList, [ValidateSet("check","apply","revert")][string]$Op)
    $flag = switch ($Op) {
        "check"  { "--check-tweak" }
        "apply"  { "--apply-tweak" }
        "revert" { "--revert-tweak" }
    }
    $args = @($flag, $IdList, "--json")
    if ($Op -ne "check") { $args += @("--silent", "--no-elevate") }

    $out = Invoke-Command -Session $session -ScriptBlock {
        param($exe, $argv)
        $stdout = & $exe @argv 2>&1 | Out-String
        @{ exit = $LASTEXITCODE; out = $stdout }
    } -ArgumentList "C:\Reclaim\reclaim.exe", $args

    $parsed = $null
    try { $parsed = $out.out | ConvertFrom-Json -ErrorAction Stop } catch {}
    [pscustomobject]@{
        Exit   = $out.exit
        Raw    = $out.out
        Parsed = $parsed
    }
}

# distill the parsed --check-tweak JSON down to one of:
#   on / off / unknown / unknown-id / error
# CLI shape (cli.rs:check_tweak_ids): top-level array of { id, state }.
function Get-TweakState {
    param($result)
    if ($result.Exit -ne 0) { return "error" }
    if ($null -eq $result.Parsed) { return "unknown" }
    $row = if ($result.Parsed -is [System.Collections.IEnumerable] -and -not ($result.Parsed -is [string])) {
        $result.Parsed | Select-Object -First 1
    } else {
        $result.Parsed
    }
    if ($row -and $row.PSObject.Properties.Name -contains "state") {
        return [string]$row.state
    }
    return "unknown"
}

$rows = @()
$i = 0
foreach ($t in $candidates) {
    $i++
    Write-Progress -Activity "Roundtrip tweaks" -Status "$($t.id) [$i/$($candidates.Count)]" `
        -PercentComplete (100 * $i / [Math]::Max(1, $candidates.Count))

    $row = [ordered]@{
        id          = $t.id
        category    = $t.category
        baseline    = $null
        afterApply  = $null
        afterRevert = $null
        verdict     = $null
        notes       = @()
    }

    try {
        $r1 = Invoke-Reclaim -IdList $t.id -Op check
        $row.baseline = Get-TweakState $r1

        $r2 = Invoke-Reclaim -IdList $t.id -Op apply
        if ($r2.Exit -ne 0) {
            $row.verdict = "crash"; $row.notes += "apply exit=$($r2.Exit)"
            if (-not $ContinueOnCrash) { throw "apply crashed for $($t.id)" }
            $rows += [pscustomobject]$row; continue
        }

        $r3 = Invoke-Reclaim -IdList $t.id -Op check
        $row.afterApply = Get-TweakState $r3
        if ($row.afterApply -ne "on") {
            $row.verdict = "apply-fail"
            $row.notes += "expected on, got $($row.afterApply)"
        }

        $r4 = Invoke-Reclaim -IdList $t.id -Op revert
        if ($r4.Exit -ne 0) {
            $row.verdict = "crash"; $row.notes += "revert exit=$($r4.Exit)"
            if (-not $ContinueOnCrash) { throw "revert crashed for $($t.id)" }
            $rows += [pscustomobject]$row; continue
        }

        $r5 = Invoke-Reclaim -IdList $t.id -Op check
        $row.afterRevert = Get-TweakState $r5
        if (-not $row.verdict) {
            if ($row.afterRevert -ne $row.baseline) {
                $row.verdict = "revert-fail"
                $row.notes += "baseline=$($row.baseline), after-revert=$($row.afterRevert)"
            } else {
                $row.verdict = "pass"
            }
        }
    } catch {
        $row.verdict = "crash"; $row.notes += $_.Exception.Message
        if (-not $ContinueOnCrash) {
            Remove-PSSession $session
            throw
        }
    }
    $rows += [pscustomobject]$row
}
Write-Progress -Activity "Roundtrip tweaks" -Completed
Remove-PSSession $session

# ------------------------------------------------------------------------- #
# write reports                                                             #
# ------------------------------------------------------------------------- #

$ts = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$outDir = Join-Path $repoRoot "test-output"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$jsonPath = Join-Path $outDir "tweaks-roundtrip-$ts.json"
$mdPath   = Join-Path $outDir "tweaks-roundtrip-$ts.md"

$rows | ConvertTo-Json -Depth 6 | Set-Content -Path $jsonPath -Encoding UTF8

$byVerdict = $rows | Group-Object verdict | Sort-Object Name
$md = @()
$md += "# Tweak roundtrip report"
$md += ""
$md += "- VM: ``$VmName``"
$md += "- Timestamp (UTC): ``$ts``"
$md += "- Tweaks tested: $($rows.Count)"
$md += ""
$md += "## Summary"
$md += ""
$md += "| verdict | count |"
$md += "|---|--:|"
foreach ($g in $byVerdict) { $md += "| $($g.Name) | $($g.Count) |" }
$md += ""

foreach ($verdict in @("crash","apply-fail","revert-fail")) {
    $broken = $rows | Where-Object verdict -eq $verdict
    if ($broken) {
        $md += "## $verdict"
        $md += ""
        $md += "| id | category | baseline | after-apply | after-revert | notes |"
        $md += "|---|---|---|---|---|---|"
        foreach ($b in $broken) {
            $md += "| $($b.id) | $($b.category) | $($b.baseline) | $($b.afterApply) | $($b.afterRevert) | $($b.notes -join '; ') |"
        }
        $md += ""
    }
}

$md -join "`r`n" | Set-Content -Path $mdPath -Encoding UTF8

Write-Host ""
Write-Host "[done] JSON: $jsonPath" -ForegroundColor Green
Write-Host "[done] MD  : $mdPath"   -ForegroundColor Green
Write-Host ""
foreach ($g in $byVerdict) {
    $color = if ($g.Name -eq "pass") { "Green" } else { "Yellow" }
    Write-Host ("  {0,-12} : {1}" -f $g.Name, $g.Count) -ForegroundColor $color
}
