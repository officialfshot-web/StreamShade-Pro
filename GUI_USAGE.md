# Auto-Clicker GUI - Easy to Use Interface

## 🚀 Quick Start

The GUI is now running! Here's how to use it:

### Launch the GUI
```bash
python3 autoclick_gui.py
```

## 📋 GUI Features

### 🎯 Click Mode Tab
- **Coordinates**: Enter X,Y coordinates or click "Get Current Mouse Position"
- **Settings**: Adjust interval between clicks and maximum click count
- **Controls**: Start/Stop buttons for easy control

### 🔍 Search Mode Tab  
- **Search Text**: Type what you want to find (e.g., "Continue", "OK", "Accept")
- **Quick Buttons**: Common button texts for one-click selection
- **Settings**: Check interval, max clicks, and cooldown period
- **Controls**: Start/Stop searching

### ⚙️ Settings & Info Tab
- **Information**: Usage instructions and requirements
- **Permissions**: Check accessibility permissions
- **Activity Log**: Real-time log of all actions
- **Clear Log**: Reset the activity log

## 🖱️ How to Use

### For Coordinate Clicking:
1. Open Click Mode tab
2. Enter coordinates or use "Get Current Mouse Position"
3. Set interval (how often to click) and max clicks
4. Click "Start Clicking"
5. Click "Stop" when done

### For Text Search:
1. Open Search Mode tab  
2. Enter text to find (e.g., "Continue")
3. Use quick buttons for common texts
4. Set check interval and max clicks
5. Click "Start Searching"
6. GUI will automatically find and click the text
7. Click "Stop" when done

## 🛡️ Safety Features

- **Stop Button**: Always available to stop immediately
- **Status Bar**: Shows current status and click count
- **Activity Log**: Detailed log of all actions
- **Input Validation**: Prevents invalid inputs
- **Thread Safety**: Separate threads prevent GUI freezing

## 📋 Requirements

- macOS Accessibility permissions
- Terminal or Python added to Accessibility settings
- production_autoclick.py in same directory

## 🔧 Setup Permissions

1. Go to: System Preferences > Security & Privacy > Privacy > Accessibility
2. Click the + button
3. Add Terminal or Python 3
4. Check the box next to it

## 💡 Tips

- **First Time**: Click "Check Permissions" in Settings tab
- **Testing**: Use low max clicks (5-10) for testing
- **Mouse Position**: Use "Get Current Mouse Position" for accurate coordinates
- **Common Texts**: Use quick buttons for frequent searches
- **Activity Log**: Monitor real-time activity in Settings tab

## 🎨 GUI Layout

```
┌─────────────────────────────────────────┐
│ Auto-Clicker GUI                        │
├─────────────────────────────────────────┤
│ [Click Mode] [Search Mode] [Settings]   │
├─────────────────────────────────────────┤
│                                         │
│         Tab Content Area                │
│                                         │
│    (Coordinates, Settings, Controls)    │
│                                         │
├─────────────────────────────────────────┤
│ Status: Ready                    Clicks: 0│
└─────────────────────────────────────────┘
```

The GUI provides an intuitive, user-friendly interface for both coordinate clicking and intelligent text search functionality. All the power of the command-line tools with the ease of a graphical interface!
