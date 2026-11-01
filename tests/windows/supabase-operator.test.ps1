$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot '../../proposals/application-storage/supabase-operator.psm1') -Force
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$token=ConvertTo-SecureString ('!'*40) -AsPlainText -Force # Invalid fixture token: child denies before any HTTP.
$ack='reviewed-gg-livestream-testing-provisioning'
$script:passes=0
function Assert([bool]$value){if(-not $value){throw 'Fixture assertion failed'}}
function Denied([scriptblock]$action,[string]$stage=''){try{&$action;throw 'Missing denial'}catch{Assert ($_.Exception.Message -ceq 'GG testing operator unavailable.');if($stage){Assert ($_.Exception.Data['stage'] -ceq $stage)}}}
function Check([string]$name,[scriptblock]$action){try{&$action;$script:passes++;Write-Output "PASS: $name"}catch{throw "FAIL: $name (diagnostics suppressed)"}}
Check 'gateway constructor is lazy and exposes only the five callbacks' {
  $gateway=New-GgsSupabaseOperatorGateway -CheckoutRoot $root -AccessToken $token -Acknowledgement $ack
  Assert ($gateway.Count -eq 5)
  foreach($name in @('Preflight','PrepareDisabled','Enable','Verify','Disable')){Assert ($gateway[$name] -is [scriptblock])}
}
Check 'missing acknowledgement and production deny before a child is started' {
  Denied {New-GgsSupabaseOperatorGateway -CheckoutRoot $root -AccessToken $token -Acknowledgement 'no'}
  $old=$env:APP_ENV
  try{$env:APP_ENV='production';Denied {New-GgsSupabaseOperatorGateway -CheckoutRoot $root -AccessToken $token -Acknowledgement $ack}}finally{$env:APP_ENV=$old}
}
Check 'wrong project is refused before child invocation' {
  $gateway=New-GgsSupabaseOperatorGateway -CheckoutRoot $root -AccessToken $token -Acknowledgement $ack
  Denied {& $gateway.Preflight 'other-project' ([guid]::NewGuid().ToString())}
}
Check 'private stdin child rejects invalid fixture token without raw diagnostics or network' {
  $gateway=New-GgsSupabaseOperatorGateway -CheckoutRoot $root -AccessToken $token -Acknowledgement $ack
  Denied {& $gateway.Preflight 'rchxnmpsxfbsicthasxn' ([guid]::NewGuid().ToString())} 'child-rejected'
}
Write-Output "Windows Supabase operator: $script:passes tests passed; invalid token only, no HTTP."
