# Verifeed · Digital Shield

## Product

A browser extension puts an understandable scam-risk badge beside posts. Local checks cost no tokens. A review studio analyzes only content the user explicitly submits. A listen button, English/Urdu interface, icon-and-text risk labels, and one concrete next action serve people with limited digital literacy.

The feed control is now a compact pill at each post's bottom-right. It opens a same-tab dialog for text and media review, dismissed only by its × control. The AI-writing section explains possible formulaic/low-information writing with exact excerpts and uncertain authorship; it never treats AI-like style as scam evidence. Writing assessment shares the existing Groq request.

Optional website redirect warnings extend this to destination pages: browser-reported redirects trigger a bounded local scan of visible text, excluding forms and editable inputs. A left-side card distinguishes scam signals from AI-style writing, with no automatic uploads. Its review button uses the same-tab panel. HTTP/HTTPS site access and navigation permission are requested only when the user enables the feature.

Scam risk and media origin are separate. Green means no obvious warning signs in the checked material, never verified safety. Gray means insufficient evidence. Image analysis and transcription do not establish authentic media, voice identity, or whether AI created it.

## MVP implementation

1. Shared local rules: combinations of credential requests, advance fees, job/prize offers, investment promises, urgency and suspicious links. Explanations show observed evidence; ordinary grammar, emoji and AI disclosure are not scam signals.
2. Manifest V3 extension: X/Twitter, Facebook, Instagram, and LinkedIn feed adapters, badges in isolated shadow roots, dynamic post detection, manual scan, right-click text/image review, local flagging. Platform markup is subject to change; test against authenticated live feeds before presenting full platform compatibility as verified.
3. Node backend on Oracle Cloud, reached by the local extension through SSH forwarding: secrets in the server `.env`, fixed Groq endpoints, validated inputs/outputs, bounded in-memory cache, duplicate request protection, request/token budgets and timeouts. The popup saves the selected backend address. Optional HTTPS access uses a separate server code and one-time studio connection tickets. No database or third-party runtime dependencies.
4. Media studio: paste text, upload images/audio/video, preview exactly what will be sent, explicit AI button, honest coverage and errors. No media uploads during automatic feed scanning.
5. English/Urdu, device speech where a matching voice exists, keyboard access and mobile-responsive studio. The extension itself targets desktop Chromium browsers.
6. Practice feed and tests: real local rules; AI results only from actual configured API calls. Mock responses are confined to automated tests.

## Media pipeline

| Input | Processing on this device | Requested cloud processing | Honest output |
| --- | --- | --- | --- |
| Text/caption | Rule scan; bounded text | GPT-OSS 120B | Scam signals and next action |
| Image/screenshot | Resize to at most 1024 px | Qwen vision observations/OCR → GPT-OSS | Visible evidence; origin unverified |
| Voice/audio | Up to 60 seconds, 16 kHz mono WAV | Whisper transcription → GPT-OSS | Spoken-content risk; speaker/voice origin unverified |
| Video | Two frames within first 60 seconds; audio if browser can decode it | Qwen frames + optional Whisper → GPT-OSS | Sampled evidence; unchecked coverage clearly stated |

Image and audio observations are untrusted inputs to the final analysis. The model has no tools, cannot visit supplied links, and must not obey instructions embedded in posts, screenshots, or speech. Responses are validated and rendered as plain text. Media authenticity is fixed to `unverified` by application code.

Browser or platform restrictions may prevent retrieving a post's media. The studio explains this and accepts a manual file upload. DRM/streaming/blob videos are not silently described as analyzed. Sampled frames do not constitute full-video deepfake detection. Forensic detectors/provenance verification are a later, separately evaluated integration.

## Demo story

Scroll the practice feed → see instant badges without cloud calls → review an advance-fee internship → listen to the warning → inspect an uploaded poster/voice note/video → see evidence and coverage → flag for personal review. Show an ordinary post, a scam-awareness post, and a harmless AI illustration to demonstrate the distinction between risk and origin.

## References checked September 12, 2026

- https://console.groq.com/docs/model/openai/gpt-oss-120b
- https://console.groq.com/docs/vision
- https://console.groq.com/docs/speech-to-text
- https://console.groq.com/docs/rate-limits
- https://console.groq.com/docs/production-readiness/security-onboarding
- https://developer.chrome.com/docs/extensions/develop/concepts/network-requests

Model availability depends on the Groq account and can change; all three IDs are configurable. The Oracle backend binds to `127.0.0.1:4317` and runs under systemd as `verifeed`. The extension defaults to the local SSH tunnel at `127.0.0.1:4318`. Public HTTPS mode requires a server access code; durable quotas and individual user accounts remain future work.

## Implemented and verified

The extension, studio, all four platform adapters, multimodal pipeline, English/Urdu interface, private flags, practice media, configurable backend, and Oracle deployment are implemented. JavaScript/JSON checks and 37 unit/integration tests pass. Browser coverage includes 13 studio/feed checks, five extension setup checks, three server connection checks, five same-tab panel checks, and six website redirect checks. The new redirect checks exercise actual HTTP and JavaScript navigation, delayed content, dismissal, form-value exclusion, and zero automatic AI calls. Automated provider responses are test doubles; live Oracle checks are recorded separately.

Live text, image, audio, and video checks all passed through the Oracle backend on September 12, 2026, using its configured Groq key. Results are recorded separately in `artifacts/live-check-results.json`. Remaining external validation: extraction against the user's authenticated live social feeds. This does not include forensic AI-origin/deepfake/voice-clone detection.
