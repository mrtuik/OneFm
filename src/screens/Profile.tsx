import React, { ReactNode, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, GradientButton, OutlineButton } from '../components/Ui';
import { UserAvatar } from '../components/UserAvatar';
import { colors, radius, space } from '../theme';
import { LANGS, LANG_LABEL, VOICES } from '../types';
import { useSettings } from '../state/settings';
import { logout, useAuthUser } from '../firebase/auth';
import { seedStories } from '../firebase/db';

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={s.card}>
      <View style={{ gap: 2 }}>
        <Text style={s.cardTitle}>{title}</Text>
        {hint ? <Text style={s.hint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export default function Profile() {
  const { s: st, update } = useSettings();
  const { user } = useAuthUser();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const lang = st.language ?? 'bn';

  const name = user ? user.displayName ?? user.email ?? 'Reader' : 'Guest';
  const sub = user ? (user.displayName ? user.email : null) : 'Sign in to like, save and post.';

  const seed = async () => {
    setBusy(true);
    try { await seedStories(); Alert.alert('Done', '10 sample stories were written to the Realtime Database.'); }
    catch (e: any) { Alert.alert('Seeding failed', String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: space.screen, gap: space.gap, paddingBottom: insets.bottom + space.section }}
    >
      <View style={s.identity}>
        <UserAvatar user={user} size={88} active />
        <Text style={s.name}>{name}</Text>
        {sub ? <Text style={s.sub}>{sub}</Text> : null}
      </View>

      <Section title="Reading language" hint="Stories are shown in this language.">
        <View style={s.row}>
          {LANGS.map((l) => <Chip key={l} label={LANG_LABEL[l]} active={l === lang} onPress={() => update({ language: l, voice: VOICES[l][0] })} />)}
        </View>
      </Section>

      <Section title="Voice" hint="The narrator voice for your stories.">
        <View style={s.row}>
          {VOICES[lang].map((v) => <Chip key={v} label={v} active={st.voice === v} onPress={() => update({ voice: v })} />)}
        </View>
      </Section>

      <Section title="Developer">
        <OutlineButton title={busy ? 'Seeding...' : 'Seed sample stories to database'} onPress={seed} />
      </Section>

      <View style={{ marginTop: space.gap }}>
        {user ? (
          <OutlineButton title="Log out" onPress={async () => { await logout(); update({ guest: false }); }} />
        ) : (
          <GradientButton title="Sign in" onPress={() => update({ guest: false })} />
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  identity: { alignItems: 'center', gap: 6, paddingVertical: space.section },
  name: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 8 },
  sub: { color: colors.sub, fontSize: 14 },
  card: { padding: space.card, borderRadius: radius.card, backgroundColor: colors.surface, gap: space.gap },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  hint: { color: colors.sub, fontSize: 13 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
