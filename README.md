# PH Downloader

A modern, cross-platform desktop application for downloading videos from PornHub with native HLS support and automatic MP4 conversion.

## Features

- **Multi-format Support**: Download both MP4 and HLS (.m3u8) video streams
- **Automatic Conversion**: HLS streams are automatically converted to MP4 using FFmpeg
- **Quality Selection**: Choose from available video qualities
- **Progress Tracking**: Real-time download progress with speed indicators
- **Custom Output Folder**: Select your preferred download location
- **Modern UI**: Clean, dark-themed interface built with Electron
- **Cross-platform**: Works on Windows, macOS, and Linux

## Prerequisites

- Node.js (version 16 or higher)
- npm or yarn package manager

## Installation

1. Clone the repository:
```bash
git clone https://github.com/zuvsck/phd.git
cd ph-downloader
```

2. Install the global command:
```bash
npm run install:global
```

This installs the package globally and registers the `phd` command. On Windows, the installer only appends the npm global bin directory to the user PATH if it is missing. It does not overwrite existing PATH entries.

3. If the installer says PATH was updated, open a new terminal.

4. Start the application from anywhere:
```bash
phd
```

### Development install

For local development without installing the global command:

```bash
npm install
npm start
```

### Uninstall global command

```bash
npm run uninstall:global
```

## Usage

1. **Launch the Application**: Run `phd` after global install, or `npm start` during development
2. **Enter URL**: Paste a PornHub video URL in the input field
3. **Search**: Click the "Search" button to fetch video information
4. **Select Quality**: Choose your preferred video quality from the dropdown
5. **Choose Output Folder** (Optional): Click "Change" to select a custom download location
6. **Download**: Click "Download video" to start the download process

### Supported URLs

The application supports URLs from:
- pornhub.com
- pornhubpremium.com
- thumbzilla.com

## Technical Details

### Architecture

- **Frontend**: HTML, CSS, JavaScript with modern ES6+ features
- **Backend**: Node.js with Electron framework
- **Video Processing**: FFmpeg for HLS to MP4 conversion
- **HTTP Client**: Axios for network requests

### Key Dependencies

- **electron**: Cross-platform desktop app framework
- **axios**: HTTP client for API requests
- **ffmpeg-static**: Static FFmpeg binary for video processing
- **fluent-ffmpeg**: Node.js wrapper for FFmpeg

### File Structure

```
ph-downloader/
├── main.js              # Main Electron process
├── preload.js           # Preload script for secure IPC
├── package.json         # Project configuration
├── renderer/
│   ├── index.html       # Main UI markup
│   ├── renderer.js      # Frontend JavaScript
│   └── style.css        # Application styles
└── README.md           # This file
```

## Development

### Building from Source

1. Clone and install dependencies as shown above
2. For development with hot reload:
```bash
npm start
```

### Code Structure

- **main.js**: Contains the main Electron process, video fetching logic, and download handlers
- **preload.js**: Secure bridge between main and renderer processes
- **renderer/**: Contains all frontend code (HTML, CSS, JavaScript)

### Security Features

- Context isolation enabled
- Node integration disabled in renderer
- Secure IPC communication between processes

## Troubleshooting

### Common Issues

**FFmpeg Error (Exit Code 2880417800)**
- This error typically occurs due to network connectivity issues or invalid video URLs
- Ensure you have a stable internet connection
- Verify the PornHub URL is valid and accessible

**Download Fails**
- Check if the video is still available on the platform
- Try a different video quality
- Ensure you have write permissions to the output folder

**Application Won't Start**
- Verify Node.js version (16+ required)
- Delete `node_modules` and run `npm install` again
- Check for any antivirus software blocking the application

## Performance Optimization

- **HLS Downloads**: Use simplified FFmpeg options for better compatibility
- **MP4 Downloads**: Direct streaming with large buffers for maximum speed
- **Progress Updates**: Throttled to prevent UI flooding
- **Memory Management**: Efficient stream handling for large files

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This software is for educational and personal use only. Users are responsible for complying with applicable laws and the terms of service of the platforms they interact with. The developers do not condone or encourage the unauthorized downloading of copyrighted content.

## Author

Created by @zuvisck

## Version History

- **v1.0.0**: Initial release with MP4 and HLS support, modern UI, and cross-platform compatibility
