import React, { ReactNode, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, GradientButton, OutlineButton } from '../components/Ui';
import { UserAvatar } from '../components/UserAvatar';
import { colors, radius, space } from '../theme';
import { LANGS, LANG_LABEL, Lang } from '../types';
import { TextSize, useSettings } from '../state/settings';
import { logout, useAuthUser } from '../firebase/auth';
import { seedStories } from '../firebase/db';
import { PRESETS, Preset, ProviderSettings, testConnection } from '../ai/provider';
import { getApiKey, setApiKey } from '../ai/secure';
import { VoiceInfo, listVoices, openVoiceSettings, speak, stopSpeaking } from '../voice/engine';

const SAMPLE: Record<Lang, string> = {
  en: 'Hello, this is how your story will sound.',
  bn: 'আপনার গল্প এভাবেই শোনাবে।',
  hi: 'आपकी कहानी ऐसे सुनाई देगी।',
};
const PRESET_LABEL: Record<Preset, string> = { groq: 'Groq', openrouter: 'OpenRouter', custom: 'Custom' };
const SIZE_LABEL: Record<TextSize, string> = { small: 'Small', medium: 'Medium', large: 'Large' };

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

function Field({ label, ...p }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput style={s.input} placeholderTextColor={colors.sub} autoCapitalize="none" autoCorrect={false} {...p} />
    </View>
  );
}

export default function Profile() {
  const { s: st, update } = useSettings();
  const { user } = useAuthUser();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const lang = st.language ?? 'bn';

  const [prov, setProv] = useState<ProviderSettings>(st.provider);
  const [key, setKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [voices, setVoices] = useState<VoiceInfo[] | null>(null);

  useEffect(() => { getApiKey().then(setKey); }, []);
  useEffect(() => { setVoices(null); listVoices(lang).then(setVoices); return () => stopSpeaking(); }, [lang]);

  const name = user ? user.displayName ?? user.email ?? 'Reader' : 'Guest';
  const sub = user ? (user.displayName ? user.email : null) : 'Sign in to like, save and post.';

  const pickPreset = (p: Preset) => setProv(p === 'custom' ? { ...prov, preset: 'custom' } : { ...PRESETS[p] });
  const edit = (patch: Partial<ProviderSettings>) => setProv({ ...prov, ...patch, preset: 'custom' });

  const saveProvider = async () => {
    update({ provider: prov });
    await setApiKey(key);
  };
  const test = async () => {
    setTesting(true);
    try {
      await saveProvider();
      const out = await testConnection(prov, key.trim());
      Alert.alert('Connected', `The provider answered: ${out}`);
    } catch (e: any) {
      Alert.alert('Connection failed', String(e?.message ?? e));
    } finally { setTesting(false); }
  };

  const seed = async () => {
    setBusy(true);
    try { await seedStories(); Alert.alert('Done', '10 sample stories were written to the Realtime Database.'); }
    catch (e: any) { Alert.alert('Seeding failed', String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  const chosen = st.voices[lang];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: space.screen, gap: space.gap, paddingBottom: insets.bottom + space.section }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.identity}>
        <UserAvatar user={user} size={88} active />
        <Text style={s.name}>{name}</Text>
        {sub ? <Text style={s.sub}>{sub}</Text> : null}
      </View>

      <Section title="Reading language" hint="Stories are shown in this language.">
        <View style={s.row}>
          {LANGS.map((l) => <Chip key={l} label={LANG_LABEL[l]} active={l === lang} onPress={() => update({ language: l })} />)}
        </View>
      </Section>

      <Section title="Voice" hint={`Voices installed on this phone for ${LANG_LABEL[lang]}.`}>
        {voices === null ? <Text style={s.hint}>Looking for voices...</Text> : (
          <>
            <View style={s.row}>
              <Chip label="Device default" active={!chosen} onPress={() => update({ voices: { ...st.voices, [lang]: undefined } })} />
              {voices.map((v) => <Chip key={v.id} label={v.name} active={chosen === v.id} onPress={() => update({ voices: { ...st.voices, [lang]: v.id } })} />)}
            </View>
            {voices.length === 0 && lang !== 'en' ? (
              <Text style={s.hint}>No {LANG_LABEL[lang]} voice is installed. Install one in your phone's text-to-speech settings, then come back.</Text>
            ) : null}
            <View style={{ gap: 8 }}>
              {(voices.length > 0 || lang === 'en') ? <OutlineButton icon="volume-high-outline" title="Preview voice" onPress={() => speak('preview', SAMPLE[lang], lang, chosen)} /> : null}
              {lang !== 'en' && voices.length === 0 ? <OutlineButton icon="download-outline" title="Open voice settings" onPress={openVoiceSettings} /> : null}
            </View>
          </>
        )}
        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>Auto-play voice</Text>
            <Text style={s.hint}>Play each reply as soon as it arrives.</Text>
          </View>
          <Switch value={st.autoPlay} onValueChange={(v) => update({ autoPlay: v })} trackColor={{ true: colors.accent, false: colors.line }} thumbColor={colors.text} />
        </View>
      </Section>

      <Section title="AI provider" hint="Your key stays on this phone in secure storage. It is never sent to Firebase.">
        <View style={s.row}>
          {(['groq', 'openrouter', 'custom'] as Preset[]).map((p) => <Chip key={p} label={PRESET_LABEL[p]} active={prov.preset === p} onPress={() => pickPreset(p)} />)}
        </View>
        <Field label="Base URL" value={prov.baseUrl} onChangeText={(v) => edit({ baseUrl: v })} keyboardType="url" />
        <Field label="Chat model" value={prov.model} onChangeText={(v) => edit({ model: v })} />
        <Field label="Summary model (cheaper)" value={prov.summaryModel} onChangeText={(v) => edit({ summaryModel: v })} />
        <Field label="API key" value={key} onChangeText={setKey} secureTextEntry placeholder="Paste your API key" />
        <View style={{ gap: 8 }}>
          <GradientButton title="Save provider" onPress={async () => { await saveProvider(); Alert.alert('Saved', 'Your AI provider settings were saved.'); }} />
          <OutlineButton title={testing ? 'Testing...' : 'Test connection'} onPress={test} />
        </View>
      </Section>

      <Section title="Reading">
        <Text style={s.fieldLabel}>Text size</Text>
        <View style={s.row}>
          {(['small', 'medium', 'large'] as TextSize[]).map((z) => <Chip key={z} label={SIZE_LABEL[z]} active={st.textSize === z} onPress={() => update({ textSize: z })} />)}
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
  hint: { color: colors.sub, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.gap, marginTop: 4 },
  fieldLabel: { color: colors.sub, fontSize: 13, fontWeight: '600' },
  input: { height: 46, borderRadius: radius.btn, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, color: colors.text, fontSize: 15 },
});
