# iOS App Store Submission Playbook

> Reusable guide for preparing and submitting an iOS app to the App Store.
> Distilled from the GitaVani project's submission process (February 2026).
> This document is for Claude Code — follow these steps in order.

---

## Phase 0: Pre-requisites

Before any App Store work, ensure these exist:

### 0.1 Apple Developer Program
- Enrollment costs $99/year at developer.apple.com
- After payment, wait for activation email (can take up to 48 hours)
- You'll get two emails: "Welcome to Apple Developer Program" + "Welcome to App Store Connect"
- Need: Apple ID, payment, patience

### 0.2 Website Pages (3 required URLs)
Apple requires a **privacy policy URL** and **support URL**. A marketing/landing page is optional but recommended.

Create 3 static HTML pages:
1. **index.html** — Landing page (app name, features, screenshots, download link)
2. **privacy.html** — Privacy policy (what data you collect — or don't)
3. **support.html** — Support page (FAQ, contact email)

**Hosting**: GitHub Pages is the easiest free option:
- Create a repo named `<app>-site` (e.g., `clearnews-site`)
- Add the 3 HTML files
- If using a custom domain: add a `CNAME` file with the domain name
- Enable GitHub Pages in repo Settings → Pages → Source: main branch
- Configure DNS (A records for GitHub Pages IPs + CNAME for www)

These URLs are entered in App Store Connect during submission.

### 0.3 App Icon
- Must be **1024x1024 PNG**, no alpha/transparency
- This is the App Store listing icon (separate from in-app icon sizes, which Xcode generates)
- Place in `Assets.xcassets/AppIcon.appiconset/`
- Tools: Recraft AI, Midjourney, or manual design

---

## Phase 1: Code Review & Hardening

Do a thorough review of the iOS code for App Store readiness. Check every item below.

### 1.1 PrivacyInfo.xcprivacy (REQUIRED since 2024)
Apple requires a privacy manifest file if you use any "required reason APIs" (UserDefaults, file timestamps, etc.).

Create `PrivacyInfo.xcprivacy` in the Xcode project:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSPrivacyTracking</key>
    <false/>
    <key>NSPrivacyTrackingDomains</key>
    <array/>
    <key>NSPrivacyCollectedDataTypes</key>
    <array/>
    <key>NSPrivacyAccessedAPITypes</key>
    <array>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>CA92.1</string>
            </array>
        </dict>
    </array>
</dict>
</plist>
```
Adjust the `NSPrivacyAccessedAPITypes` array based on what APIs the app actually uses.

### 1.2 Remove Debug Code
- Remove or `#if DEBUG` gate all `print()` statements
- Remove any test data or placeholder content
- Remove any TODO comments that indicate incomplete work

### 1.3 Error Handling
- Data loading must not block the main thread (use `Task { }` or async)
- All data loading must have error states (not infinite loading spinners)
- Network calls must handle failures gracefully with user-visible messages

### 1.4 Accessibility
Add `.accessibilityLabel()` to all interactive controls that use icons without text:
- Toolbar buttons (gear icon, heart icon, etc.)
- Toggle buttons (transliteration, etc.)
- Image-only buttons

### 1.5 About/Credits Screen
Create an About screen accessible from Settings with:
- App name and version (`Bundle.main.infoDictionary`)
- Data source attribution (if using third-party data)
- License information
- Privacy policy link (tappable, opens in Safari)
- Support link

### 1.6 License Files
Add to the repo root:
- `LICENSE` — Your app's license (MIT, etc.)
- Any additional license files for third-party data/code

### 1.7 iPad Compatibility
- If universal app, test on iPad simulator
- Ensure layouts aren't broken on larger screens
- Consider different default values for iPad (e.g., larger font size)

### 1.8 Color Contrast
- Verify all themes/color schemes meet WCAG 4.5:1 contrast ratio
- Pay special attention to dark themes and muted color palettes

---

## Phase 2: Metadata Preparation

Create an `appstore/metadata/` directory with these files:

### 2.1 description.txt (max 4000 characters)
- Brief intro paragraph
- Feature list with bullet points
- Privacy statement
- Data source attribution (if applicable)

### 2.2 keywords.txt (max 100 characters)
- Comma-separated, no spaces after commas
- Most important keywords first
- Don't repeat the app name (Apple already indexes it)

### 2.3 release_notes.txt
- "Initial release." + bullet points of key features
- Used for "What's New" (set after build is uploaded)

### 2.4 review_notes.txt
- Notes for the App Review team
- Explain how to use interactive features
- Mention if app is offline-only, no login required, etc.
- Mention any non-obvious features reviewers should test

---

## Phase 3: Screenshots

### 3.1 Planning
- Up to 10 screenshots per device size
- 6-8 is ideal — cover all key screens and features
- Showcase different themes/modes if applicable
- Plan which screen + which state for each screenshot

### 3.2 Required Device Sizes
At minimum, provide for one iPhone size. Recommended:

| Display | Resolution | Simulator Device |
|---------|-----------|-----------------|
| iPhone 6.9" | 1320 x 2868 | iPhone 17 Pro Max |
| iPhone 6.5" | 1284 x 2778 | iPhone 15 Plus / 16 Plus |
| iPad 13" | 2064 x 2752 | iPad Pro 13-inch (M5) |

**IMPORTANT**: Verify screenshot dimensions match exactly. Wrong dimensions = red error icons in App Store Connect. Use `sips -g pixelWidth -g pixelHeight <file>` to verify.

### 3.3 Capture Process
1. Run app on each simulator
2. Navigate to each planned screen/state
3. Capture with Cmd+S in Simulator (saves to Desktop)
4. Organize into `appstore/screenshots/<device-size>/` with numbered names:
   ```
   appstore/screenshots/iphone-6.9/01-home.png
   appstore/screenshots/iphone-6.9/02-detail.png
   ...
   appstore/screenshots/ipad-13/01-home.png
   ...
   ```

---

## Phase 4: App Store Connect API Setup

### 4.1 Create API Key
1. App Store Connect → Users and Access → Integrations → Keys
2. Click + → Name: "CLI", Access: Admin
3. Download the `.p8` file (one-time download!)
4. Note the **Key ID** and **Issuer ID**

### 4.2 JWT Token Generation
Install dependencies: `pip3 install PyJWT cryptography requests`

Generate token (reuse this pattern throughout):
```bash
TOKEN=$(python3 -c "
import jwt, time
with open('<PATH_TO_P8_FILE>', 'r') as f:
    private_key = f.read()
now = int(time.time())
payload = {'iss': '<ISSUER_ID>', 'iat': now, 'exp': now + 1200, 'aud': 'appstoreconnect-v1'}
print(jwt.encode(payload, private_key, algorithm='ES256', headers={'kid': '<KEY_ID>'}))
")
```

Tokens expire in 20 minutes. Regenerate as needed.

### 4.3 API Call Sequence

**All calls use**: `Authorization: Bearer $TOKEN` header and `Content-Type: application/json`.

#### Step 1: Find the App
```
GET https://api.appstoreconnect.apple.com/v1/apps
```
Returns `data[0].id` → this is `APP_ID`.

#### Step 2: Get the App Store Version
```
GET https://api.appstoreconnect.apple.com/v1/apps/{APP_ID}/appStoreVersions
```
Returns version with `id` → this is `VERSION_ID`.

#### Step 3: Get Localization ID
```
GET https://api.appstoreconnect.apple.com/v1/appStoreVersions/{VERSION_ID}/appStoreVersionLocalizations
```
Returns localization with `id` → this is `LOC_ID`.

#### Step 4: Push Metadata (description, keywords, URLs)
```
PATCH https://api.appstoreconnect.apple.com/v1/appStoreVersionLocalizations/{LOC_ID}
```
Body:
```json
{
  "data": {
    "type": "appStoreVersionLocalizations",
    "id": "<LOC_ID>",
    "attributes": {
      "description": "<from description.txt>",
      "keywords": "<from keywords.txt>",
      "marketingUrl": "https://...",
      "supportUrl": "https://.../support"
    }
  }
}
```
**GOTCHA**: Do NOT include `whatsNew` here — it can only be set after a build is attached to the version.

#### Step 5: Set Copyright and Version String
```
PATCH https://api.appstoreconnect.apple.com/v1/appStoreVersions/{VERSION_ID}
```
Body:
```json
{
  "data": {
    "type": "appStoreVersions",
    "id": "<VERSION_ID>",
    "attributes": {
      "copyright": "2026 Your Name",
      "versionString": "1.0.0"
    }
  }
}
```

#### Step 6: Set Categories
Categories are set on `appInfos`, NOT on `apps` (this is a common mistake).

First get the app info ID:
```
GET https://api.appstoreconnect.apple.com/v1/apps/{APP_ID}/appInfos
```
Then:
```
PATCH https://api.appstoreconnect.apple.com/v1/appInfos/{APP_INFO_ID}
```
Body:
```json
{
  "data": {
    "type": "appInfos",
    "id": "<APP_INFO_ID>",
    "relationships": {
      "primaryCategory": {
        "data": { "type": "appCategories", "id": "NEWS" }
      },
      "secondaryCategory": {
        "data": { "type": "appCategories", "id": "ENTERTAINMENT" }
      }
    }
  }
}
```
Common category IDs: `BOOKS`, `EDUCATION`, `NEWS`, `ENTERTAINMENT`, `REFERENCE`, `LIFESTYLE`, `UTILITIES`, `PRODUCTIVITY`, `SOCIAL_NETWORKING`, `HEALTH_AND_FITNESS`.

#### Step 7: Set Subtitle and Privacy Policy URL
Get localization ID from appInfoLocalizations:
```
GET https://api.appstoreconnect.apple.com/v1/appInfos/{APP_INFO_ID}/appInfoLocalizations
```
Then:
```
PATCH https://api.appstoreconnect.apple.com/v1/appInfoLocalizations/{APP_INFO_LOC_ID}
```
Body:
```json
{
  "data": {
    "type": "appInfoLocalizations",
    "id": "<APP_INFO_LOC_ID>",
    "attributes": {
      "subtitle": "Your App Subtitle (30 chars max)",
      "privacyPolicyUrl": "https://.../privacy"
    }
  }
}
```

#### Step 8: Set Age Rating
Get the age rating declaration (same ID as APP_INFO_ID):
```
GET https://api.appstoreconnect.apple.com/v1/appInfos/{APP_INFO_ID}/ageRatingDeclaration
```
Then:
```
PATCH https://api.appstoreconnect.apple.com/v1/ageRatingDeclarations/{AGE_RATING_ID}
```
Body (for a clean 4+ rating — all NONE/false):
```json
{
  "data": {
    "type": "ageRatingDeclarations",
    "id": "<AGE_RATING_ID>",
    "attributes": {
      "advertising": false,
      "alcoholTobaccoOrDrugUseOrReferences": "NONE",
      "contests": "NONE",
      "gambling": false,
      "gamblingSimulated": "NONE",
      "gunsOrOtherWeapons": "NONE",
      "healthOrWellnessTopics": false,
      "kidsAgeBand": null,
      "lootBox": false,
      "medicalOrTreatmentInformation": "NONE",
      "messagingAndChat": false,
      "parentalControls": false,
      "profanityOrCrudeHumor": "NONE",
      "ageAssurance": false,
      "sexualContentGraphicAndNudity": "NONE",
      "sexualContentOrNudity": "NONE",
      "horrorOrFearThemes": "NONE",
      "matureOrSuggestiveThemes": "NONE",
      "unrestrictedWebAccess": false,
      "userGeneratedContent": false,
      "violenceCartoonOrFantasy": "NONE",
      "violenceRealisticProlongedGraphicOrSadistic": "NONE",
      "violenceRealistic": "NONE"
    }
  }
}
```
**GOTCHA**: Some fields are booleans (`false`), others are strings (`"NONE"`). Mixing them up returns a type error. The boolean fields are: `advertising`, `gambling`, `lootBox`, `healthOrWellnessTopics`, `messagingAndChat`, `parentalControls`, `ageAssurance`, `unrestrictedWebAccess`, `userGeneratedContent`. Everything else is string `"NONE"`.

If the app has news content with potentially violent/mature content, set appropriate values (e.g., `"INFREQUENT_OR_MILD"`) instead of `"NONE"`.

#### Step 9: Set Review Notes
```
POST https://api.appstoreconnect.apple.com/v1/appStoreReviewDetails
```
Body:
```json
{
  "data": {
    "type": "appStoreReviewDetails",
    "attributes": {
      "notes": "<from review_notes.txt>"
    },
    "relationships": {
      "appStoreVersion": {
        "data": { "type": "appStoreVersions", "id": "<VERSION_ID>" }
      }
    }
  }
}
```
Note: This is a POST (create), not PATCH (update).

#### Step 10: Upload Screenshots
This is the most complex step. Use a Python script:

```python
import jwt, time, json, os, hashlib, requests

# Auth setup (same as above)
def get_token():
    with open('<P8_PATH>', 'r') as f:
        private_key = f.read()
    now = int(time.time())
    payload = {'iss': '<ISSUER_ID>', 'iat': now, 'exp': now + 1200, 'aud': 'appstoreconnect-v1'}
    return jwt.encode(payload, private_key, algorithm='ES256', headers={'kid': '<KEY_ID>'})

def headers():
    return {'Authorization': f'Bearer {get_token()}', 'Content-Type': 'application/json'}

# First create screenshot sets for each device
# POST https://api.appstoreconnect.apple.com/v1/appScreenshotSets
# Display types: APP_IPHONE_67, APP_IPHONE_65, APP_IPAD_PRO_3GEN_129
# Link to LOC_ID via relationships.appStoreVersionLocalization

# Then for each screenshot file:
# 1. Reserve: POST /v1/appScreenshots (fileName, fileSize, link to set)
# 2. Upload: PUT to each uploadOperation URL with file chunks
# 3. Commit: PATCH /v1/appScreenshots/{id} with MD5 checksum + uploaded=true
```

See the full working upload script in the GitaVani project for the complete implementation with chunk handling.

---

## Phase 5: Archive and Upload Build

### 5.1 Archive
```bash
xcodebuild -project <Project>.xcodeproj \
  -scheme <Scheme> \
  -configuration Release \
  -archivePath /tmp/<App>.xcarchive \
  archive \
  -destination "generic/platform=iOS"
```

### 5.2 Create ExportOptions.plist
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>destination</key>
    <string>upload</string>
</dict>
</plist>
```

### 5.3 Export and Upload
```bash
xcodebuild -exportArchive \
  -archivePath /tmp/<App>.xcarchive \
  -exportOptionsPlist /tmp/ExportOptions.plist \
  -exportPath /tmp/<App>Export \
  -allowProvisioningUpdates
```

This archives, signs, and uploads to App Store Connect in one step. Wait for "EXPORT SUCCEEDED".

### 5.4 Verify Build Processing
```
GET https://api.appstoreconnect.apple.com/v1/builds?filter[app]={APP_ID}&sort=-uploadedDate&limit=1
```
Check `processingState` = `VALID`.

### 5.5 Set Encryption Declaration
```
PATCH https://api.appstoreconnect.apple.com/v1/builds/{BUILD_ID}
```
Body:
```json
{
  "data": {
    "type": "builds",
    "id": "<BUILD_ID>",
    "attributes": {
      "usesNonExemptEncryption": false
    }
  }
}
```
Set to `true` only if the app uses non-exempt encryption (most apps don't — standard HTTPS is exempt).

---

## Phase 6: TestFlight Distribution

### 6.1 Create Beta Group
```
POST https://api.appstoreconnect.apple.com/v1/betaGroups
```
Body:
```json
{
  "data": {
    "type": "betaGroups",
    "attributes": {
      "name": "Beta Testers",
      "publicLinkEnabled": false,
      "feedbackEnabled": true
    },
    "relationships": {
      "app": {
        "data": { "type": "apps", "id": "<APP_ID>" }
      }
    }
  }
}
```

### 6.2 Add Testers
```
POST https://api.appstoreconnect.apple.com/v1/betaTesters
```
Body (repeat for each tester):
```json
{
  "data": {
    "type": "betaTesters",
    "attributes": {
      "email": "tester@example.com",
      "firstName": "Name",
      "lastName": ""
    },
    "relationships": {
      "betaGroups": {
        "data": [{ "type": "betaGroups", "id": "<GROUP_ID>" }]
      }
    }
  }
}
```

### 6.3 Add Build to Beta Group
```
POST https://api.appstoreconnect.apple.com/v1/betaGroups/{GROUP_ID}/relationships/builds
```
Body:
```json
{
  "data": [
    { "type": "builds", "id": "<BUILD_ID>" }
  ]
}
```

### 6.4 Submit for Beta App Review
External testers require a beta app review. Before submitting, you must set:

**Beta app description** (required):
```
POST https://api.appstoreconnect.apple.com/v1/betaAppLocalizations
```
With: `locale`, `description`, `feedbackEmail`, linked to app.

**Beta build localization** (what's new for this build):
```
POST https://api.appstoreconnect.apple.com/v1/betaBuildLocalizations
```
With: `locale`, `whatsNew`, linked to build.

**Beta review contact info** (required):
```
PATCH https://api.appstoreconnect.apple.com/v1/betaAppReviewDetails/{APP_ID}
```
With: `contactFirstName`, `contactLastName`, `contactPhone`, `contactEmail`, `demoAccountRequired` (false if no login).

**Then submit**:
```
POST https://api.appstoreconnect.apple.com/v1/betaAppReviewSubmissions
```
Body:
```json
{
  "data": {
    "type": "betaAppReviewSubmissions",
    "relationships": {
      "build": {
        "data": { "type": "builds", "id": "<BUILD_ID>" }
      }
    }
  }
}
```
Response should show `betaReviewState: WAITING_FOR_REVIEW`. Beta review usually takes a few hours.

---

## Phase 7: App Store Review Submission

After TestFlight testing is complete and any bugs are fixed:

1. Attach the final build to the App Store version in App Store Connect
2. Set `whatsNew` (release notes) — now possible since build is attached
3. Click "Add for Review" (or submit via API)

---

## Common Gotchas & Lessons Learned

1. **whatsNew can't be set until a build is attached** — don't include it in initial metadata push
2. **Categories go on appInfos, not apps** — `PATCH /v1/appInfos/{id}` not `/v1/apps/{id}`
3. **Age rating has mixed types** — some fields are boolean, some are string "NONE"
4. **Screenshot dimensions must match exactly** — verify with `sips -g pixelWidth -g pixelHeight`
5. **iPhone 17 is NOT 6.5"** — it's 6.3" (1206x2622). Use iPhone 15/16 Plus for 6.5" screenshots
6. **Beta review is required for external testers** — internal testers (App Store Connect accounts) don't need it
7. **Beta review needs 3 things set first**: beta app description, beta review contact info, beta build localization
8. **JWT tokens expire in 20 minutes** — regenerate for long-running scripts
9. **Screenshot upload is 3 steps**: reserve → upload chunks to S3 URLs → commit with MD5
10. **ExportOptions.plist with `destination: upload`** handles signing + upload in one xcodebuild call
