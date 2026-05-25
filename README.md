# StreamShade Pro

A browser extension that enhances the LookMovie viewing experience.

## Features

- **Popup close** — Automatically closes popup ads
- **Intro/Outro skip** — Skip opening and closing sequences
- **Custom segments** — Define your own segments to skip
- **Speed control** — Adjust playback speed
- **Stats** — Track viewing statistics

## Installation (Developer Mode)

1. Open Chrome/Edge and go to `chrome://extensions/` (or `edge://extensions/`)
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked**
4. Select this folder (`New folder`)

## Files

| File | Description |
|------|-------------|
| `manifest.json` | Extension manifest (MV3) |
| `popup.html` / `popup.js` | Extension popup UI and logic |
| `content.js` | Content script injected into LookMovie pages |
| `style.css` | Styles for the popup |
| `icon*.png` / `icon*.svg` | Extension icons |
| `generate-icons.html` | Helper to generate icon files |

## Permissions

- `storage` — Save user preferences and stats locally
- Host access to `lookmovie2.to` and `lookmovie.to` domains

## Version

2.0
