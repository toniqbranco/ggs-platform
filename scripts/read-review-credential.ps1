#Requires -Version 7.4
# Internal child only. The parent captures this private pipe; never run manually.
[CmdletBinding()]
param([Parameter(Mandatory)][ValidateSet('ggs-local-owner-readonly-review')][string]$Acknowledgement)
$ErrorActionPreference='Stop'
try {
  if (-not $IsWindows -or $env:APP_ENV -cne 'development' -or
      -not [Console]::IsOutputRedirected -or -not [Console]::IsInputRedirected) {throw 'deny'}
  if ([Console]::In.ReadToEnd() -cne 'ggs-local-owner-readonly-review') {throw 'deny'}
  $checkout=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
  Import-Module (Join-Path $checkout 'proposals/application-storage/local-secret-store.psm1')
  Invoke-GgsWithTestingCredentials -CheckoutRoot $checkout -Acknowledgement reviewed-gg-livestream-testing -Consumer {
    param($bundle)
    # Explicit private pipe output bypasses the store's suppressed success stream.
    # Only the review credential reaches the app; intake stays in this child.
    [Console]::Out.Write(($bundle.review | ConvertTo-Json -Compress))
  }
} catch {exit 1}
