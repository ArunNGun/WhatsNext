# Google Meet Next Meeting Timer

A Chrome extension that shows a timer for upcoming meetings in Google Meet and provides a quick join button for the next meeting.

## Author

**Arun** - Creator and main developer

## Features

- **Meeting Timer**: Shows a countdown timer 5 minutes before your next meeting starts
- **Quick Join Button**: Provides a one-click button to join your next meeting when the current one ends
- **Google Calendar Integration**: Automatically detects upcoming meetings from your Google Calendar
- **Seamless UI**: Clean, non-intrusive interface that integrates with Google Meet

## Installation

### From Chrome Web Store (Future release)

1. Visit the Chrome Web Store (link to be added)
2. Click "Add to Chrome"
3. Follow the prompts to install the extension

### Manual Installation (Developer Mode) (Recommended)

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the extension directory
5. The extension should now appear in your extensions list

## Setup

### First Use

1. Click the extension icon in your Chrome toolbar
2. Click "Sign in with Google"
3. Grant the necessary permissions to access your calendar
4. The extension will now automatically check for upcoming meetings

## Usage

1. Join a Google Meet meeting
2. If you have another meeting scheduled right after the current one:
   - A timer will appear 3 minutes before the next meeting
   - When the current meeting ends, a quick join button will appear
3. Click the quick join button to immediately join the next meeting

### Timer Overlay Features

The timer overlay includes several user-friendly features:

- **Draggable**: Click and drag the timer to position it anywhere on the screen
- **Smart Detection**: The timer won't appear if you're already in the meeting it's alerting about
- **Position Memory**: The overlay remembers its position between sessions
- **Integrated Join Button**: The join button is part of the timer overlay for easy access

## Privacy

This extension:
- Only accesses your Google Calendar data with your explicit permission
- Only reads calendar events (no write access)
- Does not store your calendar data on any external servers
- Does not share your data with any third parties

## Development

### Project Structure

- `manifest.json`: Extension configuration
- `background.js`: Background script for authentication and API calls
- `content.js`: Content script for injecting UI into Google Meet
- `popup.html/js`: Extension popup UI
- `styles.css`: Styling for the injected UI elements
- `images/`: Extension icons

### Building from Source

1. Clone the repository
2. Install dependencies (if any)
3. Configure the Google API credentials as described above
4. Load the extension in developer mode

### Contributing

Contributions are welcome! Please feel free to submit a Pull Request. This project is maintained by Arun.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Troubleshooting

### Common Issues

1. **OAuth2 request failed: Service responded with error: 'bad client id'**
   - This means you haven't set up your Google OAuth client ID correctly
   - Follow the Google API Configuration steps in this README

2. **Timer doesn't appear during meetings**
   - Ensure you have upcoming meetings in your Google Calendar with Google Meet links
   - Check that the meetings are scheduled close enough together (within 30 minutes)
   - Try refreshing the Google Meet page

## Support

If you encounter any issues or have questions, please file an issue on the GitHub repository.

## Acknowledgments

- Arun - Project creator and main developer
- Google Calendar API
- Chrome Extension API