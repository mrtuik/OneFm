import React, { ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, GradientButton, OutlineButton } from '../components/Ui';
import { UserAvatar } from '../components/UserAvatar';
import { colors, radius, space } from '../theme';
import { GENDER_LABEL, Gender, LANGS, LANG_LABEL, Lang } from '../types';
import { TextSize, useSettings } from '../state/settings';
import { logout, useAuthUser } from '../firebase/auth';
import { seedStories } from '../firebase/db';
import { PRESETS, Preset, ProviderSettings, testConnection } from '../ai/provider';
import { getApiKey, setApiKey } from '../ai/secure';
import { VoiceInfo, downloadVoice, getVoiceError, subscribeVoiceError, removeVoice, resolveVoice, speak, stopSpeaking, subscribePlaying, voicesFor } from '../voice/engine';
import { useVoiceStatus } from '../voice/useVoice';

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


function VoiceRow({ v, chosen, onUse, lang }: { v: VoiceInfo; chosen: boolean; onUse: () => void; lang: Lang }) {
  const st = useVoiceStatus(v.id);
  const [playing, setPlaying] = useState(false);
  useEffect(() => subscribePlaying((p) => setPlaying(p.id === 'preview:' + v.id)), [v.id]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { const f = () => setErr(getVoiceError('preview:' + v.id)); f(); return subscribeVoiceError(f); }, [v.id]);
  const ready = st.state === 'ready';
  const confirmRemove = () => Alert.alert('Remove this voice?', `${v.name} will be deleted from this phone (${v.sizeMB} MB). You can download it again later.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: () => removeVoice(v.id) },
  ]);
  return (
    <View style={[s.voiceRow, chosen && { backgroundColor: colors.accentSoft }]}>
      <Pressable onPress={ready ? onUse : undefined} style={s.voiceMain} accessibilityRole="radio" accessibilityState={{ selected: chosen }}>
        <Ionicons name={chosen ? 'radio-button-on' : 'radio-button-off'} size={20} color={chosen ? colors.accent : colors.sub} />
        <View style={{ flex: 1 }}>
          <Text style={s.voiceName}>{v.name}</Text>
          <Text style={[s.hint, !!err && ready && { color: colors.accent }]}>
            {st.state === 'downloading' ? `${st.phase ?? 'Downloading'} ${st.percent}%` : ready ? (err ?? 'Ready, works offline') : st.error ? st.error : `${v.sizeMB} MB download`}
          </Text>
        </View>
      </Pressable>
      {st.state === 'downloading' ? <ActivityIndicator color={colors.accent} /> : ready ? (
        <View style={s.voiceActions}>
          <Pressable hitSlop={8} onPress={() => (playing ? stopSpeaking() : speak('preview:' + v.id, SAMPLE[lang], lang, v.id))} accessibilityLabel="Preview voice">
            <Ionicons name={playing ? 'stop-circle-outline' : 'play-circle-outline'} size={28} color={colors.text} />
          </Pressable>
          <Pressable hitSlop={8} onPress={confirmRemove} accessibilityLabel="Remove voice">
            <Ionicons name="trash-outline" size={22} color={colors.sub} />
          </Pressable>
        </View>
      ) : (
        <Pressable hitSlop={8} onPress={async () => { const ok = await downloadVoice(v.id); if (ok && !chosen) onUse(); }} style={s.dl} accessibilityLabel="Download voice">
          <Ionicons name="download-outline" size={18} color={colors.accent} />
          <Text style={s.dlText}>Get</Text>
        </Pressable>
      )}
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

  useEffect(() => { getApiKey().then(setKey); }, []);
  useEffect(() => () => stopSpeaking(), [lang]);

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
    try { await seedStories(); Alert.alert('Done', 'Sample stories were written to the Realtime Database.'); }
    catch (e: any) { Alert.alert('Seeding failed', String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  const chosen = resolveVoice(lang, st.voices[lang]).id;

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

      <Section title="I am" hint="You play roles that match you. A male reader plays male roles, a female reader plays female roles.">
        <View style={s.row}>
          {(['male', 'female'] as Gender[]).map((g) => <Chip key={g} label={GENDER_LABEL[g]} active={st.gender === g} onPress={() => update({ gender: g })} />)}
        </View>
      </Section>

      <Section title="Voice" hint={`${LANG_LABEL[lang]} voices run on this phone with sherpa-onnx. Download one once, then it works offline.`}>
        <View style={{ gap: 8 }}>
          {voicesFor(lang).map((v) => (
            <VoiceRow key={v.id} v={v} lang={lang} chosen={chosen === v.id} onUse={() => update({ voices: { ...st.voices, [lang]: v.id } })} />
          ))}
        </View>
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
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: space.gap, padding: 12, borderRadius: radius.btn, backgroundColor: '#1F1A1A' },
  voiceMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  voiceName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  voiceActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  dl: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.chip, backgroundColor: colors.accentSoft },
  dlText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  input: { height: 46, borderRadius: radius.btn, backgroundColor: colors.bg, paddingHorizontal: 14, color: colors.text, fontSize: 15 },
});
