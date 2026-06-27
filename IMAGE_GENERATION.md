# StreamShade Pro Image Generation

Generate logos, icons, and other images for the extension. The default provider is **Pollinations.ai**, which is free and requires no API key. You can also use **Gemini** if you have an API key with image-generation quota.

## Setup

No required npm packages or API keys are needed to use the free provider. The script uses built-in Node.js modules.

If you want to use Gemini instead, get a key from [Google AI Studio](https://aistudio.google.com/app/apikey), copy `.env.example` to `.env`, and add it:

```bash
cp .env.example .env
# edit .env and add GEMINI_API_KEY=your_key
```

## Generate icons

```bash
npm run generate:icons
# or directly:
node scripts/generate-images.js --icons
```

This generates a new logo with Pollinations.ai and saves it to `icon16.png`, `icon32.png`, `icon48.png`, and `icon128.png` in the project root. The optional `sharp` package is used for resizing if installed; otherwise only `icon128.png` is updated.

Install sharp for resizing:

```bash
npm install sharp
```

Generate several icon options and pick the best one:

```bash
npm run generate:icons -- --count 3
```

Use a different style:

```bash
npm run generate:icons -- --style apple
npm run generate:icons -- --style neon
npm run generate:icons -- --style 3d
npm run generate:icons -- --style minimalist
npm run generate:icons -- --style cyberpunk
npm run generate:icons -- --style retro
```

Randomize the style each run:

```bash
npm run generate:icons -- --randomize --count 3
```

## Generate a custom image

```bash
npm run generate -- --prompt "A futuristic cyberpunk logo for a streaming extension" --output generated/logo.png
# or directly:
node scripts/generate-images.js --prompt "A futuristic cyberpunk logo for a streaming extension" --output generated/logo.png
```

Use a topic for quick prompt generation:

```bash
npm run generate -- --topic "cyberpunk city skyline" --output generated/skyline.png
npm run generate -- --topic "cyberpunk city skyline" --count 3
```

## Use Gemini instead

```bash
npm run generate:icons -- --provider gemini
# or directly:
node scripts/generate-images.js --icons --provider gemini
```

## How it works

`scripts/generate-images.js` includes a prompt builder that crafts unique prompts for each variation. When you generate multiple icons with `--count N`, each option uses a different symbol and background so the results are not identical. For custom images, `--topic` wraps your idea in a high-quality illustration prompt. The script downloads the image from the selected provider and, in icon mode, resizes it to all required Chrome extension icon sizes with `sharp`.
