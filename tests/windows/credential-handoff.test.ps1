$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $IsWindows) { throw 'Windows fixture requires Windows; not skipped.' }
Import-Module (Join-Path $PSScriptRoot '../../proposals/application-storage/credential-handoff.psm1') -Force
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('ggs-handoff-fixture-' + [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($fixture)
$script:passes = 0
function Assert([bool]$Condition) { if (-not $Condition) { throw 'Fixture assertion failed' } }
function Root { $path = Join-Path $fixture ([guid]::NewGuid().ToString('N')); [void][IO.Directory]::CreateDirectory($path); return $path }
function Check([string]$Name, [scriptblock]$Action) {
  try { & $Action; $script:passes++; Write-Output "PASS: $Name" } catch { throw "FAIL: $Name (diagnostics suppressed)" }
}
function Fake([string]$Root) {
  $assertion = ${function:Assert}
  $state = @{ calls = [Collections.Generic.List[string]]::new(); enabled = $false; operation = ''; hash = '' }
  $gateway = @{
    Preflight = { param($project,$operation)
      $state.calls.Add('preflight'); $state.operation = $operation
      return @{projectId=$project;rolesAbsent=$true;ownerEmpty=$true;publicCreate=$false}
    }.GetNewClosure()
    PrepareDisabled = { param($project,$operation,$bundle)
      $state.calls.Add('prepare')
      $file = Join-Path $Root '.local-secrets/ggs-testing-storage.dpapi'
      & $assertion ([IO.File]::Exists($file))
      & $assertion ($bundle.intake.password -cmatch '^[a-f0-9]{64}$' -and $bundle.review.password -cmatch '^[a-f0-9]{64}$' -and $bundle.intake.password -cne $bundle.review.password)
      & $assertion (-not [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($file)).Contains($bundle.intake.password))
      $state.hash = (Get-FileHash -LiteralPath $file).Hash
      return @{projectId=$project;operationId=$operation;state='both-disabled'}
    }.GetNewClosure()
    Enable = { param($project,$operation)
      $state.calls.Add('enable'); $state.enabled=$true
      return @{projectId=$project;operationId=$operation;state='both-enabled'}
    }.GetNewClosure()
    Verify = { param($project,$operation,$bundle)
      $state.calls.Add('verify'); & $assertion $state.enabled
      return @{projectId=$project;operationId=$operation;state='identity-tls-permissions-verified'}
    }.GetNewClosure()
    Disable = { param($project,$operation)
      $state.calls.Add('disable'); & $assertion ($state.operation -ceq $operation); $state.enabled=$false
      return @{projectId=$project;operationId=$operation;state='both-disabled-sessions-closed'}
    }.GetNewClosure()
  }
  return @{state=$state;gateway=$gateway}
}
function Run([string]$Root,[hashtable]$Gateway,[string]$Ack='reviewed-gg-livestream-testing-provisioning') {
  return Invoke-GgsTestingCredentialHandoff -CheckoutRoot $Root -Gateway $Gateway -Acknowledgement $Ack
}
function Denied([scriptblock]$Action,[string]$Phase,[string]$Recovery='not-required') {
  try { & $Action; throw 'Expected denial missing' } catch {
    Assert ($_.Exception.Message -match "^GG testing handoff incomplete; phase=$Phase; recovery=$Recovery; operation=[a-f0-9-]{36}$")
  }
}
try {
  Check 'read-back precedes disabled preparation, enabling and verification' {
    $root=Root; $fake=Fake $root; $result=Run $root $fake.gateway
    Assert (($fake.state.calls -join ',') -ceq 'preflight,prepare,enable,verify')
    Assert ($result.outcome -ceq 'verified' -and $result.operationId -ceq $fake.state.operation)
    Assert ($result.Count -eq 3)
  }
  Check 'missing acknowledgement fails before callbacks or files' {
    $root=Root; $fake=Fake $root; Denied {Run $root $fake.gateway 'no'} 'context'
    Assert ($fake.state.calls.Count -eq 0 -and -not (Test-Path -LiteralPath (Join-Path $root '.local-secrets')))
  }
  Check 'actual production runtime fails before callbacks' {
    $root=Root; $fake=Fake $root; $original=$env:APP_ENV
    try {$env:APP_ENV='production';Denied {Run $root $fake.gateway} 'context'} finally {$env:APP_ENV=$original}
    Assert ($fake.state.calls.Count -eq 0)
  }
  Check 'incomplete gateway cannot run' {
    $root=Root; $fake=Fake $root; $fake.gateway.Remove('Disable');Denied {Run $root $fake.gateway} 'context'
    Assert ($fake.state.calls.Count -eq 0)
  }
  Check 'wrong-target preflight denies before credential persistence' {
    $root=Root; $fake=Fake $root
    $fake.gateway.Preflight={return @{projectId='other';rolesAbsent=$true;ownerEmpty=$true;publicCreate=$false}}
    Denied {Run $root $fake.gateway} 'preflight'
    Assert (-not (Test-Path -LiteralPath (Join-Path $root '.local-secrets')))
  }
  Check 'existing role preflight denies without adopting it' {
    $root=Root;$fake=Fake $root
    $fake.gateway.Preflight={param($p,$o) return @{projectId=$p;rolesAbsent=$false;ownerEmpty=$true;publicCreate=$false}}
    Denied {Run $root $fake.gateway} 'preflight';Assert (-not $fake.state.enabled)
  }
  Check 'unsafe directory prevents every database mutation callback' {
    $root=Root;$fake=Fake $root;[void][IO.Directory]::CreateDirectory((Join-Path $root '.local-secrets'))
    Denied {Run $root $fake.gateway} 'storage';Assert (($fake.state.calls -join ',') -ceq 'preflight')
  }
  Check 'uncertain disabled preparation does not enable or retry' {
    $root=Root;$fake=Fake $root;$fake.gateway.PrepareDisabled={throw 'private gateway diagnostic'}
    Denied {Run $root $fake.gateway} 'prepare-disabled';Assert (-not $fake.state.enabled)
    Assert (($fake.state.calls -join ',') -ceq 'preflight')
    Assert (Test-Path -LiteralPath (Join-Path $root '.local-secrets/ggs-testing-storage.dpapi'))
  }
  Check 'incorrect operation receipt cannot enable the logins' {
    $root=Root;$fake=Fake $root
    $fake.gateway.PrepareDisabled={param($p,$o,$b) return @{projectId=$p;operationId='wrong';state='both-disabled'}}
    Denied {Run $root $fake.gateway} 'prepare-disabled';Assert (-not $fake.state.enabled)
  }
  Check 'lost enable acknowledgement invokes guarded disable and preserves bundle' {
    $root=Root;$fake=Fake $root;$state=$fake.state
    $fake.gateway.Enable={param($p,$o) $state.enabled=$true;throw 'private acknowledgement'}.GetNewClosure()
    Denied {Run $root $fake.gateway} 'enable' 'confirmed-disabled'
    Assert (-not $state.enabled -and $state.calls.Contains('disable'))
    Assert ((Get-FileHash -LiteralPath (Join-Path $root '.local-secrets/ggs-testing-storage.dpapi')).Hash -ceq $state.hash)
  }
  Check 'verification failure with unavailable recovery reports unconfirmed state' {
    $root=Root;$fake=Fake $root;$fake.gateway.Verify={throw 'private TLS or permission diagnostic'};$fake.gateway.Disable={throw 'private recovery diagnostic'}
    Denied {Run $root $fake.gateway} 'verify' 'unconfirmed'
    Assert $fake.state.enabled # Never falsely claim recovery succeeded.
  }
  Check 'rerun refuses to overwrite saved credentials and performs no second preparation' {
    $root=Root;$fake=Fake $root;[void](Run $root $fake.gateway)
    $before=$fake.state.hash;$fake.state.calls.Clear()
    Denied {Run $root $fake.gateway} 'storage'
    Assert (($fake.state.calls -join ',') -ceq 'preflight')
    Assert ((Get-FileHash -LiteralPath (Join-Path $root '.local-secrets/ggs-testing-storage.dpapi')).Hash -ceq $before)
  }
  Write-Output "Windows credential handoff: $script:passes tests passed; simulated gateway only."
} finally {
  $resolved=[IO.Path]::GetFullPath($fixture)
  if ([IO.Path]::GetDirectoryName($resolved) -cne [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') -or
    [IO.Path]::GetFileName($resolved) -notmatch '^ggs-handoff-fixture-[a-f0-9]{32}$') {throw 'Unsafe fixture cleanup target'}
  if (@(Get-ChildItem -LiteralPath $resolved -Recurse -Force | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count) {throw 'Unexpected fixture links'}
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
