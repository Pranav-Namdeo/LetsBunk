# LetsBunk Admin Panel - Professional Installer

## 🚀 Single-File Installer Ready!

The LetsBunk Admin Panel has been built as a professional Windows installer that provides:

### ✨ Installation Features
- **Single-file installer** - Just run `LetsBunk Admin Setup 1.0.0.exe`
- **Desktop shortcut** - Automatically created during installation
- **Start menu integration** - Added to Windows Start menu under "LetsBunk"
- **Professional uninstaller** - Complete removal with registry cleanup
- **Windows integration** - Appears in Programs and Features
- **Compatibility check** - Ensures Windows 10+ before installation

### 📦 What Gets Installed
- LetsBunk Admin Panel application
- Desktop shortcut: "LetsBunk Admin"
- Start Menu folder: "LetsBunk" with shortcuts
- Proper Windows registry entries
- Uninstaller for clean removal

### 🛠️ Building the Installer

#### Quick Build (Recommended)
```bash
# Run the automated build script
BUILD_INSTALLER.bat
# or
BUILD_INSTALLER.ps1
```

#### Manual Build
```bash
# Install dependencies
npm install

# Build the installer
npm run build-installer

# Clean and rebuild
npm run rebuild
```

### 📋 System Requirements
- **OS**: Windows 10/11 (64-bit)
- **RAM**: 4GB minimum
- **Storage**: 500MB disk space
- **Network**: Internet connection for server communication

### 🎯 Distribution
Simply share the single file:
- **File**: `dist/LetsBunk Admin Setup 1.0.0.exe`
- **Size**: ~150-200 MB (includes all dependencies)
- **No additional files needed**

### 🔧 Installation Process
1. User downloads `LetsBunk Admin Setup 1.0.0.exe`
2. Double-clicks to run the installer
3. Follows the installation wizard
4. Chooses installation directory (optional)
5. Installer creates shortcuts and registry entries
6. Application is ready to use

### 🗑️ Uninstallation
- Via Windows Settings > Apps & Features
- Via Start Menu > LetsBunk > Uninstall
- Complete removal including shortcuts and registry entries

### 📁 File Structure After Installation
```
C:\Program Files\LetsBunk Admin\
├── LetsBunk Admin.exe          # Main application
├── resources\                  # App resources
├── locales\                   # Language files
├── *.dll                      # Required libraries
└── Uninstall LetsBunk Admin.exe # Uninstaller
```

### 🎨 Branding Details
- **App Name**: LetsBunk Admin
- **Publisher**: LetsBunk
- **Icon**: Custom LetsBunk branding
- **Category**: Education
- **Version**: 1.0.0

### 🔍 Troubleshooting
- **Installer won't run**: Check Windows version (requires Win10+)
- **Installation fails**: Run as Administrator
- **App won't start**: Check if server URL is configured correctly
- **Missing shortcuts**: Reinstall the application

---

**Ready for Distribution**: The installer is production-ready and can be shared with end users for easy installation of the LetsBunk Admin Panel.