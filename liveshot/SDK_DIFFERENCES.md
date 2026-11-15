# Installed SDK comparison

Checked installed `@daytona/sdk` **0.231.1** declarations. No credentials or account API calls were used.

Differences from the plan's abbreviated shapes:

- `computerUse.screenshot.takeFullScreen(true)` returns `Promise<ScreenshotResponse>`, **not a raw base64 string**. The image must be read from its `.screenshot` property.
- `ScreenshotResponse.screenshot` is optional (`string | undefined`), for compressed screenshots as well as full-screen screenshots. Empty responses are rejected explicitly.
- `computerUse.display.getInfo()` returns an object whose `displays` array is optional; each display's `width` and `height` are optional too. Preflight validates them before recording dimensions.
- `getUserHomeDir()` returns `Promise<string | undefined>`. Provisioning and shell execution require a nonempty home directory.
- `Sandbox.state` is optional. Reuse requires an explicitly reported `started` state.

The listed create, lookup, async-iterable list, delete, fork, labels, command, file, mouse and keyboard signatures otherwise match. `ScreenshotOptions.format` is an unconstrained string in the types; its valid runtime values remain a preflight measurement.

Cleanup additionally uses the installed `daytona.snapshot.delete(snapshot: Snapshot | string): Promise<void>` to remove memory snapshots created by preflight or captures. The plan explicitly described snapshot creation and polling but omitted this cleanup signature.

# Credentialed preflight behavior

`preflight.ts` discovers the actual DISPLAY, browser executable, screenshot format and dimensions and writes them to `.data/preflight.json`. The driver refuses to guess missing values. Explicit environment overrides are `DAYTONA_DISPLAY`, `DAYTONA_BROWSER`, `DAYTONA_SCREENSHOT_FORMAT`, `DAYTONA_SCREEN_WIDTH` and `DAYTONA_SCREEN_HEIGHT`.

To automate real coordinate input without guessing positions, preflight launches Chromium with its DevTools port bound to loopback, reads the current shop element bounds there, and sends the resulting coordinates through Computer Use. It saves screenshots before and after those actions. Firefox remains a discovered browser fallback for provisioning, but automated preflight input fails explicitly if Chromium's layout probe is unavailable; inspect the saved images and resolve that before trusting a mode recommendation.

Golden screenshots use the measured format and the corresponding `.png` or `.jpg` filename. This avoids writing JPEG bytes into a misleading `.png` file.
