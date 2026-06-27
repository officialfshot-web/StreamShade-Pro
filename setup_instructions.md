# macOS Auto-Clicker Setup Guide

## Option 1: AppleScript (Built-in)

**Pros:** No installation required, works with most apps
**Cons:** Limited functionality, requires accessibility permissions

### Setup:
1. Open Script Editor (Applications > Utilities > Script Editor)
2. Open `mac_autoclick.scpt`
3. Click "Run" or save as Application for easy access

### Permissions:
- System Preferences > Security & Privacy > Privacy > Accessibility
- Add Script Editor to allowed applications

### Usage:
- **Monitor Mode:** Automatically detects and clicks popup windows
- **Click at Position:** Clicks specific coordinates repeatedly
- Move mouse to top-left corner to stop (failsafe)

---

## Option 2: Hammerspoon (Recommended)

**Pros:** Most powerful, image recognition, keyboard shortcuts, menu bar control
**Cons:** Requires Hammerspoon installation

### Setup:
1. Install Hammerspoon from https://hammerspoon.org/
2. Move `hammerspoon_autoclick.lua` to ~/.hammerspoon/init.lua
3. Create ~/.hammerspoon/popups/ directory for popup images
4. Launch Hammerspoon and grant permissions

### Permissions:
- System Preferences > Security & Privacy > Privacy > Accessibility
- Add Hammerspoon to allowed applications

### Usage:
- **Cmd+Alt+A:** Toggle auto-clicker on/off
- **Cmd+Alt+S:** Stop auto-clicker
- **Menu Bar:** Click mouse icon to toggle
- **Failsafe:** Move mouse to top-left corner to stop

### Adding Popup Images:
1. Take screenshots of your app's popups
2. Save as PNG in ~/.hammerspoon/popups/
3. Hammerspoon will automatically detect and click them

---

## Option 3: Python Script (Cross-platform)

**Pros:** Visual detection, highly configurable
**Cons:** Requires Python installation, more setup

### Setup:
```bash
pip install pyautogui opencv-python pillow
python desktop_autoclick.py
```

### Usage:
1. **Option 1:** Capture popup regions by drawing boxes
2. **Option 2:** Monitor for existing popup images
3. **Option 3:** Test single image detection

---

## Option 4: Automator (GUI-based)

**Pros:** No coding required, visual interface
**Cons:** Limited to basic automation

### Setup:
1. Open Automator (Applications > Automator)
2. Create new "Application"
3. Add "Watch Me Do" actions to record clicks
4. Save as application

---

## Recommended Approach:

**For your use case:** Start with **Hammerspoon** (Option 2) because:
- Most powerful and reliable for app automation
- Image recognition works with any app
- Easy to start/stop with keyboard shortcuts
- Can run continuously in background

**Quick Start:**
1. Install Hammerspoon
2. Use the provided Lua script
3. Take a screenshot of your app's popup
4. Save it to ~/.hammerspoon/popups/
5. Press Cmd+Alt+A to start monitoring

The system will automatically detect when your app's popup appears and click it for you!
