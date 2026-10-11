#!/usr/bin/env bash
# Runs inside the Android emulator: installs the APK, launches it, collects logcat.
set -u
APK=android/app/build/outputs/apk/release/app-release.apk
PKG=com.onefm.tuik

adb wait-for-device
adb install -r "$APK"
adb logcat -c
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1
sleep 25
PID=$(adb shell pidof "$PKG" | tr -d '\r')
adb logcat -d -v time > logcat.txt
adb exec-out screencap -p > screen.png

{
  echo "### Emulator result"
  if [ -n "$PID" ]; then echo "App is RUNNING after 25s (pid $PID)"; else echo "App is NOT running after 25s (it crashed or exited)"; fi
  echo '```'
  grep -E "FATAL EXCEPTION|AndroidRuntime|Fatal signal|ReactNativeJS|Caused by|UnsatisfiedLinkError|SoLoader|FirebaseApp|Process: $PKG|backtrace" logcat.txt | cut -c1-220 | head -60
  echo '```'
} >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
