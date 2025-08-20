# Interactive Picture-in-Picture Chrome Extension

A powerful Chrome extension that allows you to select any element on a webpage and convert it into an interactive floating picture-in-picture window.

## Features

- **Element Selection**: Click-to-select any element on any webpage with visual highlighting
- **Interactive Floating Window**: Maintains full interactivity of selected elements (buttons, links, forms work)
- **Drag & Drop**: Move the PiP window anywhere on screen
- **Resizable**: Resize the window to your preferred size
- **Window Controls**: Minimize, maximize, and close controls
- **Cross-Site Compatibility**: Works on all websites with proper permissions
- **Modern UI**: Beautiful glass-morphism design with smooth animations

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension icon will appear in your toolbar

## Usage

1. Click the extension icon in your Chrome toolbar
2. Click "Start Selection" in the popup
3. Hover over any element on the page to see it highlighted
4. Click on the element you want to convert to PiP
5. The element will appear in a floating window that you can move and resize
6. Use the window controls to minimize, maximize, or close the PiP window

## Keyboard Shortcuts

- `Escape`: Cancel element selection or close PiP window
- You can add custom keyboard shortcuts in Chrome's extension settings

## Settings

- **Maintain Interactivity**: Keep buttons, links, and forms functional in the PiP window
- More settings available in the extension popup

## Technical Details

- Built with modern Chrome Extension Manifest V3
- Uses content scripts for element selection and PiP creation
- Implements proper cross-origin handling
- Responsive design that works on all screen sizes
- Clean separation of concerns with modular code architecture

## Development

To modify the extension:

1. Make your changes to the source files
2. Go to `chrome://extensions/`
3. Click the refresh icon for this extension
4. Test your changes

## Browser Compatibility

- Chrome 88+
- Chromium-based browsers (Edge, Brave, etc.)

## Privacy

This extension:
- Only accesses the current active tab when you use it
- Does not collect or transmit any personal data
- Stores minimal settings locally using Chrome's sync storage
- Does not make any external network requests

## License

MIT License - feel free to modify and distribute as needed.