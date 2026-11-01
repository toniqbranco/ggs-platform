#Requires -Version 7.4
# Manual, separately approved operator entry point. Never run by app/CI/startup.
[CmdletBinding()]
param([Parameter(Mandatory)][ValidateSet('reviewed-gg-livestream-testing-provisioning')][string]$Acknowledgement)
$ErrorActionPreference='Stop'
$access=$null
try {
  if (-not $IsWindows -or $env:APP_ENV -eq 'production' -or $env:NODE_ENV -eq 'production') {throw 'deny'}
  $checkout=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
  if (Test-Path -LiteralPath (Join-Path $checkout '.local-secrets/ggs-testing-storage.dpapi')) {throw 'deny'}
  Import-Module (Join-Path $PSScriptRoot 'credential-handoff.psm1')
  Import-Module (Join-Path $PSScriptRoot 'supabase-operator.psm1')
  $access=Read-Host 'Enter the separately approved short-lived testing-project Management token (hidden)' -AsSecureString
  $gateway=New-GgsSupabaseOperatorGateway -CheckoutRoot $checkout -AccessToken $access -Acknowledgement $Acknowledgement
  $result=Invoke-GgsTestingCredentialHandoff -CheckoutRoot $checkout -Gateway $gateway -Acknowledgement $Acknowledgement
  Write-Output ("GG testing logins verified; operation="+$result.operationId)
} catch {
  $message=$_.Exception.Message
  if ($message -match '^GG testing handoff incomplete; phase=[a-z-]+; recovery=[a-z-]+; operation=[a-f0-9-]{36}$') {Write-Output $message}
  else {Write-Output 'GG testing operator stopped; no success confirmed. Review the state before retrying.'}
  exit 1
} finally {if ($access) {$access.Dispose()}}
