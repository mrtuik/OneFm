import React, { useEffect } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GradientButton, OutlineButton } from './Ui';
import { colors, radius } from '../theme';
import { DEFAULT_LOCAL, cancelDownload, deleteLocalModel, pauseDownload, refreshLocalState, startDownload, useLocalState } from '../ai/local';

const gb = (n: number) => (n / 1e9).toFixed(2);

/** Phone RAM in GB when expo-device is in the build, otherwise null. */
function phoneRamGb(): number | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const D = require('expo-device');
    return typeof D.totalMemory === 'number' && D.totalMemory > 0 ? D.totalMemory / 1e9 : null;
  } catch { return null; }
}

/** The "On this phone" part of the AI brain sheet: download, pause, resume, delete Gemma 4. */
export function LocalBrain() {
  const m = DEFAULT_LOCAL;
  const st = useLocalState();
  useEffect(() => { refreshLocalState(); }, []);
  const ram = phoneRamGb();
  const lowRam = ram !== null && ram < m.minRamGb - 0.7; // a "6 GB" phone reports about 5.5 GB

  const download = () => Alert.alert(
    `Download ${m.name}?`,
    `It is about ${m.sizeLabel}. Use Wi-Fi if you can. After this the AI works without internet, free and with no limit.${lowRam ? `\n\nThis phone has about ${ram!.toFixed(1)} GB of RAM and the model wants ${m.minRamGb} GB or more. It may be slow or close the app.` : ''}`,
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Download', onPress: () => { startDownload(m); } }],
  );
  const remove = () => Alert.alert('Delete the model?', `This frees ${m.sizeLabel}. You can download it again later.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { deleteLocalModel(m); } },
  ]);

  const pct = st.total > 0 ? Math.min(100, Math.round((st.received / st.total) * 100)) : 0;

  return (
    <View style={s.box}>
      <View style={s.head}>
        <Ionicons name="phone-portrait-outline" size={20} color={colors.accent} />
        <Text style={s.title}>{m.name}</Text>
      </View>
      <Text style={s.hint}>
        {`Google's small AI model. It runs on this phone: free, no key, no limit, works offline. Download once (${m.sizeLabel}). Needs a phone with ${m.minRamGb} GB RAM or more. Replies are slower than the cloud (often 20 to 60 seconds) and a little simpler.`}
      </Text>

      {lowRam ? <Text style={s.warn}>{`This phone has about ${ram!.toFixed(1)} GB RAM. A cloud provider may work better.`}</Text> : null}

      {st.phase === 'none' ? <GradientButton title={`Download (${m.sizeLabel})`} onPress={download} /> : null}

      {st.phase === 'downloading' || st.phase === 'paused' ? (
        <View style={{ gap: 10 }}>
          <View style={s.bar}><View style={[s.fill, { width: `${pct}%` }]} /></View>
          <Text style={s.hint}>{`${st.phase === 'paused' ? 'Paused' : 'Downloading'}: ${gb(st.received)} of ${gb(st.total || m.bytes)} GB (${pct}%)`}</Text>
          {st.phase === 'downloading'
            ? <OutlineButton title="Pause" icon="pause" onPress={() => { pauseDownload(m); }} />
            : <GradientButton title="Resume" onPress={() => { startDownload(m); }} />}
          <OutlineButton title={st.phase === 'paused' ? 'Delete partial download' : 'Cancel download'} icon="close" onPress={() => { cancelDownload(m); }} />
        </View>
      ) : null}

      {st.phase === 'ready' ? (
        <View style={{ gap: 10 }}>
          <View style={s.ready}>
            <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
            <Text style={s.readyText}>Ready on this phone</Text>
          </View>
          <OutlineButton title="Delete model" icon="trash-outline" onPress={remove} />
        </View>
      ) : null}

      {st.error ? <Text style={s.err}>{st.error}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  box: { gap: 10, padding: 14, borderRadius: radius.card, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  hint: { color: colors.sub, fontSize: 13, lineHeight: 19 },
  warn: { color: '#F2B84B', fontSize: 13, lineHeight: 19 },
  err: { color: colors.accent, fontSize: 13, lineHeight: 19 },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: colors.accent },
  ready: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  readyText: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
