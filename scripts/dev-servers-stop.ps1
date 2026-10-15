# Stops the dev-servers watchdog and the servers it keeps running (not MySQL).
$ErrorActionPreference = 'SilentlyContinue'
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" | Where-Object { $_.CommandLine -like '*dev-servers.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Get-CimInstance Win32_Process -Filter "Name = 'php.exe'" | Where-Object { $_.CommandLine -match 'artisan (serve|reverb:start|queue:work|schedule:work)' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
foreach ($port in 8010, 8080, 5180) {
    Get-NetTCPConnection -LocalPort $port -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
}
Write-Host 'DineDesk dev servers stopped.'
