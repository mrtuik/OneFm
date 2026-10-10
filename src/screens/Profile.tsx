import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Chip, GradientButton, OutlineButton } from '../components/Ui';
import { colors } from '../theme';
import { LANGS, LANG_LABEL, VOICES } from '../types';
import { useSettings } from '../state/settings';
import { logout, useAuthUser } from '../firebase/auth';
import { seedStories } from '../firebase/db';

export default function Profile() {
  const { s: st, update } = useSettings();
  const { user } = useAuthUser();
  const [busy, setBusy] = useState(false);
  const lang = st.language ?? 'bn';

  const seed = async () => {
    setBusy(true);
    try { await seedStories(); Alert.alert('Done', '10 ta sample story Realtime Database e likha hoyeche.'); }
    catch (e: any) { Alert.alert('Seed hoy ni', String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 20, gap: 20 }}>
      <View style={s.card}>
        <Text style={s.name}>{user ? user.displayName ?? user.email : 'Guest'}</Text>
        <Text style={s.sub}>{user ? user.email : 'Like, save ar post korte login lagbe.'}</Text>
      </View>

      <View style={{ gap: 10 }}>
        <Text style={s.label}>Reading language</Text>
        <View style={s.row}>
          {LANGS.map((l) => <Chip key={l} label={LANG_LABEL[l]} active={l === lang} onPress={() => update({ language: l, voice: VOICES[l][0] })} />)}
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <Text style={s.label}>Voice (download manager ashbe M4 te)</Text>
        <View style={s.row}>
          {VOICES[lang].map((v) => <Chip key={v} label={v} active={st.voice === v} onPress={() => update({ voice: v })} />)}
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <Text style={s.label}>Developer</Text>
        <OutlineButton title={busy ? 'Seeding...' : 'Seed sample stories to database'} onPress={seed} />
      </View>

      {user ? (
        <OutlineButton title="Log out" onPress={async () => { await logout(); update({ guest: false }); }} />
      ) : (
        <GradientButton title="Sign in" onPress={() => update({ guest: false })} />
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  card: { padding: 18, borderRadius: 20, borderWidth: 1.5, borderColor: colors.line, gap: 4 },
  name: { color: colors.text, fontSize: 20, fontWeight: '800' },
  sub: { color: colors.sub, fontSize: 14 },
  label: { color: colors.sub, fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
