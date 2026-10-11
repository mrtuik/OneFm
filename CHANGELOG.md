# One Fm changelog

## V1
- New color palette: #2E2828, #503A3A, #F65151, #FEF4F4 (theme, app.json, crash screen).
- Bottom navigation rebuilt as a custom tab bar, taller (76 + safe area), with the supplied Home, Search and Chat SVG icons, an active pill and labels.
- Community tab shows the user's avatar (Google photo, or the initial, or a person icon for guests).
- Fixed poster sizes everywhere: hero and story detail use 16:10, rows use square 176 tiles, search results use 104 square posters.
- Shared spacing (screen 16, card 16, gap 12, section 24) applied to Home, Search, Profile, Story detail and onboarding, matching the Love Music layout.
- All app text is plain English. Language chips now read English, Bangla and Hindi.
- Added dependency: react-native-svg 15.12.1 (run `npx expo install --fix`).
