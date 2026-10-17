# Keeps the local development servers running (for testing on phones over Wi-Fi).
# Every 15 s it checks each one and starts whatever is missing, hidden, with logs in
# backend/storage/logs/dev-*.log. Safe to run twice: a second copy exits at once.
#
#   powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File scripts\dev-servers.ps1
#
# Stop everything: scripts\dev-servers-stop.ps1
$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$logs = Join-Path $backend 'storage\logs'
$php = 'C:\xampp\php\php.exe'

# One watchdog only.
$mutex = New-Object System.Threading.Mutex($false, 'Global\DineDeskDevServers')
if (-not $mutex.WaitOne(0)) { exit }

function Listening([int] $port) {
    [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Running([string] $pattern) {
    [bool](Get-CimInstance Win32_Process -Filter "Name = 'php.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*$pattern*" })
}

function Start-Hidden([string] $file, [string] $arguments, [string] $dir, [string] $name) {
    $log = Join-Path $logs "dev-$name.log"
    Add-Content $log "`n=== $(Get-Date -Format s) starting $name ==="
    # cmd /c needs the whole command wrapped in one more pair of quotes when it starts with a quoted path.
    Start-Process -FilePath 'cmd.exe' -ArgumentList "/c `"`"$file`" $arguments >> `"$log`" 2>&1`"" -WorkingDirectory $dir -WindowStyle Hidden
}

while ($true) {
    if (-not (Listening 3306)) {
        Start-Process -FilePath 'C:\xampp\mysql\bin\mysqld.exe' -ArgumentList '--defaults-file=C:\xampp\mysql\bin\my.ini', '--standalone' -WorkingDirectory 'C:\xampp\mysql' -WindowStyle Hidden
        Start-Sleep -Seconds 8
    }
    if (-not (Listening 8010)) { Start-Hidden $php 'artisan serve --host=0.0.0.0 --port=8010' $backend 'backend' }
    if (-not (Listening 8080)) { Start-Hidden $php 'artisan reverb:start --port=8080' $backend 'reverb' }
    if (-not (Running 'queue:work')) { Start-Hidden $php 'artisan queue:work --sleep=3 --tries=3' $backend 'queue' }
    if (-not (Running 'schedule:work')) { Start-Hidden $php 'artisan schedule:work' $backend 'schedule' }
    if (-not (Listening 5180)) {
        $env:RAYON_NUM_THREADS = '1'
        # Vite straight through node: npx.cmd can resolve to a broken copy inside node_modules.
        $node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
        if (-not $node) { $node = 'C:\Program Files\nodejs\node.exe' }
        Start-Hidden $node 'node_modules\vite\bin\vite.js --port 5180 --host' $frontend 'vite'
    }
    Start-Sleep -Seconds 15
}
