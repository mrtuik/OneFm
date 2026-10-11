# One Fm changelog

## V4.1
- Fixed the TypeScript errors in StoryDetail (GradientView now accepts style arrays and StyleSheet.absoluteFill).
- Build workflow now saves the Gradle log and prints the real error (CMake, Kotlin, Java) in the run Summary under "Real build error", so a native failure like configureCMake is readable.

## V4
- Voice: sherpa-onnx is now the voice engine (`react-native-sherpa-onnx`). Phone text-to-speech (expo-speech) is removed. English, Hindi and Bangla voices download on demand, work offline, and stream into a native PCM player. Voice chip shows Download, progress, loading and play states. Profile > Voice lists voices with Get, Preview, Remove and a selected voice per language.
- Chat screen redesigned: Claude-style composer (text field on top, character chip and send button underneath), rounded card that gets a pink outline when focused, tap anywhere on it to type, keyboard opens by itself, field stays focused while the AI writes, keyboard-aware layout, safe bottom padding. AI messages have a small speaker avatar, your messages are outlined cards with a YOU label, episode end is a divider line, header shows who you are talking to.
- Bottom nav: taller bar (72) with more space above the icons.
- Search icon replaced with the Material twotone-search icon.
- story_engine_guide.md applied: master prompt (12 writing rules, safety, language), story bible with setting, tone, central question, rules and secrets, full character cards, memory prompts (episode summary, fact extractor with type and importance, rolling summary under 250 words) and the guide's temperatures. The guide's "New Girl in College" story is added as a sample story.
- New dependencies: react-native-sherpa-onnx, @dr.pogodin/react-native-fs, @kesha-antonov/react-native-background-downloader. Removed: expo-speech.

## V3
- Story page rebuilt like the Pocket FM story page: gradient header, centered square poster with a plays ribbon, Like and Play Now buttons, stats row (plays, likes, episodes, rating), creator row, Episodes and Details tabs, Resume EP button, floating back and share buttons.
- Accent color is now the Pocket FM pink (#E31A4E, sampled from the reference image) everywhere.
- Bottom nav is smaller: 22 px icons, 10 px labels, shorter bar.
- M2 Chat core: Chat screen (full-width AI text without bubbles, narration in italics, outlined user cards, character chip, choices, typing indicator, long press for copy, regenerate and delete), Ep counter, episode-end card, Chats tab list, Continue Chat row on Home, AI provider settings (Groq, OpenRouter, custom) with a secure API key and a test button, master prompt, structured JSON replies with one retry and a plain-text fallback.
- M3 Memory: per-episode summary, fact extraction (importance 1 to 5), rolling summary merged every 10 episodes, top facts picked per turn, message limit per episode (default 40) that forces a suspense closing beat.
- M4 Voice: voice chip with play button, waveform and duration, auto-play setting, voice picker with preview in Profile, install hint when no Bangla or Hindi voice exists. Uses the phone's text-to-speech voices. sherpa-onnx is not included yet.
- Firebase: likes (atomic write of the user's like and the story counter), play counts, safer story loading, updated locked rules.
- New dependencies: expo-secure-store, expo-speech, expo-clipboard (run `npx expo install --fix`).
- README is now fully English.

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
