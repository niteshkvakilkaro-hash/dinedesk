# Builds the DineDesk app (one app for guests and businesses) for testing on a phone on the same
# Wi-Fi as this PC: it opens http://<pc-ip>:<port>/app, the dev server. Output: ..\apk\DineDesk-local.apk
#
#   .\build-local.ps1                      # uses this PC's Wi-Fi IP
#   .\build-local.ps1 -DevHost 192.168.1.40 -DevPort 5173
param(
    [string] $DevHost = '',
    [string] $DevPort = '5180',
    [string] $Sdk = "$env:USERPROFILE\Android\Sdk",
    [string] $Jdk = (Get-ChildItem "$env:USERPROFILE\Android" -Directory -Filter 'jdk-17*' | Select-Object -First 1).FullName
)
$ErrorActionPreference = 'Stop'
# keytool and Gradle write progress to stderr; Windows PowerShell 5.1 would treat that as an error.
function Native([scriptblock] $cmd) { $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'; try { & $cmd 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = $old } }
Set-Location $PSScriptRoot

if (-not $DevHost) {
    $DevHost = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -match '^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1).IPAddress
}
if (-not $DevHost) { throw "Could not find this PC's Wi-Fi IP: pass -DevHost 192.168.x.x" }
Write-Host "Phone will open http://${DevHost}:$DevPort/app (businesses: http://<slug>.$DevHost.nip.io:$DevPort)"

$env:JAVA_HOME = $Jdk
$env:ANDROID_HOME = $Sdk
"sdk.dir=$($Sdk -replace '\\', '/')" | Set-Content -Encoding ascii local.properties

# A signing key made once and kept (git-ignored). Updates must be signed with the same key.
$keystore = Join-Path $PSScriptRoot '..\keys\dinedesk-local.keystore'
if (-not (Test-Path 'keystore.properties')) {
    New-Item -ItemType Directory -Force (Split-Path $keystore) | Out-Null
    $pass = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
    Native { & "$Jdk\bin\keytool.exe" -genkeypair -keystore $keystore -alias local -keyalg RSA -keysize 2048 -validity 10000 `
        -storepass $pass -keypass $pass -dname 'CN=DineDesk Local, O=DineDesk, C=IN' }
    @("storeFile=$((Resolve-Path $keystore).Path -replace '\\', '/')", "storePassword=$pass", 'keyAlias=local', "keyPassword=$pass") | Set-Content -Encoding ascii keystore.properties
}

# Gradle from the local cache (no wrapper download).
$gradle = Get-ChildItem "$env:USERPROFILE\.gradle\wrapper\dists" -Recurse -Filter gradle.bat | Where-Object FullName -match 'gradle-8\.1[3-9]' | Select-Object -First 1
if (-not $gradle) { throw 'Gradle 8.13+ not found in ~/.gradle/wrapper/dists.' }

Native { & $gradle.FullName --no-daemon assembleDevRelease "-PdevHost=$DevHost" "-PdevPort=$DevPort" }
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }

$out = Join-Path $PSScriptRoot '..\apk'
New-Item -ItemType Directory -Force $out | Out-Null
# The separate Haveli Demo app is gone: business sites open inside DineDesk.
Remove-Item (Join-Path $out 'HaveliDemo-local.apk') -ErrorAction SilentlyContinue
Copy-Item 'app\build\outputs\apk\dev\release\app-dev-release.apk' (Join-Path $out 'DineDesk-local.apk') -Force
Get-ChildItem $out -Filter *.apk | Select-Object Name, @{ n = 'KB'; e = { [math]::Round($_.Length / 1KB) } }
