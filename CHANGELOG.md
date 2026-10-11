# One Fm changelog

## V2
- Black theme restored (#0A0A0A background, #171313 cards). Accent #F65151 and text #FEF4F4 stay from the palette.
- Bottom nav: removed the square highlight behind the active icon. Active tab is shown by color and bold label only.
- Smaller corner radius everywhere: cards 12, inner elements 8, buttons 10, badges 6.
- Story detail: floating round back button over the poster, poster keeps the shared 16:10 size under the header, clearer sections, numbered episode badges, readable disabled "Start chat" button.
- Profile: avatar header, language, voice and developer settings in separate cards, log out at the bottom.
- User-facing text no longer mentions milestone names (M2, M5, M6); it says "coming soon".

## V1
- New color palette: #2E2828, #503A3A, #F65151, #FEF4F4 (theme, app.json, crash screen).
- Bottom navigation rebuilt as a custom tab bar, taller (76 + safe area), with the supplied Home, Search and Chat SVG icons, an active pill and labels.
- Community tab shows the user's avatar (Google photo, or the initial, or a person icon for guests).
- Fixed poster sizes everywhere: hero and story detail use 16:10, rows use square 176 tiles, search results use 104 square posters.
- Shared spacing (screen 16, card 16, gap 12, section 24) applied to Home, Search, Profile, Story detail and onboarding, matching the Love Music layout.
- All app text is plain English. Language chips now read English, Bangla and Hindi.
- Added dependency: react-native-svg 15.12.1 (run `npx expo install --fix`).
