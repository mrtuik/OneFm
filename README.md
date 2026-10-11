# One Fm (M0 + M1)

Expo (prebuild) + TypeScript + React Native Firebase (Auth, Realtime Database).
Package: `com.onefm.tuik`. Expo Go kora jabe na, dev build lagbe.

## Local run
```
npm install
npx expo install --fix        # SDK version gulo mildhe nebe (CI o eta chalay)
npx expo prebuild --platform android
npx expo run:android
```

## Google Sign-In fix (must)
`google-services.json` e ekhon sudhu web client (type 3) ache, Android client (type 1) nei, karon SHA-1 add kora hoy ni.
1. `cd android && ./gradlew signingReport` e debug SHA-1 pabe
2. Firebase > Project settings > `com.onefm.tuik` > Add fingerprint
3. Release keystore er SHA-1 o add koro
4. `google-services.json` abar download kore ei folder e replace koro, prebuild abar chalao

## Database
- Firebase console > Realtime Database > Rules e `database.rules.json` paste koro (test mode).
- Release er age `database.rules.locked.json` ta use koro.
- Sample data: app e dhuke Profile > "Seed sample stories to database".

## Release keystore + CI
```
keytool -genkeypair -v -keystore onefm.keystore -alias onefm -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 onefm.keystore            # KEYSTORE_B64
base64 -w0 google-services.json      # GOOGLE_SERVICES_JSON_B64
```
`google-services.json` repo te commit kora ache (eta secret noy, APK er bhetor e thake), tai `GOOGLE_SERVICES_JSON_B64` secret optional.
Release signing er jonno optional GitHub Secrets: `KEYSTORE_B64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`. Na dile APK debug key diye sign hoy.
Tag push (`git tag v0.1.0 && git push --tags`) korle signed APK GitHub Release e jabe.

## Ki ache / ki nei
Ache: 18+ gate, email + Google + guest login, language/voice select, Home (hero + rows), Search, Story detail, Profile, bottom nav.
Nei (porer milestone): Chat (M2), memory (M3), voice (M4), community (M5), library (M6).
