#!/bin/bash
# Builds the iOS app for release and uploads it to App Store Connect for TestFlight.
#   ios/scripts/testflight-upload.sh
# Signing is automatic, through the Apple account signed in to Xcode (team F66D7QPY4N).
# Each upload needs a build number not used before for its version: raise
# CURRENT_PROJECT_VERSION in the project first. The build number is uploaded as is.
# Apple then processes the build; it shows in App Store Connect under TestFlight.
# Steps after that (testers, beta review): docs/app-store-submission-playbook.md, phase 6.
# Output and the log go to ios/build/ (ignored by git).

set -euo pipefail
IOS="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="$IOS/ClearNews/ClearNews/ClearNews.xcodeproj"
OUT="$IOS/build"
TEAM=F66D7QPY4N
mkdir -p "$OUT"

settings=$(xcodebuild -project "$PROJECT" -scheme ClearNews -configuration Release -showBuildSettings 2>/dev/null)
version=$(echo "$settings" | awk '/ MARKETING_VERSION = / {print $3; exit}')
build=$(echo "$settings" | awk '/ CURRENT_PROJECT_VERSION = / {print $3; exit}')
commit=$(git -C "$IOS" rev-parse --short HEAD)
if [ -n "$(git -C "$IOS" status --porcelain -- .)" ]; then
  echo "Note: ios/ has uncommitted changes; this upload includes them."
fi

name="ClearNews-$version-$build"
log="$OUT/$name.log"
: >"$log"
echo "ClearNews $version ($build) from commit $commit. Log: $log"

echo "Building the release archive"
if ! xcodebuild -project "$PROJECT" -scheme ClearNews -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$OUT/$name.xcarchive" \
  -allowProvisioningUpdates archive >>"$log" 2>&1; then
  tail -25 "$log"
  exit 1
fi

cat >"$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>destination</key>
    <string>upload</string>
    <key>teamID</key>
    <string>$TEAM</string>
    <key>signingStyle</key>
    <string>automatic</string>
    <key>manageAppVersionAndBuildNumber</key>
    <false/>
</dict>
</plist>
PLIST

echo "Signing and uploading to App Store Connect"
if ! xcodebuild -exportArchive -archivePath "$OUT/$name.xcarchive" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" -exportPath "$OUT/$name-export" \
  -allowProvisioningUpdates >>"$log" 2>&1; then
  tail -25 "$log"
  exit 1
fi
grep -E "EXPORT SUCCEEDED|Upload succeeded|Uploaded" "$log" | tail -3
echo "Done. Apple is processing ClearNews $version ($build)."
