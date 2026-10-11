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
`src/voice/engine.ts` is the only file that talks to the voice engine. It runs sherpa-onnx text-to-speech fully on the phone through the `react-native-sherpa-onnx` package. The phone's own text-to-speech voices are not used.
- Voices are models from the sherpa-onnx `tts-models` release (list: `VOICES` in `engine.ts`). English: Piper Lessac and Ryan. Hindi: Piper Priyamvada, Pratham, Rohan. Bangla: Coqui female and Mimic3 multi voice.
- Models are not bundled. Download one in Profile > Voice (or tap the "Download voice" chip in a chat). It is stored on the phone and works offline. Sizes are 64 to 103 MB, so use Wi-Fi.
- Replies are streamed into the native PCM player sentence by sentence, so audio starts early. Only one message speaks at a time.
- Bangla and Hindi voices read native script, so every AI reply carries `speech_text` (Bengali script or Devanagari) next to the Roman `display_text`.
- Extra native packages (peers of the library): `@dr.pogodin/react-native-fs` and `@kesha-antonov/react-native-background-downloader`. They autolink during `expo prebuild`.
- To add a voice, add one line to `VOICES` with the exact model id from https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models.

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
