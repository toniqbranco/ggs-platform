$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'Windows fixture required'}
$source=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Import-Module (Join-Path $source 'proposals/application-storage/local-secret-store.psm1')
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('ggs-review-bridge-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory((Join-Path $fixture 'scripts'))
[void][IO.Directory]::CreateDirectory((Join-Path $fixture 'proposals/application-storage'))
Copy-Item -LiteralPath (Join-Path $source 'scripts/read-review-credential.ps1') -Destination (Join-Path $fixture 'scripts/read-review-credential.ps1')
Copy-Item -LiteralPath (Join-Path $source 'proposals/application-storage/local-secret-store.psm1') -Destination (Join-Path $fixture 'proposals/application-storage/local-secret-store.psm1')
function Assert([bool]$value){if(-not $value){throw 'Review credential fixture assertion failed; diagnostics suppressed'}}
function InvokeReader([string]$appEnv,[string]$purpose,[string]$acknowledgement="ggs-local-owner-readonly-review",[string]$setupFlag=""){
 $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=(Get-Process -Id $PID).Path
 $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 $start.Environment['APP_ENV']=$appEnv;$start.Environment['NODE_ENV']='test';$start.Environment['GGS_PILOT_SETUP_ENABLED']=$setupFlag
 foreach($arg in @('-NoLogo','-NoProfile','-NonInteractive','-File',(Join-Path $fixture 'scripts/read-review-credential.ps1'),'-Acknowledgement',$acknowledgement)){$start.ArgumentList.Add($arg)}
 $process=[Diagnostics.Process]::new();$process.StartInfo=$start
 try{
  [void]$process.Start();$stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
  $process.StandardInput.Write($purpose);$process.StandardInput.Close()
  if(-not $process.WaitForExit(10000)){$process.Kill($true);throw 'Fixture child timeout'}
  return @{code=$process.ExitCode;output=$stdout.GetAwaiter().GetResult();diagnostic=$stderr.GetAwaiter().GetResult()}
 }finally{$process.Dispose()}
}
try{
 $bundle=@{version=1;projectId='rchxnmpsxfbsicthasxn';intake=@{user='ggs_pilot_intake_login.rchxnmpsxfbsicthasxn';password=('a'*64)};review=@{user='ggs_pilot_review_login.rchxnmpsxfbsicthasxn';password=('b'*64)}}
 Save-GgsTestingCredentialBundle -CheckoutRoot $fixture -Bundle $bundle -Acknowledgement reviewed-gg-livestream-testing
 $result=InvokeReader development 'ggs-local-owner-readonly-review'
 Assert ($result.code-eq 0 -and $result.diagnostic-eq '')
 $data=ConvertFrom-Json -InputObject $result.output -AsHashtable
 Assert ($data.Count-eq 2 -and $data.user-ceq $bundle.review.user -and $data.password-ceq $bundle.review.password -and -not $result.output.Contains($bundle.intake.password))
 Write-Output 'PASS: private pipe returns only the fictional review credential'
 foreach($appEnv in @('production','test')){$result=InvokeReader $appEnv 'ggs-local-owner-readonly-review';Assert ($result.code-ne 0-and $result.output-eq '')}
 Write-Output 'PASS: production and test runtimes cannot export stored credentials'
 $result=InvokeReader development 'incorrect-purpose';Assert ($result.code-ne 0-and $result.output-eq '')
 Write-Output 'PASS: unexpected pipe purpose cannot export credentials'
 Remove-Item -LiteralPath (Join-Path $fixture '.local-secrets/ggs-testing-storage.dpapi')
 $result=InvokeReader development 'ggs-local-owner-readonly-review';Assert ($result.code-ne 0-and $result.output-eq '')
 Write-Output 'PASS: missing encrypted bundle fails without credential output'
 $credential=@{user='ggs_ob_reader_login.rchxnmpsxfbsicthasxn';password=('c'*64)}
 $module=Get-Module local-secret-store
 & $module {
   param($root,$value)
   $file=Join-Path $root '.local-secrets/ggs-setup-reader.dpapi'
   $plain=[Text.Encoding]::UTF8.GetBytes(($value | ConvertTo-Json -Compress))
   try {
     $entropy=[Text.Encoding]::UTF8.GetBytes('GG-setup-reader-v1:rchxnmpsxfbsicthasxn')
     $encrypted=[Security.Cryptography.ProtectedData]::Protect($plain,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
     $stream=[IO.FileSystemAclExtensions]::Create([IO.FileInfo]::new($file),[IO.FileMode]::CreateNew,[Security.AccessControl.FileSystemRights]::FullControl,[IO.FileShare]::None,4096,[IO.FileOptions]::WriteThrough,(Get-GgsAcl $false))
     try { $stream.Write($encrypted,0,$encrypted.Length) } finally { $stream.Dispose() }
   } finally { [Array]::Clear($plain,0,$plain.Length) }
 } $fixture $credential
 $purpose='ggs-local-setup-reader'
 $result=InvokeReader test $purpose $purpose
 Assert ($result.code-ne 0 -and $result.output-eq '')
 $result=InvokeReader test $purpose $purpose single-streamer
 Assert ($result.code-eq 0 -and $result.diagnostic-eq '')
 $data=ConvertFrom-Json -InputObject $result.output -AsHashtable
 Assert ($data.Count-eq 2 -and $data.user-ceq $credential.user -and $data.password-ceq $credential.password)
 Write-Output 'PASS: enabled setup reader receives only its dedicated fictional credential'
}finally{
 $resolved=[IO.Path]::GetFullPath($fixture)
 if(-not $resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath())) -or [IO.Path]::GetFileName($resolved)-notmatch '^ggs-review-bridge-[a-f0-9]{32}$'){throw 'Fixture cleanup path rejected'}
 Remove-Item -LiteralPath $resolved -Recurse -Force
}
