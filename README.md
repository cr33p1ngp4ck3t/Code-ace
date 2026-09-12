# Nova — Digital Shield

A hackathon prototype that explains scam warning signs beside social posts and lets users request deeper checks of **text, images, voice/audio, and video**. Includes a Chromium extension, an English/Urdu review studio, and a local Groq backend.

## Run it

Requires **Node.js 22+**. The app has no runtime npm dependencies.

```powershell
npm start
```

Open **http://127.0.0.1:4317** for the studio or **http://127.0.0.1:4317/demo** for the practice feed. Local text checks work immediately.

For AI checks, copy `.env.example` to `.env` if `.env` does not already exist. Add your key in your editor:

```dotenv
GROQ_API_KEY=your_key_here
```

Restart `npm start` after editing `.env`. The key belongs only in this git-ignored file. Do not paste it into extension files. If a model is unavailable in your Groq account, change its model ID in `.env`.

On Windows/macOS, `npm run dev` watches `.env` and the server folder and restarts automatically when they change. Refresh the studio after adding the key. The development preview started by this coding session uses that watch mode.

## Install the extension

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable **Developer mode**, choose **Load unpacked**, and select this repo’s **extension** folder.
3. Refresh an open X/Twitter, Facebook, Instagram, LinkedIn, or practice feed tab.
4. Look for Nova’s badge. **Why?** explains local rules. **Open full check** imports the selected post into the studio; it does not call AI.
5. Review the prepared content, then press **Check with AI** to send it to Groq.

The popup scans the current feed when opened and can scan again, pause badges, change the badge language, and show private post flags. Installation also initializes supported feed tabs that are already open. Right-click selected text or an image to open a review. Media import is limited to supported platform CDNs; when a protected, streaming, blob, or oversized file cannot be imported, upload the original in the studio. Inline text checks require no backend or API key.

If badges are missing, reload Nova on the browser's extensions page, refresh the feed, and open the Nova popup. Make sure **Automatic local checks** is on. The popup reports how many posts were found, whether checks are paused, or whether the tab could not be accessed. For access errors, allow Nova access to the site in the browser's extension settings. If it reports no posts after scrolling, the current feed layout may not match an adapter; selected text can still be reviewed from the right-click menu.

The LinkedIn adapter handles both legacy class-based posts and `data-view-name="feed-full-update"` / activity `data-id` containers, including markers assigned after a post loads. These alternative containers are also used in [published LinkedIn filters](https://blog.georgovassilis.com/2025/05/27/hiding-suggested-linkedin-posts/) and a [post-permalink userscript](https://gist.github.com/wohfab/71e0785399afdf8f0b9eaeeaa9c58500). Browser tests cover representative layouts; a logged-in live feed still needs user verification.

For AI setup, put a valid Groq API key in `GROQ_API_KEY` in the backend `.env`, then restart `npm start` (or let `npm run dev` restart automatically). The studio distinguishes a loaded key from successfully checked access. A rejected-key error means Groq returned 401; a denied-access error means 403 and points to organization/project permissions. See [Groq error codes](https://console.groq.com/docs/errors) and [model permissions](https://console.groq.com/docs/model-permissions). A quick local check only looks for implemented scam patterns in text; it does not inspect images, verify facts, or guarantee that an unflagged post is safe.

## What each check does

| Content | Local work | On-demand AI work |
| --- | --- | --- |
| Message/caption | Explainable combinations of scam signals | GPT-OSS 120B reviews supplied evidence |
| Image/screenshot | Resize to ≤1024 px | Qwen observes visible content/OCR, then GPT-OSS assesses risk |
| Audio/voice note | Convert the first ≤60 seconds to 16 kHz mono WAV | Whisper transcribes speech, then GPT-OSS assesses the transcript |
| Video | Sample two frames within the first 60 seconds; extract audio if supported | Qwen checks frames, Whisper transcribes available audio, GPT-OSS assesses combined evidence |

Uploads accept JPG/PNG/WebP and browser-decodable audio/video. Files are limited to 40 MB and clips to two minutes; only the first minute is prepared. The extension imports at most one attachment, up to 9 MB, per post review. Frame times, audio coverage, and omissions appear in the result. Unsupported media produces an explicit message, never a fabricated check.

**Scam risk is separate from media origin.** Green means no obvious signs in the checked material; yellow means pause and check; red means strong warning signs; gray means insufficient information. These models do not prove whether a picture is AI-generated, whether a video is a deepfake, who a speaker is, or whether a voice is cloned. Media origin always remains **unverified**. Links are inspected as text; no URL reputation service or independent fact checking is implemented.

## Accessibility and privacy

- English/Urdu interface and local explanations; AI responds in the requested language. Text accompanies risk colors. The studio supports small screens, keyboards and reduced motion.
- **Listen** uses a matching device speech voice. Urdu requires an installed Urdu voice; the app reports when one is unavailable. It does not silently use an English voice for Urdu or call a paid speech service.
- Scrolling makes no AI calls. File preparation happens on the device. Only an explicit AI check sends selected content to Groq.
- The key stays in the local backend. The server binds to `127.0.0.1:4317`, checks origins/hosts, validates media and provider output, and never fetches arbitrary supplied URLs.
- Drafts are held in bounded memory, expire after five minutes, and are consumed once. Analysis results are reused for 30 minutes; duplicate submissions share an in-flight request. Nothing is written to a server database or content log.
- Saved check summaries live in browser local storage. Feed flags live in extension storage. Delete them in their respective UI. Neither submits a platform report.
- Provider-side data handling follows your Groq account and policies; this prototype does not promise zero retention at the provider.

The demo has conservative per-process request/token budgets, one active analysis at a time, timeouts, and provider-limit cooldowns. Counters reset when the local server restarts. Public deployment needs user authentication and durable quotas. Set `ALLOWED_EXTENSION_ID` to restrict the local server to your extension ID if desired.

## Test and demo

```powershell
npm install
npm run check
npm test
# Installation, feed initialization and AI setup errors; can run alongside npm start:
npm run test:extension
# If no Playwright Chromium is already installed:
npx playwright install chromium
# Stop npm start first; browser tests use port 4317:
npm run test:browser
```

The browser suite loads the actual Manifest V3 extension, exercises media preparation and analysis, and tests all four adapters against representative DOM fixtures. It uses a **test-only Groq substitute**, never live tokens. Screenshots and results are written to git-ignored `artifacts/`. It can reuse a cached Playwright Chromium, or use `NOVA_BROWSER_EXECUTABLE` to specify one.

**Validation limits:** live Groq calls require a valid key and were not exercised without one. Authenticated live feeds were unavailable for testing; check the adapters against your logged-in accounts. Social sites change their DOM. Studio uploads/paste remain available when feed extraction is unsupported.

The practice feed includes fictional normal posts, advance-fee offers, a voice message, a poster, a narrated video, scam-awareness advice, and a harmless AI-art caption. **Add a new post** demonstrates dynamic scanning. App results come from local rules or actual configured provider calls; there is no canned AI-result mode in the product.

Practice assets are included. To regenerate them on Windows:

```powershell
powershell -NoProfile -File scripts/generate-audio.ps1
node scripts/generate-visual-assets.mjs
```

English audio uses the installed device voice. Graphics and video are locally generated fictional training material. No third-party photo, font or media service is needed.

## Project map

- `PLAN.md` — adjusted multimodal scope and implementation plan.
- `extension/` — Manifest V3 extension, four adapters, shared local rules.
- `web/` — studio, media preparation, translations and practice feed.
- `server/` — local server, Groq pipeline, validation and budgets.
- `tests/` — rule, server, pipeline and browser checks.

Model defaults were checked against [Groq vision](https://console.groq.com/docs/vision), [speech-to-text](https://console.groq.com/docs/speech-to-text), and [GPT-OSS documentation](https://console.groq.com/docs/model/openai/gpt-oss-120b) on September 12, 2026. The original challenge and team idea remain in `prompt.txt`.
