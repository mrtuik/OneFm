# One Fm changelog

## V6.9.20
- Trending Now: the rank numbers no longer touch the next cover (more space between stories), and 10 is fully visible (two digit ranks get more room).
- See all page redesigned: two column grid of square covers with genre badge, bold title and plays. Trending shows #1, #2... on the covers.

## V6.9.19
- Bottom bar looks like Snapchat: icons only, a slightly lighter bar with a thin line on top. Tabs are now Home, Feed, Chats and Me.
- Feed (replaces the Search tab and the Community tab): a normal scrolling feed of posts. Five sample posts sit under the real ones so it never looks empty (likes on samples stay on the phone).
- Me tab (your avatar): opens your own profile with Edit profile, Settings, Public / Private. Guests are asked to sign in.
- Search opens from the Home search bar as its own page with the keyboard already open. The language chips are gone (genre chips stay).
- The chat icon is smaller, the same size as the other icons.

## V6.9.18
- Profile page redesigned, black theme: a card with a banner, avatar on the banner edge, name, @username, bio, three numbers (Stories, Likes, Plays) and one big button (Post a story on my own profile, Share profile on others). Under it an Instagram style 3 column grid of story covers with Public / Private tabs on my own profile.
- Settings: the profile card is now the way in. Tap it to open your profile. The separate "My public profile" row and the "Edit profile" link are gone. Edit profile and a Settings button are on the profile page.
- AI brain row has the new three-card icon.

## V6.9.17
- Chats tab icon is now the chat bubble with a smile (drawn with react-native-svg, takes the tab color).
- Bottom navigation shows icons only (no text), a little bigger, with more space above them.
- App bar has more space above and below.

## V6.9.16
- Home redesigned. The header stays as it was. Under it: a search bar (tap opens Search), genre tabs (For You, Romance, Thriller, Horror, Fantasy, Campus), then Trending Now with big rank numbers 1, 2, 3 and the plays under each cover.
- Continue Chat, From the community, Top Rated, New Stories and the genre rows now have a bold title with a pink "See all" on the right. Stories show as small square covers with name and plays. Continue Chat shows "Ep 2 of 3" and its See all opens Chats.
- See all opens a new list screen with every story of that section.
- Search bar and tabs stay on top while the page scrolls. A genre tab shows only that genre's stories.

## V6.9.15
- Profile is now a settings list: profile card (Edit profile), grouped rows with icons, value and chevron. "AI brain" shows "Set your brain setup" until a key is saved; tapping it opens a bottom sheet (provider, API key, models, Save / test). Voice, Reading language, Text size and "I am" open bottom sheets too.
- Gender is asked once after the first login (and saved on the profile, so a new phone does not ask again). Guests choose it locally.
- Edit profile screen: name, unique @username (live check, claimed with a transaction), bio, gender. Saved to Firebase. Every reader gets a starting @username from their email.
- Posts show @username under the creator's name. Names and usernames are taken from the creator's current profile.
- Public / Private: on your own profile there are two tabs. Private stories are stored under `private/<uid>` (only you can read them). Choose Public or Private when posting, or press and hold a story to switch it.
- database.rules.locked.json: added `usernames` and `private`.

## V6.9.13
- google-services.json replaced with the new one that has the Android client (type 1) with your SHA-1. Google Sign-In needs this.

## V6.9.12
- Lessons reach every reader at once: each time lessons change (studied, added or deleted), the admin's phone bumps `brain/meta/updatedAt`. Every phone checks that one small number when the app opens and downloads the new lessons if it changed (no more 12 hour wait).
- Story brain screen: "Add a lesson yourself" (all languages or one language). It goes to everyone like the AI-learned ones.
- database.rules.locked.json: `brain/meta` is readable by all, writable by admin.

## V6.9.11
- Community tab is live: reader posts (story cards with cover, caption, like, Play), a + button to post, and a post menu (View profile, Report, Delete for the owner).
- Post a story two ways: fill a short form, or paste the story JSON from the master prompt. Both are checked first (18+ characters, required fields, blocked words) and show a preview. A cover picture can be added from the gallery.
- Admin: in a post menu choose "Show on Home". The story is copied to the Home page list and appears in a new "From the community" row. "Remove from Home" takes it off. Admin = your user id listed at config/admins/<id> = true (Profile > Developer has a Copy my user id button).
- Public profile for every reader (avatar, name, bio, stories, likes). Tap a creator anywhere. Your own profile can be edited. Profile > "My public profile and stories".
- Story brain (admin, Profile > Developer): add novels as text (file, paste or link), saved in Realtime Database as small pages. Every few hours (or Study now) the app reads 2 or 3 pages, writes down writing techniques (never copied text), and a few of those lessons are added to every story chat. Novel pages can be read by admin only. The lessons are shared with everyone.
- Cover art for all 11 stories, shown on cards, Home hero and the story page. Stories with an `image` field use it.
- Chat options sheet moved to a shared component (also used by the Community post menu).
- New packages: expo-document-picker, expo-image-picker, expo-image-manipulator (CI aligns versions with `expo install --fix`).
- database.rules.locked.json updated for posts, brain and admins (see README).

## V6.9.10
- Voice numbers (model, first sound, audio made, level, rms, dc) are gone from chat and Profile, and the small info icon is gone too. Real errors still show under the voice.
- Your message is now a WhatsApp-style bubble: right side, no name label, smaller corners, tight padding. The voice chip and the Next / Again / Next episode buttons have smaller corners too.
- Chat options sheet redesigned: black sheet, one single card with all four options, thin dividers between them, and each icon in its own small rounded card. Restart stays pink.
- Story prompt (Banglish): one pronoun level for the whole story. Every character says tumi, never tui/tor/tore, and the verbs match.

## V6.9.9
- Fix: the error "Android did not start the audio output (position stayed at 0)" appeared even when the voice played. Some phones do not report the play position after stop(). The player now trusts the clock when the position does not move, and the false error is gone. Real errors (refused write, no audio made) still show.
- Voice starts earlier. Before, nothing played until the whole message was made (12.9 s of audio took 23.7 s, so the first sound came after 23.8 s). Now sentences go to a player thread as they are made, and playback starts as soon as the audio already made lasts longer than the time still needed for the rest (estimated from the speed measured on the phone). Same message: first sound after about 11 s, and it never stops in the middle. Replays still start at 0 s from memory.
- The numbers line (model, first sound, audio made, level, rms, dc) is no longer printed under the voice in chat or in Profile. A small info icon appears next to the voice; tap it to show or hide the numbers. Errors still show directly.

## V6.9.8
- Voice silence fixed at the root (Profile preview and chat both). The native player used a 20 second AudioTrack buffer. Android does not start a stream track until its buffer has been filled once, and a 4 to 7 second message never fills 20 seconds, so nothing was heard, the screen still showed the stop icon / played state, and the track was released at the end with no error. Now the buffer is about 1 second, audio is 16-bit PCM (works on every phone), and stop() is called after the last write so Android plays out whatever is left.
- The player no longer fails silently: a refused write or an output that never started now shows the real reason under the voice (before, it just said done).
- Replays from memory use the same fixed player.

## V6.9.1
- Voice now works like SHEETMD's player: the whole message is generated first (sentence by sentence), levelled once, then played from the start in one go with play() called before the first write. Nothing starts halfway, so a message is never heard in pieces.
- No voice file is saved to disk any more. Replays come from memory (last 8 messages). Before, a saved file could replay silence with no error.
- Quiet voices are lifted once over the whole message, a constant offset is removed, and loud peaks are rounded off softly instead of being cut flat.
- Chat: the voice text is converted in parts at the same time (Google Input Tools first, AI as backup), then the joined text is spoken once.
- Voice: a constant offset (DC) is removed from every generated sentence before the volume lift. The numbers line now also shows rms (average loudness) and dc (offset removed): peak 1.00 with a tiny rms means the sound is a flat line, not speech.
- Profile preview is no longer saved or replayed from a file. It is always generated live, the same path that plays in chat, so the numbers line shows real generation time.
- The volume lift never pushes the loudest sample past full scale any more (before, a 40x lift could clip it into clicks).
- Voice text conversion first tries Google Input Tools (the engine behind Google's Bangla/Hindi keyboards): Banglish or Hinglish becomes native script in a fraction of a second, no API key. If it fails or the result still has English letters, the AI conversion runs as before.
- Voice start in chat: when the voice text must be converted to Bangla/Hindi script, the message is now cut into parts. Part 1 (about 60 to 110 characters) is converted and spoken first, the other parts are converted at the same time and play one after another. Before, the voice waited for the whole message to be converted (one or two big AI calls).
- Profile preview and replays: a saved (cached) voice file is now read whole and levelled to a clear volume before it plays, and the cache key is bumped (v4) so any quiet or silent file saved by an older build is ignored. Replays also show the numbers line under the voice. Before, a replay showed the stop icon but played almost nothing, with no error.
- Build summary now prints the SHA-1 and SHA-256 with apksigner (keytool printed "Not a signed jar file" for this APK).
- Voice no longer waits for a second network call: when the story's own speech_text is already clean Bangla/Hindi script and covers the whole message, it plays at once. The extra rewrite call (15 to 25 s on mobile data) now runs only when speech_text is bad.
- Native player: playback starts right after the first samples are written (before, play() came only after a whole write loop, so a piece longer than the buffer could block forever).
- First spoken piece is cut shorter (about 36 characters) so the first sound is ready sooner.

## V6.9
- Numbers on screen: under a voice message chip and under a Profile voice (after you play it) a small gray line shows where the time goes: model load, first sound, audio length made and how long it took, and the level before and after the lift. Send a screenshot of it and the slow part is clear.
- The voice model is loaded when the app opens (not only when a chat opens). Preview sentence is longer so it is closer to a story reply. Audio cache key bumped (v3).
- Voice (sherpa-onnx only, no fallback of any kind): Bangla model output is very quiet. Every generated sentence is now lifted to a clear level (99.9th percentile to 0.8, max 40x) before it plays and is saved. Old saved audio is ignored (new cache key). Text is also cut at the Bangla danda, so playback starts sooner.
- Voice start time: before, the first play waited until almost the whole message was generated (about 20 s of silence on a slow voice), then replays started at 0 s from the saved file. Now playback starts after the first short piece (first piece is cut to about 45 characters, later pieces to 80 to 100). The voice model is also loaded in the background when a story chat or the Profile voice list opens, and the load is shared so it never starts twice.
- Profile preview shows a spinner and "Getting the voice ready..." while it works, instead of looking dead.
- Profile > Voice: a preview that fails now shows the real reason under the voice name (before, Profile showed nothing).
- No outlines anywhere: buttons, chips, voice chip, your message card, composer chip, Profile voice rows and fields, age check, story page and the tab bar avatar ring are soft filled shapes. Selected items use a pink tint. The header divider line is gone.
- App icon: the pen is smaller on a full black fill (launcher and adaptive icon).

## V6.8.1
- App icon: the pen is bigger in the launcher icon (adaptive and legacy), so the icon looks full.
- Voice silence: every message is now checked for sound. If a voice makes no sound, the chip shows the exact reason under it (media volume is 0, the voice text is in English letters, or the voice produced silent audio with its loudest sample level) instead of playing silence. Silent audio is no longer saved, so it cannot replay silence for the same text.
- Voice text: Bangla joiners (ZWJ and ZWNJ) are no longer deleted from the voice text, which was breaking words like ব্যাপার. The Bengali or Devanagari conversion tries twice if the first answer still has English letters.
- NaN or infinite samples from a voice model are removed and counted. The player volume is set to full before play.

## V6.8
- Story now supports plotBeats and endings (from the story_engine_guide). The AI sees them in the story bible.
- Stories loaded from the database get safe defaults for highlight, readMin, creatorName and createdAt, so a story with missing fields no longer shows "undefined min each" or breaks the New row.
- Fix: the AI no longer repeats the opening scene when you reply. Every turn now tells the model exactly what your role just said and that the first paragraph must answer it. The chat history no longer starts with an AI message.
- Fix: a reply that is almost the same as the last two AI replies is rejected and written again (up to 3 tries).
- Narration never describes your role (face, eyes, feelings). Your role is only "you / tumi". New rules: answer first, no re-describing the same scene, use concrete story details.
- Banglish quality guide in the prompt (natural tumi / tomake / tomar, short spoken sentences, good and bad examples).
- Suggestion chips: 3 different ideas (speak, act, ask or stay silent), 4 to 10 words, specific to what just happened.
- "Brishti Bhora Bikel" now has a full story bible: setting, tone, rules, 3 secrets, full character cards with example dialogue, and episode scenes and hooks. Saved copies of this story get the missing bible fields automatically.

## V6.1
- Keyboard: the composer is never hidden behind the keyboard again. KeyboardAvoidingView is back, but it is switched on only while the keyboard is open, so no gap stays when it closes. With the keyboard closed there is a small gap (24) above the system bar.
- All chat screen words follow the story language: Hinglish for Hindi stories (Aage, Dobara, Agla episode, Kuch bolo..., role picker, menu, alerts, episode end card), Banglish for Bangla stories.
- Suggestion chips are written by the AI in the story language (Hinglish or Banglish) from your role's point of view. Every turn also carries a language reminder, so narration stays Hinglish even when the old history was English. Restart the story once to clear old English replies.
- Old chats (started before roles) now show "You are the main character" in the header instead of "Choose your role".

## V6
- Roles: you play ONE role and the story plays everybody else (like Kavana). A new chat first asks "Who do you want to play?". The list has "You (main character)" and every character that fits your gender. Gender is set in Profile > I am (the picker also has Male / Female buttons). Tap your role chip in the composer, or menu > Change my role, to switch.
- Story chat is now paragraph style like Kavana: several short paragraphs, narration in light gray italics, dialogue in white with the speaker name in bold, several characters can speak in one reply.
- Narration is written in the story language too (Hinglish for Hindi stories, Banglish for Bangla stories), not English.
- New buttons under the last reply: Next (the story moves on without you typing), Retry (regenerate), Next episode (closes the episode with a closing scene). Menu also has Next episode. Retry now replaces only the last reply.
- Composer and suggestion chips have no outline any more. The pink focus outline is gone.
- Keyboard gap fixed: KeyboardAvoidingView is replaced by a small hook that adds space only while the keyboard is open, so no empty gap stays under the composer after it closes.
- Voice text is cleaned before speaking: markdown, symbols, quotes, brackets, emoji and speaker labels are removed, ? and ! become a full stop. The voice engine itself is unchanged.
- Character has an optional `gender` field; sample stories have it. Stories already in the database get it filled from the bundled samples by story id and character name.

## V5
- Voice rebuilt on a local native module (`modules/onefm-voice`) ported from SHEETMD's working `sheet-tts`. The `react-native-sherpa-onnx` library and its two peer packages are removed: its download manager failed on the phone ("Download failed") and its codegen broke the CMake step. Download uses expo-file-system, unpacking is done natively, playback streams into an AudioTrack. Error messages now show the real reason.
- Build workflow downloads the sherpa-onnx native libraries (v1.13.8, arm64) and verifies the voice model links. The V4.2 codegen step is removed.
- Groq models: `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` no longer exist (retired 16 Aug 2026), which caused "404 model does not exist". Presets now use `openai/gpt-oss-120b` and `openai/gpt-oss-20b`; saved settings are migrated; gpt-oss gets low reasoning effort and a bigger token budget; a 404 now tells you what to change.
- `.gitignore` uses `/android/` and `/ios/` so `modules/onefm-voice/android` is not ignored.
- New dependency: expo-file-system. Removed: react-native-sherpa-onnx, @dr.pogodin/react-native-fs, @kesha-antonov/react-native-background-downloader.

## V4.2
- Build fix: the Gradle build failed in `configureCMakeRelWithDebInfo` because react-native-sherpa-onnx had not generated its codegen folder yet. The workflow now generates it first (step "Pre-generate sherpa-onnx codegen") and no longer sets `org.gradle.configureondemand`, which can break the task order of React Native libraries.

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
