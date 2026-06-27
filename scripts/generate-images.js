#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const envPath = path.join(projectRoot, '.env');

function loadEnv() {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2];
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv();

const args = process.argv.slice(2);
const iconsMode = args.includes('--icons');
const providerArgIndex = args.indexOf('--provider');
const provider = providerArgIndex !== -1 ? args[providerArgIndex + 1] : 'pollinations';
const outputArgIndex = args.indexOf('--output');
const outputPath = outputArgIndex !== -1 ? args[outputArgIndex + 1] : null;
const promptArgIndex = args.indexOf('--prompt');
const prompt = promptArgIndex !== -1 ? args[promptArgIndex + 1] : null;
const styleArgIndex = args.indexOf('--style');
let style = styleArgIndex !== -1 ? args[styleArgIndex + 1] : 'modern';
const countArgIndex = args.indexOf('--count');
const count = Math.min(Math.max(parseInt(countArgIndex !== -1 ? args[countArgIndex + 1] : '1', 10) || 1, 1), 5);
const topicArgIndex = args.indexOf('--topic');
const topic = topicArgIndex !== -1 ? args[topicArgIndex + 1] : null;
const randomize = args.includes('--randomize');

const availableStyles = ['modern', 'minimalist', 'neon', '3d', 'retro', 'cyberpunk', 'apple'];

const styleSuffix = {
  modern: 'Modern flat vector style, clean geometric shapes, crisp edges.',
  minimalist: 'Ultra-minimalist line art, simple outline, monochrome accent.',
  neon: 'Neon glow style, vibrant cyan and electric blue, dark background, futuristic.',
  '3d': '3D rendered glossy icon, soft lighting, subtle depth, polished look.',
  retro: 'Retro pixel art style, 8-bit aesthetic, bold colors.',
  cyberpunk: 'Cyberpunk style, glitch aesthetic, neon accents, dark tech vibe.',
  apple: 'Apple-style iOS app icon, premium glassmorphism, smooth rounded square, reflective glossy surface, subtle gradient sheen, depth and pop, soft shadows, polished professional look, no text.'
};

if (randomize) {
  style = availableStyles[Math.floor(Math.random() * availableStyles.length)];
  console.log('Randomized style:', style);
}

const activeStyleSuffix = styleSuffix[style] || style;

const iconSymbols = [
  'a bold cyan shield with a subtle play-button cutout',
  'a stylized eye with a diagonal privacy slash',
  'a sleek play button inside a protective rounded badge',
  'a smooth cyan streaming wave or soundwave arc',
  'a minimalist lock combined with a small play symbol',
  'a rounded cyan sunglasses or privacy visor icon'
];

const iconBackgrounds = [
  'dark navy blue (#0f0f23) rounded-square background',
  'deep midnight blue rounded-square background',
  'dark charcoal blue rounded-square background with subtle texture',
  'navy blue gradient rounded-square background'
];

function buildIconPrompt(variation = 0) {
  const symbol = iconSymbols[variation % iconSymbols.length];
  const background = iconBackgrounds[variation % iconBackgrounds.length];
  return `Professional app icon for a Chrome extension called StreamShade Pro. ${symbol}, centered on a ${background}. The symbol must be clean and readable at 16x16 pixels. ${activeStyleSuffix} No text, no letters, no words, no watermark, no gradient fills, no photorealistic details, no complex background, centered composition, symmetrical, high contrast.`;
}

function buildImagePrompt(userTopic) {
  const base = userTopic || 'a unique digital illustration';
  return `High quality detailed digital artwork of ${base}. Centered composition, clean background, professional lighting, crisp details, no watermark, no text, no letters.`;
}

const defaultPrompt = iconsMode
  ? buildIconPrompt(0)
  : (topic ? buildImagePrompt(topic) : buildImagePrompt('a futuristic tech-themed scene'));

const finalPrompt = prompt || defaultPrompt;

function getPromptForOption(index) {
  if (prompt) return prompt;
  if (iconsMode) return buildIconPrompt(index);
  if (topic) return buildImagePrompt(`${topic}, variation ${index + 1}`);
  return buildImagePrompt(`a unique digital illustration, variation ${index + 1}`);
}

async function generateImagePollinations(userPrompt) {
  const width = iconsMode ? 1024 : 1024;
  const height = iconsMode ? 1024 : 1024;
  const encodedPrompt = encodeURIComponent(userPrompt);
  const negativePrompt = iconsMode ? 'text, words, letters, watermark, blurry, photorealistic, gradient, complex background' : '';
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&seed=${Date.now()}&enhance=false${negativePrompt ? '&negative_prompt=' + encodeURIComponent(negativePrompt) : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'image/*' }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Pollinations API error ${response.status}: ${text}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || 'image/png';

  return {
    mimeType: contentType,
    buffer
  };
}

async function generateImageGemini(userPrompt) {
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    console.error('Error: GEMINI_API_KEY is not set.');
    console.error('Create a .env file in the project root with:');
    console.error('  GEMINI_API_KEY=your_api_key_here');
    console.error('Get a key at: https://aistudio.google.com/app/apikey');
    process.exit(1);
  }

  const MODEL = 'gemini-2.5-flash-image';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

  const body = {
    contents: [
      {
        parts: [
          { text: userPrompt }
        ]
      }
    ],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      temperature: 1,
      maxOutputTokens: 8192
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(p => p.inlineData && p.inlineData.mimeType && p.inlineData.mimeType.startsWith('image/'));

  if (!imagePart) {
    console.log('Gemini response:', JSON.stringify(data, null, 2));
    throw new Error('No image was returned in the Gemini response.');
  }

  return {
    mimeType: imagePart.inlineData.mimeType,
    buffer: Buffer.from(imagePart.inlineData.data, 'base64')
  };
}

async function generateImage(userPrompt) {
  if (provider === 'gemini') {
    return generateImageGemini(userPrompt);
  }
  return generateImagePollinations(userPrompt);
}

async function saveGeneratedImage() {
  console.log(`Generating image with ${provider}...`);
  console.log('Prompt:', finalPrompt);

  const generatedDir = path.join(projectRoot, 'generated');
  if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
  }

  let firstBuffer = null;
  let firstMimeType = 'image/png';

  for (let i = 0; i < count; i++) {
    const suffix = count > 1 ? ` (option ${i + 1}/${count})` : '';
    const optionPrompt = getPromptForOption(i);
    console.log(`Generating${suffix}...`);
    console.log('Prompt:', optionPrompt);
    const { mimeType, buffer } = await generateImage(optionPrompt);
    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/jpeg' ? 'jpg' : 'webp';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = `${provider}-${style}-${timestamp}${count > 1 ? `-option-${i + 1}` : ''}.${ext}`;
    const basePath = path.join(generatedDir, baseName);
    fs.writeFileSync(basePath, buffer);
    console.log('Saved generated image:', basePath);
    if (i === 0) {
      firstBuffer = buffer;
      firstMimeType = mimeType;
    }
  }

  if (outputPath) {
    const ext = firstMimeType === 'image/png' ? 'png' : firstMimeType === 'image/jpeg' ? 'jpg' : 'webp';
    const customPath = path.resolve(projectRoot, outputPath);
    fs.mkdirSync(path.dirname(customPath), { recursive: true });
    fs.writeFileSync(customPath, firstBuffer);
    console.log('Saved to custom path:', customPath);
  }

  if (iconsMode && firstBuffer) {
    await generateIconSizes(firstBuffer, projectRoot);
  }

  return firstBuffer;
}

async function generateIconSizes(buffer, projectRoot) {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (err) {
    console.warn('sharp is not installed. Skipping icon resize.');
    console.warn('Install it with: npm install sharp');
    console.warn('Only icon128.png will be updated from the generated image.');
  }

  const sizes = [16, 32, 48, 128];
  const ext = 'png';

  if (sharp) {
    for (const size of sizes) {
      const resized = await sharp(buffer)
        .resize(size, size, { fit: 'cover', position: 'center' })
        .png()
        .toBuffer();
      const iconPath = path.join(projectRoot, `icon${size}.png`);
      fs.writeFileSync(iconPath, resized);
      console.log('Saved icon:', iconPath);
    }
  } else {
    const iconPath = path.join(projectRoot, `icon128.${ext}`);
    fs.writeFileSync(iconPath, buffer);
    console.log('Saved icon:', iconPath);
  }
}

saveGeneratedImage().catch(err => {
  console.error(err);
  process.exit(1);
});
