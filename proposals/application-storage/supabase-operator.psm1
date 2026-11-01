#Requires -Version 7.4
# Operator API only. Importing creates nothing; no automatic authentication.
Set-StrictMode -Version Latest
function New-GgsSupabaseOperatorGateway {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$CheckoutRoot,
    [Parameter(Mandatory)][Security.SecureString]$AccessToken,
    [Parameter(Mandatory)][string]$Acknowledgement)
  if (-not $IsWindows -or $Acknowledgement -cne 'reviewed-gg-livestream-testing-provisioning' -or
    $env:APP_ENV -eq 'production' -or $env:NODE_ENV -eq 'production' -or
    -not [IO.Path]::IsPathFullyQualified($CheckoutRoot) -or $AccessToken.Length -lt 32) {
    throw [InvalidOperationException]::new('GG testing operator unavailable.')
  }
  $node = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
  $entry = Join-Path $PSScriptRoot 'operator-main.ts'
  $invoke = {
    param([string]$Action,[string]$Project,[string]$Operation,$Bundle=$null)
    $pointer = [IntPtr]::Zero
    $process = $null
    $started = $false
    $stage = 'context'
    try {
      if ($Project -cne 'rchxnmpsxfbsicthasxn' -or $Operation -notmatch '^[a-f0-9-]{36}$' -or
        $Action -cnotin @('preflight','prepare','enable','verify','disable')) { throw 'deny' }
      $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($AccessToken)
      $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
      $payload = @{appEnv='development';acknowledgement='reviewed-gg-livestream-testing-provisioning';accessToken=$token;action=$Action;operationId=$Operation}
      if ($null -ne $Bundle) { $payload.bundle=$Bundle }
      $start = [Diagnostics.ProcessStartInfo]::new()
      $start.FileName=$node; $start.WorkingDirectory=$CheckoutRoot
      $start.UseShellExecute=$false; $start.CreateNoWindow=$true
      $start.RedirectStandardInput=$true; $start.RedirectStandardOutput=$true; $start.RedirectStandardError=$true
      foreach ($unsafe in @('NODE_OPTIONS','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED')) { [void]$start.Environment.Remove($unsafe) }
      foreach ($argument in @('--conditions=react-server','--import','tsx',$entry)) { $start.ArgumentList.Add($argument) }
      $process=[Diagnostics.Process]::new();$process.StartInfo=$start
      $stage='start'
      if (-not $process.Start()) { throw 'deny' }
      $started=$true
      $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
      # Credentials travel only over the private child's stdin, not args/env/files.
      $process.StandardInput.Write(($payload | ConvertTo-Json -Depth 5 -Compress));$process.StandardInput.Close()
      if (-not $process.WaitForExit(90000)) { $process.Kill($true);throw 'deny' }
      $diagnostic=$stderr.GetAwaiter().GetResult()
      $stage='child-startup'
      if ($process.ExitCode -ne 0) {
        if ($diagnostic.Trim() -ceq 'GG testing operator unavailable.') { $stage='child-rejected' }
        throw 'deny'
      }
      $stage='protocol'
      $result=ConvertFrom-Json -InputObject ($stdout.GetAwaiter().GetResult()) -AsHashtable -ErrorAction Stop
      if ($result -isnot [hashtable]) { throw 'deny' }
      return $result
    } catch {
      $failure=[InvalidOperationException]::new('GG testing operator unavailable.')
      $failure.Data['stage']=$stage
      throw $failure
    }
    finally {
      if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
      if ($process) {
        if ($started) { try { if (-not $process.HasExited) { $process.Kill($true) } } catch {} }
        $process.Dispose()
      }
    }
  }.GetNewClosure()
  return @{
    Preflight={param($p,$o) & $invoke 'preflight' $p $o}.GetNewClosure()
    PrepareDisabled={param($p,$o,$b) & $invoke 'prepare' $p $o $b}.GetNewClosure()
    Enable={param($p,$o) & $invoke 'enable' $p $o}.GetNewClosure()
    Verify={param($p,$o,$b) & $invoke 'verify' $p $o $b}.GetNewClosure()
    Disable={param($p,$o) & $invoke 'disable' $p $o}.GetNewClosure()
  }
}
Export-ModuleMember -Function New-GgsSupabaseOperatorGateway
