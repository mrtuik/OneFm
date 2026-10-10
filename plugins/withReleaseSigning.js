// Adds a release signing config to android/app/build.gradle, driven by env vars.
// Without the env vars the build falls back to the debug keystore.
const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = (config) =>
  withAppBuildGradle(config, (c) => {
    let g = c.modResults.contents;
    if (!g.includes('ONEFM_KEYSTORE')) {
      g = g.replace(
        /signingConfigs\s*\{/,
        `signingConfigs {
        release {
            if (System.getenv("ONEFM_KEYSTORE")) {
                storeFile file(System.getenv("ONEFM_KEYSTORE"))
                storePassword System.getenv("ONEFM_STORE_PASSWORD")
                keyAlias System.getenv("ONEFM_KEY_ALIAS")
                keyPassword System.getenv("ONEFM_KEY_PASSWORD")
            }
        }`
      );
      g = g.replace(
        /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
        `$1signingConfig System.getenv("ONEFM_KEYSTORE") ? signingConfigs.release : signingConfigs.debug`
      );
    }
    c.modResults.contents = g;
    return c;
  });
