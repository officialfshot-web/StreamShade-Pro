# Smart Auto-Clicker Usage Examples

## Interactive Mode (Recommended)

Run the interactive script and type what to search for:

```bash
python3 interactive_search.py
```

**Example session:**
```
=== Interactive Search and Click ===
Type what you want to search for and the script will click it when found.

Enter text to search for (or 'quit' to exit): Continue
Check interval in seconds (default 2.0): 1.5
Maximum clicks (default 50): 20

🔍 Monitoring for: 'Continue'
   Check interval: 1.5s
   Max clicks: 20
   Press Ctrl+C to stop
--------------------------------------------------
⏳ Searching... (checked 0 times)
⏳ Searching... (checked 1 times)
🎯 Found: Element: Continue at (850, 400)
✓ Clicked at (850, 400) - Total: 1
⏳ Searching... (checked 2 times)
```

## Command Line Mode

### Search for Text
```bash
# Look for "OK" button every 2 seconds, max 30 clicks
python3 smart_autoclick.py "OK" --type text --interval 2.0 --max-clicks 30

# Look for "Continue Watching" button
python3 smart_autoclick.py "Continue Watching" --type text --interval 1.0 --max-clicks 10

# Look for "Accept" button
python3 smart_autoclick.py "Accept" --type text --interval 3.0 --max-clicks 5
```

### Search for Image
```bash
# Look for a specific button image
python3 smart_autoclick.py "/path/to/button.png" --type image --confidence 0.8

# Look for popup window image
python3 smart_autoclick.py "popup_screenshot.png" --type image --interval 1.5 --max-clicks 20
```

## Common Search Terms

Try these common button/popup texts:
- "OK"
- "Continue" 
- "Accept"
- "Yes"
- "Confirm"
- "Allow"
- "Continue Watching"
- "Skip"
- "Close"
- "Dismiss"
- "Agree"
- "Next"
- "Done"

## Tips

1. **Be specific**: Use exact text from the button/popup
2. **Shorter intervals**: Use 0.5-1.0 seconds for time-sensitive popups
3. **Higher confidence**: Use 0.9 for image matching to avoid false positives
4. **Test first**: Try with higher intervals to see if it finds your target
5. **Multiple attempts**: Set max clicks higher than you think you need

## How It Works

- **Text search**: Uses macOS accessibility to find UI elements with matching text
- **Image search**: Takes screenshots and matches against your reference image
- **Smart clicking**: Finds the center of elements and clicks there
- **Continuous monitoring**: Keeps searching until found or max clicks reached

The script will automatically detect when your app's popup appears with the specified text and click it for you!
