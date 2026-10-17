# Android app

**One app, DineDesk, for guests and businesses.** It opens `/app` on the platform host (find a
place, scan a table or room QR, recently visited, business sign-in) and keeps the platform host and
every business subdomain inside the app. It is a small WebView app (`webview-app/`, plain Java; its
only library is Firebase Cloud Messaging, which brings AndroidX): nothing of the website is copied
into it, so every website update reaches it at once.
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

## Rider location while on duty

Delivery riders share their location with the restaurant while on duty (`/rider/`). A WebView stops
running JavaScript in the background, so in the app a **foreground service** (`LocationService.java`)
takes the positions and uploads them itself. Web side and contract:
`frontend/src/features/rider/locationSharing.ts`; API: `POST /api/v1/tenant/rider/locations`
(`RiderController::locations`).

- **Bridge** (`window.DineDeskAndroid`, DineDesk pages only):
  `startLocationSharing(json)` (`{ uploadUrl, token, intervalSec, tenantHost, locale, expiresAt }`),
  `stopLocationSharing()` (sends what is queued once, then stops), `locationSharingStatus()`
  (`{ running, lastSentAt, lastError, queued }`) and `sendLocationNow()`. The upload token goes only
  to a DineDesk host (the same check as pages that open inside the app).
- **Permissions**, asked when the rider goes on duty: Location (precise or approximate) and, on
  Android 13+, Notifications (for the "sharing your location" notification; the service also runs
  without it). Permission dialogs are asynchronous, so `startLocationSharing` returns `true` once the
  dialog is shown and the service starts when Location is allowed; a refusal shows as
  `lastError: "denied"` in the status (the rider screen checks it every 15 s). It returns `false` at
  once when Location is switched off on the phone (`lastError: "position"`), the token has already
  ended, or the settings are bad. **No "Allow all the time" (background location)**: a foreground
  service of type `location` started while the app is on screen keeps "while in use" access even with
  the screen off or another app open, which is all a shift needs, and Play reviews background location
  strictly. Manifest: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` (Android 14+),
  `POST_NOTIFICATIONS`, `WAKE_LOCK` (held only for the seconds a position is taken and uploaded).
- **Positions** come from Android's own `LocationManager` (GPS and network providers, no Google Play
  services). Every `intervalSec` (300 s by default, at least 60) the best fresh position (or one
  waited for up to 20 s) is queued with accuracy, speed, heading, battery % and its UTC time, and the
  queue is uploaded in batches of 50. The queue holds at most 500 points (oldest dropped), is kept only
  while the service runs and is **cleared when sharing stops**; nothing is recorded while the service
  isn't running. Queue and answer handling are plain Java (`RiderQueue.java`), checked without
  Android by `app/src/test/java/com/dinedesk/app/RiderQueueTest.java` (`javac` + `java`, see its header).
- **Answers**: 200 → sent points dropped, follows `interval_sec`, stops when `on_duty` is false;
  401/403 → stops (token ended); 409 `not_on_duty` → queue cleared, stops; 422 → that batch dropped;
  429 / 5xx / no internet → kept for the next try. It also stops a minute before `expiresAt`.
- **Notification**: "DineDesk — sharing your location while on duty". Tapping it opens the app on the
  rider screen. Duty is ended on that screen (so the server knows), not from the notification.
- **App closed or swiped away**: the service keeps going. **Phone restarted or app killed by the
  system**: it does not come back by itself (`START_NOT_STICKY`: Android doesn't let a location
  service start from the background, and the token may have ended); the rider opens the app again and
  goes on duty.
- **Dev build**: this works on the http dev build too (it doesn't need a secure page); uploads go over
  plain http to the PC's IP / `nip.io`, which the dev network security config allows. Production is https only.

**Battery savers.** Some phones (Xiaomi / Redmi / POCO, Oppo, Realme, Vivo, OnePlus, Samsung with
"Put unused apps to sleep") still stop background apps. Tell riders to set **Battery → Unrestricted**
(or "No restrictions"; on Xiaomi also turn on **Autostart**) for DineDesk in the phone's settings
(Settings → Apps → DineDesk → Battery), and not to clear DineDesk with a "clean all" booster.

## App notifications (Firebase Cloud Messaging)

A WebView has no web push, so signed-in owners, staff, riders and super admins get the same alerts
(new order, table / room booking, banquet enquiry, tiffin request, rider job, referral reward, test
alert) as **app notifications** through Firebase. Both halves are needed:

| Half | What | Where |
| --- | --- | --- |
| App | `google-services.json` (the Android apps' config) | `android/webview-app/app/google-services.json` (git-ignored), then rebuild |
| Server | the **service-account key** (JSON with a private key) | Super admin → Integrations → **Firebase (app notifications)** (or `FIREBASE_CREDENTIALS` in `backend/.env`) |

Without them everything builds and runs with notifications off: the build logs nothing special,
`BuildConfig.FCM_ENABLED` is `false`, `PushService` is disabled in the manifest, the bridge's
`pushToken()` returns `''` and My account shows "not available in this version of the app yet".

**Create the Firebase project (once):**

1. <https://console.firebase.google.com> → **Add project** (e.g. "DineDesk"; Google Analytics not needed).
2. Project settings → **Your apps** → **Add app → Android**, twice:
   `in.dinedesk.app` (Play Store build) and `com.dinedesk.admin.local` (local test build). The
   SHA-1 field is optional (not needed for messaging).
3. Download **google-services.json** (one file lists both apps; download it again after adding the
   second app) and put it at `android/webview-app/app/google-services.json`. Never commit it.
4. Project settings → **Service accounts** → **Generate new private key** → a `.json` file. Paste it
   (or choose the file) in Super admin → Integrations → Firebase, enter your password, Save. Keep the
   file safe; delete it from Downloads afterwards.
5. Rebuild the app (`build-local.ps1`, or the prod build below) and install it. On the phone: sign
   in, My account → **Alerts on this device** → **Allow notifications**. Integrations → Firebase →
   **Test** sends a test notification to the phones where you are signed in as the super admin.

**How it works.** No google-services Gradle plugin: `app/build.gradle` reads `google-services.json`
at build time and takes the client whose `package_name` matches the flavor's applicationId
(`BuildConfig.FCM_PROJECT_ID`, `FCM_APP_ID`, `FCM_API_KEY`, `FCM_SENDER_ID`, `FCM_ENABLED`); a file
without a client for that id leaves the build with notifications off (Gradle prints a warning).
`DineDeskApp` (the Application class) makes the notification channels and starts Firebase by hand
(`Push.java`). Channels: **orders** ("New orders and bookings": high importance, default sound) and
**general** ("Other updates"); the server picks `orders` for new orders, bookings, tiffin requests,
rider jobs and the test alert.

- **Bridge** (DineDesk pages only): `pushToken()` (the token, or `''` when the build has no Firebase
  or the token isn't known yet; it is then asked for and arrives as the `dinedesk:push-token` window
  event), `pushStatus()` → `{ enabled, permission: granted|denied|default, token, version, flavor }`,
  `requestPushPermission()` (Android 13+ asks while it still may; otherwise the app's notification
  settings open).
- **Web side** (`frontend/src/lib/dinedeskApp.ts` → `installAppPush`): after sign-in, on start with a
  session and on `dinedesk:push-token` it sends `POST /api/v1/devices { token, app_version, flavor }`;
  never in a support session. Signing out sends `DELETE /api/v1/devices/{token}` first, and the server
  also removes devices registered with that sign-in.
- **Server** (`App\Support\Push\Fcm`, channel `fcm` next to `webpush`): FCM HTTP v1 with an OAuth2
  token from the service account (cached ~55 min); texts in the recipient's dashboard language.
  Tokens Firebase no longer knows (`UNREGISTERED`, `INVALID_ARGUMENT`) are deleted.
- **App closed**: Android shows the message itself (channel from the server, icon
  `ic_stat_notify`). **App open**: `PushService` shows it. **Tap**: opens the app on the page in the
  message (a path such as `/dashboard/orders`, opened on the host the app is on; full URLs only for
  DineDesk hosts, the same check as links).

Not in the app: **web push** (WebView has no Push API; the app uses Firebase instead, above), and **pull to refresh** (it reloads by accident on pages with their own scrolling, like the
POS and kitchen screen; the app has Retry and every page has its own refresh).

On the **dev build** (plain http) the browser treats pages as not secure, so the live **camera QR
scanner and "Use my location" don't work there**: the scanner falls back to typing the address. On
production (https) both work.

## Local test APK

```powershell
powershell -ExecutionPolicy Bypass -File android\webview-app\build-local.ps1
#   → android\apk\DineDesk-local.apk   (-DevHost 192.168.1.40 -DevPort 5173 to override)
```

Uses the JDK 17 and SDK in `%USERPROFILE%\Android` and Gradle 8.13+ from `~/.gradle` (`--no-daemon`,
one worker, 768 MB heap, fine on a 4 GB PC; the first build after adding Firebase downloads its
libraries from Google Maven once). It finds this PC's Wi-Fi IP and bakes `http://<ip>:5180/app` into
the app: rebuild when the IP changes. With `app/google-services.json` in place the build has app
notifications; without it they are off.

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
   & $gradle --no-daemon bundleProdRelease assembleProdRelease "-PplatformHost=dinedesk.in" "-PversionCode=5" "-PversionName=1.4"
   ```
   Without `-PplatformHost` or the upload key the build stops with a message saying what is missing.
   Output: `app/build/outputs/bundle/prodRelease/app-prod-release.aab` (upload to Play) and the APK.
   Raise `versionCode` for every upload (the default in `app/build.gradle` is 4 / 1.3). Put
   `app/google-services.json` in place first, or the Play build has no notifications.
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
