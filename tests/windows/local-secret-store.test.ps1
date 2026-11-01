$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $IsWindows) { throw 'Windows fixture requires Windows; not skipped.' }
Import-Module (Join-Path $PSScriptRoot '../../proposals/application-storage/local-secret-store.psm1') -Force
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('ggs-secret-fixture-' + [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($fixture)
$ack = 'reviewed-gg-livestream-testing'
$script:passes = 0
function Assert([bool]$Condition) { if (-not $Condition) { throw 'Fixture assertion failed' } }
function Denied([scriptblock]$Action) {
  try { & $Action; throw 'Expected denial was missing' } catch {
    Assert ($_.Exception.Message -ceq 'GG testing credential store unavailable.')
  }
}
function Bundle {
  return @{ version = 1; projectId = 'rchxnmpsxfbsicthasxn';
    intake = @{ user = 'ggs_pilot_intake_login.rchxnmpsxfbsicthasxn'; password = ('a' * 64) };
    review = @{ user = 'ggs_pilot_review_login.rchxnmpsxfbsicthasxn'; password = ('b' * 64) } }
}
function Root {
  $path = Join-Path $fixture ([guid]::NewGuid().ToString('N'))
  [void][IO.Directory]::CreateDirectory($path)
  return $path
}
function Save([string]$Root) { Save-GgsTestingCredentialBundle -CheckoutRoot $Root -Bundle (Bundle) -Acknowledgement $ack }
function Use([string]$Root, [scriptblock]$Consumer = {}) { Invoke-GgsWithTestingCredentials -CheckoutRoot $Root -Acknowledgement $ack -Consumer $Consumer }
function Check([string]$Name, [scriptblock]$Action) {
  try { & $Action; $script:passes++; Write-Output "PASS: $Name" } catch { throw "FAIL: $Name (diagnostics suppressed)" }
}
try {
  Check 'DPAPI roundtrip, no plaintext on disk and no secret pipeline output' {
    $root = Root
    Assert (@(Save $root).Count -eq 0)
    $file = Join-Path $root '.local-secrets/ggs-testing-storage.dpapi'
    $bytes = [IO.File]::ReadAllBytes($file)
    $text = [Text.Encoding]::UTF8.GetString($bytes)
    Assert (-not $text.Contains('a' * 64) -and -not $text.Contains('b' * 64) -and -not $text.Contains('rchxnmpsxfbsicthasxn'))
    $state = @{ verified = $false }
    $output = @(Use $root { param($value) $state.verified = $value.intake.password -ceq ('a' * 64) -and $value.review.password -ceq ('b' * 64); $value })
    Assert ($state.verified -and $output.Count -eq 0)
  }
  Check 'directory and file have protected owner/SYSTEM-only ACLs' {
    $root = Root; Save $root
    $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    foreach ($path in @((Join-Path $root '.local-secrets'), (Join-Path $root '.local-secrets/ggs-testing-storage.dpapi'))) {
      $acl = Get-Acl -LiteralPath $path
      Assert ($acl.AreAccessRulesProtected -and $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ceq $owner)
      $rules = @($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
      Assert ($rules.Count -eq 2)
      foreach ($rule in $rules) { Assert ($rule.IdentityReference.Value -in @($owner,'S-1-5-18') -and -not $rule.IsInherited -and $rule.AccessControlType -eq 'Allow' -and $rule.FileSystemRights -eq 'FullControl') }
    }
  }
  Check 'existing bundle cannot be overwritten and remains readable' {
    $root = Root; Save $root
    $file = Join-Path $root '.local-secrets/ggs-testing-storage.dpapi'
    $before = (Get-FileHash -LiteralPath $file).Hash
    Denied { Save $root }
    Assert ((Get-FileHash -LiteralPath $file).Hash -ceq $before)
    Use $root
  }
  Check 'bad target, role, shared secrets and extra fields are rejected before disk writes' {
    foreach ($kind in @('project','role','shared','extra','version')) {
      $root = Root; $bundle = Bundle
      switch ($kind) {
        project { $bundle.projectId = 'other' }
        role { $bundle.intake.user = 'postgres.rchxnmpsxfbsicthasxn' }
        shared { $bundle.review.password = $bundle.intake.password }
        extra { $bundle['unexpected'] = 'no' }
        version { $bundle.version = '1' }
      }
      Denied { Save-GgsTestingCredentialBundle -CheckoutRoot $root -Bundle $bundle -Acknowledgement $ack }
      Assert (-not (Test-Path -LiteralPath (Join-Path $root '.local-secrets')))
    }
  }
  Check 'production, missing acknowledgement and relative paths fail closed' {
    $root = Root
    $original = $env:APP_ENV
    try { $env:APP_ENV = 'production'; Denied { Save $root } } finally { $env:APP_ENV = $original }
    Denied { Save-GgsTestingCredentialBundle -CheckoutRoot $root -Bundle (Bundle) -Acknowledgement 'not-approved' }
    Denied { Save-GgsTestingCredentialBundle -CheckoutRoot '.' -Bundle (Bundle) -Acknowledgement $ack }
  }
  Check 'unsafe existing secret directory is rejected without repairing its ACL' {
    $root = Root; $directory = Join-Path $root '.local-secrets'
    [void][IO.Directory]::CreateDirectory($directory)
    $before = (Get-Acl -LiteralPath $directory).Sddl
    Denied { Save $root }
    Assert ((Get-Acl -LiteralPath $directory).Sddl -ceq $before)
    Assert (@(Get-ChildItem -LiteralPath $directory -Force).Count -eq 0)
  }
  Check 'tampered encrypted payload is rejected with generic diagnostics' {
    $root = Root; Save $root
    $file = Join-Path $root '.local-secrets/ggs-testing-storage.dpapi'
    $bytes = [IO.File]::ReadAllBytes($file); $bytes[$bytes.Length - 1] = $bytes[$bytes.Length - 1] -bxor 1
    [IO.File]::WriteAllBytes($file,$bytes)
    Denied { Use $root }
  }
  Check 'truncated encrypted payload is rejected' {
    $root = Root; Save $root
    [IO.File]::WriteAllBytes((Join-Path $root '.local-secrets/ggs-testing-storage.dpapi'),[byte[]](1,2,3))
    Denied { Use $root }
  }
  Check 'loosened file permissions are rejected before decrypting' {
    $root = Root; Save $root
    $file = Join-Path $root '.local-secrets/ggs-testing-storage.dpapi'
    $acl = [IO.FileSystemAclExtensions]::GetAccessControl([IO.FileInfo]::new($file), [Security.AccessControl.AccessControlSections]::Access)
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-1-0'),'Read','Allow'))
    [IO.FileSystemAclExtensions]::SetAccessControl([IO.FileInfo]::new($file), $acl)
    Denied { Use $root }
  }
  Check 'junction checkout is rejected without creating secrets in the target' {
    $target = Root; $link = Join-Path $fixture ('link-' + [guid]::NewGuid().ToString('N'))
    [void](New-Item -ItemType Junction -Path $link -Target $target)
    try { Denied { Save $link }; Assert (-not (Test-Path -LiteralPath (Join-Path $target '.local-secrets'))) }
    finally { Remove-Item -LiteralPath $link -Force }
  }
  Check 'hard-linked credential file is rejected' {
    $root = Root; Save $root
    $file = Join-Path $root '.local-secrets/ggs-testing-storage.dpapi'
    $link = Join-Path $fixture ('hard-' + [guid]::NewGuid().ToString('N'))
    [void](New-Item -ItemType HardLink -Path $link -Target $file)
    try { Denied { Use $root } } finally { Remove-Item -LiteralPath $link -Force }
  }
  Check 'consumer exceptions and accidental return values cannot reveal a bundle' {
    $root = Root; Save $root
    Denied { Use $root { param($value) throw $value.intake.password } }
    Assert (@(Use $root { param($value) $value }).Count -eq 0)
  }
  Write-Output "Windows credential storage: $script:passes tests passed; fictional data only."
} finally {
  $resolved = [IO.Path]::GetFullPath($fixture)
  if ([IO.Path]::GetDirectoryName($resolved) -cne [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') -or
    [IO.Path]::GetFileName($resolved) -notmatch '^ggs-secret-fixture-[a-f0-9]{32}$') { throw 'Unsafe fixture cleanup target' }
  # Refuse recursive cleanup if an unexpected junction/reparse point survives.
  $links = @(Get-ChildItem -LiteralPath $resolved -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })
  if ($links.Count) { throw 'Fixture link cleanup incomplete' }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
