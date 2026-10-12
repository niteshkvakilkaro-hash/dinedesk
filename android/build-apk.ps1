# Builds an Android app (Trusted Web Activity) for a live HTTPS website with Bubblewrap.
#
#   .\build-apk.ps1 -Kind site  -Domain hungryhaveli.in -Package in.hungryhaveli.app -Name "Hungry Haveli"
#   .\build-apk.ps1 -Kind admin -Domain dinedesk.in     -Package in.dinedesk.admin   -Name "DineDesk"
#
# Needs: Node 18+, and (first run only) Bubblewrap downloads a JDK 17 and the Android SDK
# (~2 GB) into %USERPROFILE%\.bubblewrap. Output: app-release-signed.apk (install / share) and
# app-release-bundle.aab (upload to Play Store), plus the fingerprint for assetlinks.json.
param(
    [Parameter(Mandatory)] [ValidateSet('site', 'admin')] [string] $Kind,
    [Parameter(Mandatory)] [string] $Domain,
    [Parameter(Mandatory)] [string] $Package,
    [Parameter(Mandatory)] [string] $Name,
    [string] $Version = '1',
    [string] $ThemeColor = '',
    [string] $BackgroundColor = ''
)
$ErrorActionPreference = 'Stop'

$work = Join-Path $PSScriptRoot "build\$Package"
New-Item -ItemType Directory -Force $work | Out-Null

# The website's own manifest gives the name, colours and icons.
$manifestUrl = if ($Kind -eq 'site') { "https://$Domain/site.webmanifest" } else { "https://$Domain/admin.webmanifest" }
$manifest = Invoke-RestMethod $manifestUrl
if (-not $ThemeColor) { $ThemeColor = $manifest.theme_color }
if (-not $BackgroundColor) { $BackgroundColor = $manifest.background_color }
$icon = ($manifest.icons | Where-Object { $_.sizes -eq '512x512' -and -not $_.purpose } | Select-Object -First 1).src
$maskable = ($manifest.icons | Where-Object { $_.purpose -eq 'maskable' } | Select-Object -First 1).src
$startUrl = if ($Kind -eq 'site') { '/?source=app' } else { '/dashboard' }

# Signing key: made once and kept. Losing it means the app can never be updated.
$keystore = Join-Path $PSScriptRoot "keys\$Package.keystore"
if (-not $env:BUBBLEWRAP_KEYSTORE_PASSWORD) { throw 'Set $env:BUBBLEWRAP_KEYSTORE_PASSWORD and $env:BUBBLEWRAP_KEY_PASSWORD first (keep them safe).' }
if (-not $env:BUBBLEWRAP_KEY_PASSWORD) { $env:BUBBLEWRAP_KEY_PASSWORD = $env:BUBBLEWRAP_KEYSTORE_PASSWORD }

$twa = [ordered]@{
    packageId = $Package
    host = $Domain
    name = $Name
    launcherName = if ($Name.Length -gt 12) { $Name.Substring(0, 12) } else { $Name }
    display = 'standalone'
    orientation = 'portrait'
    themeColor = $ThemeColor
    navigationColor = $BackgroundColor
    navigationColorDark = $BackgroundColor
    backgroundColor = $BackgroundColor
    enableNotifications = $true
    startUrl = $startUrl
    iconUrl = "https://$Domain$icon"
    maskableIconUrl = if ($maskable) { "https://$Domain$maskable" } else { $null }
    splashScreenFadeOutDuration = 300
    signingKey = @{ path = $keystore; alias = 'upload' }
    appVersionName = "1.0.$Version"
    appVersionCode = [int] $Version
    shortcuts = @()
    generatorApp = 'bubblewrap-cli'
    webManifestUrl = $manifestUrl
    fallbackType = 'customtabs'
    features = @{}
    enableSiteSettingsShortcut = $false
    isChromeOSOnly = $false
    isMetaQuest = $false
    fullScopeUrl = "https://$Domain/"
    minSdkVersion = 21
}
$twa | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 (Join-Path $work 'twa-manifest.json')

Push-Location $work
try {
    if (-not (Get-Command bubblewrap -ErrorAction SilentlyContinue)) { npm install -g @bubblewrap/cli }
    if (-not (Test-Path $keystore)) {
        New-Item -ItemType Directory -Force (Split-Path $keystore) | Out-Null
        bubblewrap doctor | Out-Null   # first run: offers to download the JDK and Android SDK
        $keytool = Join-Path (Get-Content "$env:USERPROFILE\.bubblewrap\config.json" | ConvertFrom-Json).jdkPath 'bin\keytool.exe'
        & $keytool -genkeypair -v -keystore $keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000 `
            -storepass $env:BUBBLEWRAP_KEYSTORE_PASSWORD -keypass $env:BUBBLEWRAP_KEY_PASSWORD -dname "CN=$Name, O=$Name, C=IN"
    }
    bubblewrap update --skipVersionUpgrade --manifest twa-manifest.json
    bubblewrap build --skipPwaValidation
    $keytool = Join-Path (Get-Content "$env:USERPROFILE\.bubblewrap\config.json" | ConvertFrom-Json).jdkPath 'bin\keytool.exe'
    $sha = (& $keytool -list -v -keystore $keystore -alias upload -storepass $env:BUBBLEWRAP_KEYSTORE_PASSWORD | Select-String 'SHA256:').ToString().Split('SHA256:')[-1].Trim()
    Write-Host ''
    Write-Host "APK:  $work\app-release-signed.apk"
    Write-Host "AAB:  $work\app-release-bundle.aab (Play Store)"
    Write-Host "SHA-256: $sha"
    if ($Kind -eq 'site') {
        Write-Host "On the server:  php artisan android:app $Domain $Package $sha"
    } else {
        Write-Host "On the server .env:  ANDROID_ADMIN_PACKAGE=$Package  ANDROID_ADMIN_SHA256=$sha"
    }
    Write-Host 'Play Store re-signs apps: also add the "App signing key" SHA-256 from Play Console → App integrity.'
} finally {
    Pop-Location
}
