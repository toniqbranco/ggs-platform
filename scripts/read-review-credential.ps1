#Requires -Version 7.4
# Private child process. The caller captures only the selected credential.
[CmdletBinding()]
param([Parameter(Mandatory)][ValidateSet('ggs-local-owner-readonly-review','ggs-local-setup-reader')][string]$Acknowledgement)
$ErrorActionPreference='Stop'
try {
  $setup = $Acknowledgement -ceq 'ggs-local-setup-reader'
  $requiredEnvironment = if ($setup) { 'test' } else { 'development' }
  if (-not $IsWindows -or $env:APP_ENV -cne $requiredEnvironment -or
      -not [Console]::IsOutputRedirected -or -not [Console]::IsInputRedirected) {throw 'deny'}
  if ([Console]::In.ReadToEnd() -cne $Acknowledgement) {throw 'deny'}
  $checkout=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
  Import-Module (Join-Path $checkout 'proposals/application-storage/local-secret-store.psm1')
  if ($setup) {
    Invoke-GgsWithSetupReaderCredential -CheckoutRoot $checkout -Acknowledgement reviewed-gg-livestream-testing -Consumer {
      param($credential)
      [Console]::Out.Write(($credential | ConvertTo-Json -Compress))
    }
  } else {
    Invoke-GgsWithTestingCredentials -CheckoutRoot $checkout -Acknowledgement reviewed-gg-livestream-testing -Consumer {
      param($bundle)
      [Console]::Out.Write(($bundle.review | ConvertTo-Json -Compress))
    }
  }
} catch {exit 1}
