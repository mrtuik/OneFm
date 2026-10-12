# One Fm

Expo (prebuild) + TypeScript + React Native Firebase (Auth, Realtime Database).
Package: `com.onefm.tuik`. Expo Go does not work, you need a dev build or the CI APK.

## Local run
```
npm install
npx expo install expo-font
npx expo install --fix        # aligns every Expo package to the SDK (CI does this too)
npx expo prebuild --platform android
npx expo run:android
```

## First chat (M2)
1. Open Profile > AI provider, pick Groq (or OpenRouter / Custom), paste your API key, tap Test connection.
2. Open any story and tap Play Now. The AI opens episode 1 by itself.
The key is stored with expo-secure-store (Android Keystore). It is never sent to Firebase.
The master prompt lives in `src/ai/prompts.ts`.

## Memory (M3)
When an episode ends, the app summarizes it, extracts facts, and every 10 episodes merges the summaries into a rolling summary.
Chats, summaries and facts stay on the phone (AsyncStorage). Code: `src/ai/memory.ts`, `src/chat/engine.ts`.

## Voice (M4, sherpa-onnx)
`src/voice/engine.ts` is the only file that talks to the voice engine. It uses the local native module `modules/onefm-voice` (Kotlin, same design as the SHEETMD `sheet-tts` module). The phone's own text-to-speech voices are not used.
- The sherpa-onnx Kotlin API is `modules/onefm-voice/android/src/main/java/com/k2fsa/sherpa/onnx/Tts.kt` (v1.13.8). The native `.so` files are downloaded by the build workflow (step "Download sherpa-onnx native libraries") into `modules/onefm-voice/android/src/main/jniLibs/`, so they are not in git. Keep the version in the workflow and in `Tts.kt` the same.
- Voices are models from the sherpa-onnx `tts-models` release (list: `VOICES` in `engine.ts`). English: Piper Lessac and Ryan. Hindi: Piper Priyamvada, Pratham, Rohan. Bangla: Coqui female and Mimic3 multi voice.
- Models are not bundled. Download one in Profile > Voice (or tap the "Download voice" chip in a chat). The app downloads the `.tar.bz2` from GitHub, the native module unpacks it into the app's private storage, and it then works offline. Sizes are 64 to 103 MB, so use Wi-Fi.
- Audio is streamed into an `AudioTrack` while it is generated, so playback starts after the first sentence. Only one message speaks at a time.
- Bangla and Hindi voices read native script, so every AI reply carries `speech_text` (Bengali script or Devanagari) next to the Roman `display_text`.
- To add a voice, add one line to `VOICES` with the exact model name from https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models. The workflow step "Verify voice model links" warns if a name does not exist.
- Download error text is shown on the voice chip and in Profile.

## AI provider
- Groq shut down `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` on 16 Aug 2026. The presets now use `openai/gpt-oss-120b` (chat) and `openai/gpt-oss-20b` (summaries). Old saved settings are switched automatically.
- Free tiers have daily limits (Groq free plan, for example, about 8,000 tokens per minute and 200,000 per day for gpt-oss-120b). When you hit a limit the app shows "rate limiting" and Retry.

## Google Sign-In fix (must)
`google-services.json` currently has only the web client (type 3) and no Android client (type 1), because no SHA-1 was added.
1. `cd android && ./gradlew signingReport` shows the debug SHA-1.
2. Firebase > Project settings > `com.onefm.tuik` > Add fingerprint.
3. Add the release keystore SHA-1 too.
4. Download `google-services.json` again, replace it in this folder, run prebuild again.

## Database
- Firebase console > Realtime Database > Rules: paste `database.rules.json` while testing.
- Before release use `database.rules.locked.json` (it allows signed-in users to like stories and count plays).
- Sample data: open the app, Profile > "Seed sample stories to database".

## Release keystore and CI
```
keytool -genkeypair -v -keystore onefm.keystore -alias onefm -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 onefm.keystore            # KEYSTORE_B64
```
Optional GitHub secrets: `KEYSTORE_B64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`. Without them the APK is signed with the debug key.
Pushing a tag (`git tag v0.1.0 && git push --tags`) uploads the signed APK to a GitHub Release.

## Status
Done: 18+ gate, email, Google and guest login, language select, Home, Search, Pocket-style story page, like, Chats list, Chat with AI replies, provider settings, episode memory, voice chips with on-device sherpa-onnx voices, Profile.
Next: Community (M5), Library and profile stats (M6), moderation (M7).

## Community, profiles and the story brain
- Data: `posts/<id>` (the full story travels inside the post), `users/<uid>` (name, bio, avatarUrl, postLikes), `brain/sources`, `brain/pages`, `brain/lessons`, `config/admins/<uid>`.
- Admin: add your user id at `config/admins/<uid> = true` in the Firebase console. Admin can feature posts on Home, delete any post, and open Profile > Developer > Story brain.
- Story brain: add a novel as text (.txt/.md, paste, or a raw link). It is cut into ~1800 character pages. The app reads 2 or 3 pages, saves short technique lessons in `brain/lessons`, keeps at most 60, and `brainBlock()` in `src/brain/brain.ts` puts 8 of them in the master prompt. Code: `src/brain/brain.ts`, `src/screens/Brain.tsx`.
- Rules: `database.rules.json` is open for development. Switch to `database.rules.locked.json` when you are ready: posts need sign-in, novel pages are admin-only, lessons are public to read. It needs `.indexOn` for posts (already included). Test the admin features with the locked rules before you publish them.
- Cover art: `assets/covers/<storyId>.jpg`, mapped in `src/data/covers.ts`. User stories carry their own `image` (small data link).
