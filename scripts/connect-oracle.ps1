param(
  [string]$KeyPath = (Join-Path $env:USERPROFILE 'Downloads\oracle_vps.key'),
  [ValidateRange(1024, 65535)][int]$LocalPort = 4318
)
$ErrorActionPreference = 'Stop'
$studioUrl = "http://127.0.0.1:$LocalPort"
if (Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue) {
  try {
    $status = Invoke-RestMethod "$studioUrl/api/status" -TimeoutSec 5
    if ($null -ne $status.requiresAccess) {
      Write-Host "A Verifeed backend is already reachable at $studioUrl."
      exit 0
    }
  } catch { }
  throw "Port $LocalPort is already in use. Choose another -LocalPort and save that URL in the extension."
}
if (!(Test-Path -LiteralPath $KeyPath -PathType Leaf)) { throw "SSH key not found at $KeyPath. Supply -KeyPath with your existing key file path." }
$sshPath = (Get-Command ssh -ErrorAction Stop).Source
$logDirectory = Join-Path $PSScriptRoot '..\artifacts'
[void](New-Item -ItemType Directory -Path $logDirectory -Force)
$logPath = Join-Path $logDirectory 'oracle-tunnel.log'
$tunnelArgs = @('-i', ('"' + (Resolve-Path -LiteralPath $KeyPath).Path + '"'), '-N', '-L', "127.0.0.1:${LocalPort}:127.0.0.1:4317", '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', 'opc@84.235.240.141')
$tunnelProcess = Start-Process -FilePath $sshPath -ArgumentList $tunnelArgs -WindowStyle Hidden -RedirectStandardError $logPath -PassThru
for ($attempt = 0; $attempt -lt 15; $attempt++) {
  Start-Sleep -Milliseconds 600
  $tunnelProcess.Refresh()
  if ($tunnelProcess.HasExited) { throw "SSH stopped. Check $logPath for the connection error." }
  try {
    $status = Invoke-RestMethod "$studioUrl/api/status" -TimeoutSec 2
    if ($null -ne $status.requiresAccess) {
      Write-Host "Verifeed is connected to Oracle: $studioUrl"
      Write-Host "SSH tunnel process: $($tunnelProcess.Id). Run this script again after restarting Windows."
      exit 0
    }
  } catch { }
}
Stop-Process -Id $tunnelProcess.Id -ErrorAction SilentlyContinue
throw "Oracle did not answer. Check $logPath and the remote verifeed service."
