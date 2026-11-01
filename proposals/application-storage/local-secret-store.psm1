#Requires -Version 7.4
# Quarantined Windows API. Importing this module creates nothing. No database calls.
Set-StrictMode -Version Latest

function Stop-GgsStore { throw [InvalidOperationException]::new('GG testing credential store unavailable.') }
function Assert-GgsContext([string]$Acknowledgement) {
  if (-not $IsWindows -or $Acknowledgement -cne 'reviewed-gg-livestream-testing' -or
    $env:APP_ENV -eq 'production' -or $env:NODE_ENV -eq 'production') { Stop-GgsStore }
}
function Assert-GgsPlainPath([string]$Path) {
  $cursor = [IO.Path]::GetFullPath($Path)
  while ($cursor) {
    if (Test-Path -LiteralPath $cursor) {
      $item = Get-Item -LiteralPath $cursor -Force -ErrorAction Stop
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.LinkType) { Stop-GgsStore }
    }
    $parent = [IO.Path]::GetDirectoryName($cursor)
    if ($parent -eq $cursor) { break }
    $cursor = $parent
  }
}
function Get-GgsPaths([string]$CheckoutRoot) {
  if (-not [IO.Path]::IsPathFullyQualified($CheckoutRoot)) { Stop-GgsStore }
  $root = [IO.Path]::GetFullPath($CheckoutRoot)
  Assert-GgsPlainPath $root
  if (-not [IO.Directory]::Exists($root)) { Stop-GgsStore }
  $directory = Join-Path $root '.local-secrets'
  $file = Join-Path $directory 'ggs-testing-storage.dpapi'
  Assert-GgsPlainPath $file
  return @{ Directory = $directory; File = $file }
}
function Get-GgsAcl([bool]$Directory) {
  $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
  $acl = if ($Directory) { [Security.AccessControl.DirectorySecurity]::new() } else { [Security.AccessControl.FileSecurity]::new() }
  $acl.SetOwner($owner)
  $acl.SetAccessRuleProtection($true, $false)
  $inheritance = if ($Directory) { [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit' } else { [Security.AccessControl.InheritanceFlags]::None }
  foreach ($sid in @($owner, $system) | Select-Object -Unique) {
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,
      [Security.AccessControl.FileSystemRights]::FullControl, $inheritance,
      [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow))
  }
  return $acl
}
function Assert-GgsAcl([string]$Path, [bool]$Directory) {
  Assert-GgsPlainPath $Path
  $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $allowed = @($owner, 'S-1-5-18') | Select-Object -Unique
  $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
  if (-not $acl.AreAccessRulesProtected -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $owner) { Stop-GgsStore }
  $rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
  if ($rules.Count -ne $allowed.Count) { Stop-GgsStore }
  $inheritance = if ($Directory) { [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit' } else { [Security.AccessControl.InheritanceFlags]::None }
  foreach ($rule in $rules) {
    if ($rule.IdentityReference.Value -notin $allowed -or $rule.IsInherited -or
      $rule.AccessControlType -ne 'Allow' -or $rule.FileSystemRights -ne 'FullControl' -or
      $rule.InheritanceFlags -ne $inheritance -or $rule.PropagationFlags -ne 'None') { Stop-GgsStore }
  }
}
function ConvertTo-GgsCanonical([hashtable]$Bundle) {
  if ($Bundle.Count -ne 4 -or @($Bundle.Keys | Where-Object { $_ -cnotin @('version','projectId','intake','review') }).Count -or
    ($Bundle['version'] -isnot [int] -and $Bundle['version'] -isnot [long]) -or $Bundle['version'] -ne 1 -or $Bundle['projectId'] -cne 'rchxnmpsxfbsicthasxn') { Stop-GgsStore }
  $result = [ordered]@{ version = 1; projectId = 'rchxnmpsxfbsicthasxn' }
  foreach ($kind in @('intake','review')) {
    $channel = $Bundle[$kind]
    if ($channel -isnot [hashtable] -or $channel.Count -ne 2 -or
      @($channel.Keys | Where-Object { $_ -cnotin @('user','password') }).Count -or
      $channel['user'] -cne "ggs_pilot_${kind}_login.rchxnmpsxfbsicthasxn" -or
      $channel['password'] -isnot [string] -or $channel['password'] -cnotmatch '^[a-f0-9]{64}$') { Stop-GgsStore }
    $result[$kind] = [ordered]@{ user = $channel['user']; password = $channel['password'] }
  }
  if ($Bundle['intake']['password'] -ceq $Bundle['review']['password']) { Stop-GgsStore }
  return ConvertTo-Json -InputObject $result -Depth 4 -Compress
}
function Get-GgsEntropy { return [Text.Encoding]::UTF8.GetBytes('GG-testing-storage-v1:rchxnmpsxfbsicthasxn') }
function Read-GgsProtected([string]$File) {
  Assert-GgsAcl $File $false
  $length = (Get-Item -LiteralPath $File -Force -ErrorAction Stop).Length
  if ($length -lt 16 -or $length -gt 16384) { Stop-GgsStore }
  $encrypted = [IO.File]::ReadAllBytes($File)
  $plain = $null
  try {
    $plain = [Security.Cryptography.ProtectedData]::Unprotect($encrypted, (Get-GgsEntropy), [Security.Cryptography.DataProtectionScope]::CurrentUser)
    $bundle = ConvertFrom-Json -InputObject ([Text.Encoding]::UTF8.GetString($plain)) -AsHashtable -ErrorAction Stop
    # Canonical validation also rejects a decrypted payload for a different target.
    [void](ConvertTo-GgsCanonical $bundle)
    return $bundle
  } finally {
    if ($plain) { [Array]::Clear($plain, 0, $plain.Length) }
  }
}

function Save-GgsTestingCredentialBundle {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$CheckoutRoot,
    [Parameter(Mandatory)][hashtable]$Bundle,
    [Parameter(Mandatory)][string]$Acknowledgement)
  $plain = $null
  $pending = $null
  try {
    Assert-GgsContext $Acknowledgement
    $json = ConvertTo-GgsCanonical $Bundle
    $paths = Get-GgsPaths $CheckoutRoot
    if (Test-Path -LiteralPath $paths.File) { Stop-GgsStore } # Never overwrite/rotate.
    if (-not (Test-Path -LiteralPath $paths.Directory)) {
      [IO.FileSystemAclExtensions]::Create([IO.DirectoryInfo]::new($paths.Directory), (Get-GgsAcl $true))
    }
    Assert-GgsAcl $paths.Directory $true
    $plain = [Text.Encoding]::UTF8.GetBytes($json)
    $encrypted = [Security.Cryptography.ProtectedData]::Protect($plain, (Get-GgsEntropy), [Security.Cryptography.DataProtectionScope]::CurrentUser)
    $pending = Join-Path $paths.Directory ('.pending-' + [guid]::NewGuid().ToString('N') + '.dpapi')
    $stream = [IO.FileSystemAclExtensions]::Create([IO.FileInfo]::new($pending), [IO.FileMode]::CreateNew,
      [Security.AccessControl.FileSystemRights]::FullControl, [IO.FileShare]::None, 4096,
      [IO.FileOptions]::WriteThrough, (Get-GgsAcl $false))
    try { $stream.Write($encrypted, 0, $encrypted.Length); $stream.Flush($true) } finally { $stream.Dispose() }
    if ((ConvertTo-GgsCanonical (Read-GgsProtected $pending)) -cne $json) { Stop-GgsStore }
    Assert-GgsPlainPath $paths.File
    [IO.File]::Move($pending, $paths.File, $false) # Atomic rename; fails if occupied.
    $pending = $null
    if ((ConvertTo-GgsCanonical (Read-GgsProtected $paths.File)) -cne $json) { Stop-GgsStore }
    # No plaintext, path, bundle or pipeline output.
  } catch { Stop-GgsStore } finally {
    if ($plain) { [Array]::Clear($plain, 0, $plain.Length) }
    if ($pending -and [IO.File]::Exists($pending)) {
      # Only this operation's generated pending filename under the validated path.
      if ([IO.Path]::GetDirectoryName($pending) -cne $paths.Directory -or
        [IO.Path]::GetFileName($pending) -notmatch '^\.pending-[a-f0-9]{32}\.dpapi$') { Stop-GgsStore }
      Remove-Item -LiteralPath $pending -Force -ErrorAction Stop
    }
  }
}

function Invoke-GgsWithTestingCredentials {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$CheckoutRoot,
    [Parameter(Mandatory)][string]$Acknowledgement,
    [Parameter(Mandatory)][scriptblock]$Consumer)
  try {
    Assert-GgsContext $Acknowledgement
    $paths = Get-GgsPaths $CheckoutRoot
    Assert-GgsAcl $paths.Directory $true
    $bundle = Read-GgsProtected $paths.File
    # Trusted consumer only. Suppress success-stream output, including accidental
    # return of the bundle. Consumer must never log/transmit secrets itself.
    [void](& $Consumer $bundle)
  } catch { Stop-GgsStore }
}

Export-ModuleMember -Function Save-GgsTestingCredentialBundle, Invoke-GgsWithTestingCredentials
