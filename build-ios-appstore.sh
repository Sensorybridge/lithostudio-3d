#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "  LithoStudio 3D — iOS Xcode & Apple App Store Builder"
echo "=========================================================="

# 1. Stage web assets into www/ for Capacitor iOS bundle
mkdir -p www
cp index.html lithophane_studio.html manifest.json sw.js privacy.html logo.jpg icon-1024.png icon-512.png icon-192.png apple-touch-icon.png icon.svg www/

# 2. Install Capacitor iOS dependencies
npm install

# 3. Create or update the native iOS Xcode project
if [ ! -d "ios" ]; then
  npx cap add ios
fi
npx cap sync ios

# 4. Generate all iOS AppIcon.appiconset sizes from icon-1024.png
mkdir -p resources
cp icon-1024.png resources/icon.png
cp icon-1024.png resources/splash.png
npx @capacitor/assets generate --ios || true

# 5. Inject Apple App Store required Info.plist keys (Photo Library & Local File Export)
PLIST="ios/App/App/Info.plist"
if [ -f "$PLIST" ] && command -v /usr/libexec/PlistBuddy >/dev/null 2>&1; then
  /usr/libexec/PlistBuddy -c "Add :NSPhotoLibraryUsageDescription string 'Select photos from your library to convert into 3D lithophanes and keepsake relief models 100% locally on your device.'" "$PLIST" 2>/dev/null || \
  /usr/libexec/PlistBuddy -c "Set :NSPhotoLibraryUsageDescription 'Select photos from your library to convert into 3D lithophanes and keepsake relief models 100% locally on your device.'" "$PLIST"

  /usr/libexec/PlistBuddy -c "Add :NSPhotoLibraryAddUsageDescription string 'Save exported 2D depth maps and 3D model previews to your library.'" "$PLIST" 2>/dev/null || \
  /usr/libexec/PlistBuddy -c "Set :NSPhotoLibraryAddUsageDescription 'Save exported 2D depth maps and 3D model previews to your library.'" "$PLIST"

  /usr/libexec/PlistBuddy -c "Add :ITSAppUsesNonExemptEncryption bool false" "$PLIST" 2>/dev/null || \
  /usr/libexec/PlistBuddy -c "Set :ITSAppUsesNonExemptEncryption false" "$PLIST"

  /usr/libexec/PlistBuddy -c "Add :UISupportsDocumentBrowser bool true" "$PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :LSSupportsOpeningDocumentsInPlace bool true" "$PLIST" 2>/dev/null || true
fi

echo ""
echo "✅ Native iOS project ready! Opening in Xcode..."
npx cap open ios
