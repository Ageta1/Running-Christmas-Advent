# Run Advent mobile app

Open the calendar online and expand **App settings**. “Calendar ready for offline use on this device” confirms the app files are cached. On iPhone, use Safari’s Share menu and choose Add to Home Screen. On Android, use Install Run Advent or the browser’s install action. Device storage and account sessions can differ between a browser and its installed app. Open the installed app online once and check its offline status.

The calendar retains the existing device progress and archive keys. Local calendar features, including reveals, notes and completions, work offline once cached. Profile changes and friends requests require a connection. Local progress becomes eligible for automatic backup after a signed-in runner explicitly chooses a cloud or device copy. The queue belongs to the account and challenge year. Reconnection or reopening the app retries the save with the cloud revision originally reviewed. A newer revision pauses automatic backup and asks the runner to compare copies. The service worker caches only the named app files; account responses, emails, profiles and friend data are excluded.

## Publishing

GitHub Pages serves the files at the repository root. The bundled Supabase browser client (2.119.2, MIT) supports offline startup. Stage 9 uses the existing Stage 7 save function and Stage 8 permissions.

When changing a cached resource, run `python3 tools/refresh-offline.py` and commit the updated `sw.js` with the files. Add new dependencies of the offline calendar to the service worker’s SHELL list. Test from the repository subpath on localhost or HTTPS. A waiting release shows **Update and reopen**. Closing all app windows also allows the waiting worker to activate.

## Checks for this release

- Chromium accepted the manifest, icon sizes, installability checks and repository-relative launch URL.
- Tested Calendar, Friends, Leaderboard and Profile at 390 × 844, 360 × 800 and 1280 × 800.
- Tested a cold offline reload, completing a run without a server, restoring device progress after reload, skipping a reveal, reduced motion and updating the worker with saved progress.
- With simulated signed-in accounts, tested offline queue persistence across reload, reconnection, a newer remote revision, explicit restore, account switching and preview isolation.
- Physical iOS and Android Home Screen installation and native splash rendering require device verification.

## Rolling back

For a later PWA release, restore the previous shell and its matching service worker in the same commit. For a full rollback to Stage 8, restore the application files from `ecf687f555ab955106e6d54c47aecf5c980ea646` and **keep a replacement at the deployed sw.js URL**. Use the following retirement worker so installed clients leave the Stage 9 cache when they next come online. Leave it published while older installs may still return. Calendar storage and queued backup records remain on the device.

```js
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const prefix = 'run-advent:' + self.registration.scope + ':';
  for (const key of await caches.keys()) {
    if (key.startsWith(prefix)) await caches.delete(key);
  }
  await self.clients.claim();
  await self.registration.unregister();
})()));
```

Reopen the calendar online after rolling back. Stage 8 runners with unsent changes can use Compare progress and choose the device or cloud backup explicitly.
