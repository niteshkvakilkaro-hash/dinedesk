# Android app

**One app, DineDesk, for guests and businesses.** It opens `/app` on the platform host (find a
place, scan a table or room QR, recently visited, business sign-in) and keeps the platform host and
every business subdomain inside the app. It is a small WebView app (`webview-app/`, plain Java, no
AndroidX): nothing of the website is copied into it, so every website update reaches it at once.
Pages know they are in the app from the user-agent token `DineDeskApp/1`
(`frontend/src/lib/dinedeskApp.ts`).

| Build | App id | Opens | Signed with |
| --- | --- | --- | --- |
| `dev` (local testing) | `com.dinedesk.admin.local` (the id of the earlier local DineDesk app, so it updates in place) | `http://<pc-ip>:5180/app`; businesses at `http://<slug>.<pc-ip>.nip.io:5180` | `keys/dinedesk-local.keystore` (made by `build-local.ps1`) |
| `prod` (Play Store) | `in.dinedesk.app` (permanent once published) | `https://<platformHost>/app`; businesses at `https://<slug>.<platformHost>` | the Play upload key (`upload-keystore.properties`) |

## What the app does

- **Stays inside** for the platform host and any subdomain of it (dev: `<pc-ip>` and `*.<pc-ip>.nip.io`).
  A business on its **own domain** opens inside too, once the web app has confirmed it: `openPlace()`
  (`features/app/places.ts`) calls `DineDeskAndroid.allowHost(host)` before navigating, after the
  server said yes (`/api/v1/directory/place?host=`, or a place from the directory). The app remembers
  those hosts (https only). Every other website opens in the phone's browser, so a page can't pull a
  stranger's site into the app.
- **Other apps**: `tel:` (dialer), `mailto:`, `whatsapp:` and `https://wa.me/…` / `api.whatsapp.com`
  (WhatsApp), `upi://pay…` (GPay / PhonePe / Paytm chooser), `geo:` and Google Maps links (Maps),
  `intent:` links (made browsable-only, with `browser_fallback_url`). A toast says so when no app can open it.
- **Uploads**: `<input type=file>` with `accept` (several types, extensions), `multiple` and
  `capture` (straight to the camera). Photos are offered next to files when images are accepted.
- **Camera** for Scan QR (`getUserMedia`), after the Android camera permission; DineDesk pages only.
- **Location** for "Use my location" (checkout delivery, ordering settings), DineDesk pages only.
- **Downloads**: the dashboard fetches files with its Bearer token and saves them with `saveBlob()`;
  in the app that goes through `DineDeskAndroid.saveBegin/saveChunk/saveEnd` (512 KB base64 parts) into
  **Downloads** (Android 10+; on 7–9 into the app's own Downloads folder). Bills / documents opened
  with "View" open in a PDF or image viewer. QR images (`<a href="data:…" download>`) are saved with
  their names. Plain `http(s)` downloads go to DownloadManager.
- **Printing**: `window.print()` does nothing in a WebView. KOTs and bills (`printSlip`) are printed from
  an off-screen page with the slip's HTML; QR sheets (`printPage`) print the page on screen. Both use
  the phone's print service (e.g. a thermal printer's Android print plugin, or Save as PDF).
- **Back**: page history; on the `/app` start screen (or with no history) press back twice to exit.
- **No internet**: a local "No internet — Retry" page.
- **Splash**: Android 12+ splash screen (the bell on `#14110F`), held until the first page draws (max 3 s).
- Cookies, `localStorage` and DOM storage are kept. Plain http and mixed content only in the dev
  build (its network security config allows http to the PC's IP, `nip.io` and `localhost` only).

Not in the app: **web push** (WebView has no Push API: alerts need the browser or the installed web
app), and **pull to refresh** (it reloads by accident on pages with their own scrolling, like the
POS and kitchen screen; the app has Retry and every page has its own refresh).

On the **dev build** (plain http) the browser treats pages as not secure, so the live **camera QR
scanner and "Use my location" don't work there**: the scanner falls back to typing the address. On
production (https) both work.

## Local test APK

```powershell
powershell -ExecutionPolicy Bypass -File android\webview-app\build-local.ps1
#   → android\apk\DineDesk-local.apk   (-DevHost 192.168.1.40 -DevPort 5173 to override)
```

Uses the JDK 17 and SDK in `%USERPROFILE%\Android` and Gradle 8.13+ from `~/.gradle` (no download;
`--no-daemon`, one worker, 768 MB heap, fine on a 4 GB PC). It finds this PC's Wi-Fi IP and bakes
`http://<ip>:5180/app` into the app: rebuild when the IP changes.

Testing on a phone:

1. Run the dev servers (frontend on port 5180, `APP_ENV=local` in the backend so `<slug>.<ip>.nip.io` maps to the business).
2. Phone and PC on the **same Wi-Fi**.
3. Once, in an **admin** PowerShell, let the phone in:
   `New-NetFirewallRule -DisplayName "DineDesk dev 5180" -Direction Inbound -Protocol TCP -LocalPort 5180 -Action Allow -Profile Any`
4. Copy `DineDesk-local.apk` to the phone and install it (allow "install unknown apps"). It replaces
   the earlier local DineDesk app; uninstall the old **Haveli Demo** app, business sites now open inside DineDesk.
5. Debug pages from the PC: Chrome → `chrome://inspect` (the dev build allows WebView debugging).

## Production (Play Store) — later, once the domain is decided

1. The site live on **HTTPS** at the platform domain, with business subdomains (`*.domain`).
2. An upload key, kept safe and never committed (losing it means a key reset through Play support):
   ```powershell
   $jdk = (Get-ChildItem "$env:USERPROFILE\Android" -Directory -Filter 'jdk-17*')[0].FullName
   & "$jdk\bin\keytool.exe" -genkeypair -keystore android\keys\dinedesk-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```
   and `android\webview-app\upload-keystore.properties` (git-ignored):
   `storeFile=C:/…/android/keys/dinedesk-upload.jks`, `storePassword=…`, `keyAlias=upload`, `keyPassword=…`.
3. Build with the same JDK, SDK and Gradle as `build-local.ps1` (`$env:JAVA_HOME = $jdk`; quote the
   `-P` arguments in PowerShell, or `.com` is split off):
   ```powershell
   cd android\webview-app
   $gradle = (Get-ChildItem "$env:USERPROFILE\.gradle\wrapper\dists" -Recurse -Filter gradle.bat | Where-Object FullName -match 'gradle-8\.1[3-9]')[0].FullName
   & $gradle --no-daemon bundleProdRelease assembleProdRelease "-PplatformHost=dinedesk.in" "-PversionCode=3" "-PversionName=1.2"
   ```
   Without `-PplatformHost` or the upload key the build stops with a message saying what is missing.
   Output: `app/build/outputs/bundle/prodRelease/app-prod-release.aab` (upload to Play) and the APK.
   Raise `versionCode` for every upload.
4. **assetlinks.json** is not needed for the WebView app itself. Only if the app later claims links
   (Android App Links, so `https://<domain>/…` links open in the app), set `ANDROID_ADMIN_PACKAGE=in.dinedesk.app`
   and `ANDROID_ADMIN_SHA256=<upload sha256>,<Play app-signing sha256>` in the backend `.env`; the platform
   host's `/.well-known/assetlinks.json` then lists it.

## A business's own app (optional, Trusted Web Activity)

A business that wants **its own** Play Store app can still get one with
[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap): `build-apk.ps1` wraps its live HTTPS
website as a Trusted Web Activity (needs Node 18+, ~2 GB of JDK and SDK in `%USERPROFILE%\.bubblewrap`):

```powershell
cd android
$env:BUBBLEWRAP_KEYSTORE_PASSWORD = '<a strong password>'
.\build-apk.ps1 -Kind site -Domain hungryhaveli.in -Package in.hungryhaveli.app -Name "Hungry Haveli"
```

Then on the server `php artisan android:app hungryhaveli.in in.hungryhaveli.app <sha256> [<play sha256>]`,
so `https://hungryhaveli.in/.well-known/assetlinks.json` lists the app (otherwise it shows a browser bar).
`-Kind admin` (a TWA of the dashboard) is superseded by the DineDesk app above.

`keys/` holds the signing keystores. **Back them up and never commit them** (they are git-ignored).
