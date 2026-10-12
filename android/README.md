# Android apps

Every DineDesk website already installs as an app from the browser (PWA). For the Play Store, or to
share an `.apk`, the same website is wrapped as a **Trusted Web Activity** with
[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap): a small Android app that opens the live
site full-screen in Chrome. Nothing is copied into the app, so every website update reaches it at once.

Two kinds of app:

| App | Opens | Manifest it is built from | Verified by |
| --- | --- | --- | --- |
| A business's guest app (e.g. Hungry Haveli) | `https://<their domain>/?source=app` | `/site.webmanifest` (name, colours, icon from the logo) | `php artisan android:app <host> <package> <sha256>` |
| The DineDesk dashboard app (owners and staff) | `https://<platform domain>/dashboard` | `/admin.webmanifest` | `.env` `ANDROID_ADMIN_PACKAGE`, `ANDROID_ADMIN_SHA256` |

## What it needs

- The website **live on HTTPS** at its final domain (an app is tied to one domain).
- Node 18+. The first build downloads a JDK 17 and the Android SDK (about 2 GB, into `%USERPROFILE%\.bubblewrap`).
- 8 GB of RAM is comfortable; with 4 GB close other programs while Gradle runs.

## Build

```powershell
cd android
$env:BUBBLEWRAP_KEYSTORE_PASSWORD = '<a strong password>'   # keep it safe with the keystore
.\build-apk.ps1 -Kind site -Domain hungryhaveli.in -Package in.hungryhaveli.app -Name "Hungry Haveli"
```

The script prints the APK and AAB paths and the signing key's SHA-256, and the exact command to run
on the server. Then open `https://hungryhaveli.in/.well-known/assetlinks.json`: it must list the
package and fingerprint, otherwise the app shows a browser bar at the top.

`keys/` holds the signing keystores. **Back them up and never commit them** (they are git-ignored):
an app can only ever be updated with the key it was first published with.

## Play Store

1. Upload `app-release-bundle.aab` in Play Console.
2. Play re-signs the app: copy the *App signing key* SHA-256 from **Release → Setup → App integrity**
   and add it as a second fingerprint (`php artisan android:app <host> <package> <upload sha256> <play sha256>`).
3. Each update: run the script again with `-Version 2`, `3`, …
