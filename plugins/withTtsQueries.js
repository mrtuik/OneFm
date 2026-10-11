// Android 11+ package visibility: without <queries> for the TTS service the app cannot see Google Speech Services
// and the phone voice stays silent.
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withTtsQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const m = cfg.modResults.manifest;
    m.queries = m.queries || [];
    const has = m.queries.some((q) => (q.intent || []).some((i) => (i.action || []).some((a) => a.$ && a.$['android:name'] === 'android.intent.action.TTS_SERVICE')));
    if (!has) m.queries.push({ intent: [{ action: [{ $: { 'android:name': 'android.intent.action.TTS_SERVICE' } }] }] });
    return cfg;
  });
};
