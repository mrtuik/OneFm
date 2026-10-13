import React, { ReactNode, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, GradientButton, OutlineButton } from '../components/Ui';
import { Sheet } from '../components/Sheet';
import { CardsIcon } from '../components/Icons';
import { UserAvatar } from '../components/UserAvatar';
import { colors, radius, space } from '../theme';
import { GENDER_LABEL, Gender, LANGS, LANG_LABEL, Lang } from '../types';
import { TextSize, useSettings } from '../state/settings';
import { logout, useAuthUser } from '../firebase/auth';
import { seedStories } from '../firebase/db';
import { PRESETS, Preset, ProviderSettings, testConnection } from '../ai/provider';
import { getApiKey, setApiKey } from '../ai/secure';
import { VoiceInfo, downloadVoice, getVoiceError, subscribeVoiceError, warmVoice, removeVoice, resolveVoice, speak, stopSpeaking, subscribePlaying, voicesFor } from '../voice/engine';
import { useVoiceStatus } from '../voice/useVoice';
import { fetchUser, isAdmin, saveMyGender } from '../firebase/community';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

const SAMPLE: Record<Lang, string> = {
  en: 'Hello, this is how your story will sound.',
  bn: 'নমস্কার, আমি আপনার গল্প পড়ে শোনাব। চলুন, এবার শুরু করা যাক।',
  hi: 'नमस्ते, मैं आपकी कहानी पढ़कर सुनाऊँगा। चलिए, अब शुरू करते हैं।',
};
const PRESET_LABEL: Record<Preset, string> = { groq: 'Groq', openrouter: 'OpenRouter', custom: 'Custom' };
const SIZE_LABEL: Record<TextSize, string> = { small: 'Small', medium: 'Medium', large: 'Large' };

type Panel = 'brain' | 'voice' | 'lang' | 'size' | 'gender' | null;
type IconName = React.ComponentProps<typeof Ionicons>['name'];

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.groupTitle}>{title}</Text>
      <View style={s.group}>{children}</View>
    </View>
  );
}

/** One settings row: icon, label, optional value, chevron. A thin divider sits above every row except the first. */
function Row({ icon, node, label, value, onPress, first, danger, hot }: { icon?: IconName; node?: ReactNode; label: string; value?: string; onPress: () => void; first?: boolean; danger?: boolean; hot?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.rowItem, !first && s.rowDivider, pressed && { backgroundColor: '#1F1A1A' }]} accessibilityRole="button">
      {node ?? (icon ? <Ionicons name={icon} size={22} color={danger ? colors.accent : colors.text} /> : null)}
      <Text style={[s.rowLabel, danger && { color: colors.accent }]} numberOfLines={1}>{label}</Text>
      {value ? <Text style={[s.rowValue, hot && { color: colors.accent, fontWeight: '700' }]} numberOfLines={1}>{value}</Text> : null}
      {danger ? null : <Ionicons name="chevron-forward" size={18} color={colors.sub} />}
    </Pressable>
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
  const [preparing, setPreparing] = useState(false);
  useEffect(() => subscribePlaying((p) => { setPlaying(p.id === 'preview:' + v.id && !p.loading); setPreparing(p.id === 'preview:' + v.id && p.loading); }), [v.id]);
  useEffect(() => { if (chosen && st.state === 'ready') warmVoice(lang, v.id); }, [chosen, st.state, lang, v.id]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { const f = () => { setErr(getVoiceError('preview:' + v.id)); }; f(); return subscribeVoiceError(f); }, [v.id]);
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
            {st.state === 'downloading' ? `${st.phase ?? 'Downloading'} ${st.percent}%` : ready ? (err ?? (preparing ? 'Getting the voice ready...' : 'Ready, works offline')) : st.error ? st.error : `${v.sizeMB} MB download`}
          </Text>
        </View>
      </Pressable>
      {st.state === 'downloading' ? <ActivityIndicator color={colors.accent} /> : ready ? (
        <View style={s.voiceActions}>
          <Pressable hitSlop={8} onPress={() => (playing || preparing ? stopSpeaking() : speak('preview:' + v.id, SAMPLE[lang], lang, v.id))} accessibilityLabel="Preview voice">
            {preparing ? <ActivityIndicator color={colors.text} style={{ width: 28, height: 28 }} /> : <Ionicons name={playing ? 'stop-circle-outline' : 'play-circle-outline'} size={28} color={colors.text} />}
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
  const nav = useNavigation<any>();
  const [admin, setAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [username, setUsername] = useState<string | undefined>();
  const lang = st.language ?? 'bn';

  const [prov, setProv] = useState<ProviderSettings>(st.provider);
  const [key, setKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => { getApiKey().then((k) => { setKey(k); setHasKey(!!k); }); }, []);
  useEffect(() => { isAdmin(user?.uid).then(setAdmin); }, [user?.uid]);
  useEffect(() => { if (user) fetchUser(user.uid).then((u) => setUsername(u.username)); else setUsername(undefined); }, [user?.uid]);
  useFocusEffect(useCallback(() => { if (user) fetchUser(user.uid).then((u) => setUsername(u.username)); }, [user?.uid]));
  useEffect(() => () => stopSpeaking(), [lang]);

  const name = user ? user.displayName ?? user.email ?? 'Reader' : 'Guest';
  const sub = user ? (username ? `@${username}` : user.email) : 'Sign in to like, save and post.';

  const pickPreset = (p: Preset) => setProv(p === 'custom' ? { ...prov, preset: 'custom' } : { ...PRESETS[p] });
  const edit = (patch: Partial<ProviderSettings>) => setProv({ ...prov, ...patch, preset: 'custom' });

  const saveProvider = async () => {
    update({ provider: prov });
    await setApiKey(key);
    setHasKey(!!key.trim());
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
  const voiceName = resolveVoice(lang, st.voices[lang]).name;
  const closePanel = () => { stopSpeaking(); setPanel(null); };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: space.screen, gap: space.section - 4, paddingBottom: insets.bottom + space.section }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={user ? () => nav.navigate('UserProfile', { uid: user.uid }) : undefined}
          disabled={!user}
          style={({ pressed }) => [s.card, pressed && { backgroundColor: '#1F1A1A' }]}
          accessibilityRole="button"
          accessibilityLabel="Open my profile"
        >
          <UserAvatar user={user} size={60} active />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.name} numberOfLines={1}>{name}</Text>
            {sub ? <Text style={s.sub} numberOfLines={1}>{sub}</Text> : null}
          </View>
          {user ? <Ionicons name="chevron-forward" size={18} color={colors.sub} /> : null}
        </Pressable>

        <Group title="Account">
          <Row first icon="male-female-outline" label="I am" value={st.gender ? GENDER_LABEL[st.gender] : 'Not set'} hot={!st.gender} onPress={() => setPanel('gender')} />
        </Group>

        <Group title="Story setup">
          <Row first node={<CardsIcon size={22} color={colors.text} />} label="AI brain" value={hasKey ? PRESET_LABEL[st.provider.preset] : 'Set your brain setup'} hot={!hasKey} onPress={() => setPanel('brain')} />
          <Row icon="mic-outline" label="Voice" value={voiceName} onPress={() => setPanel('voice')} />
        </Group>

        <Group title="General">
          <Row first icon="language-outline" label="Reading language" value={LANG_LABEL[lang]} onPress={() => setPanel('lang')} />
          <Row icon="text-outline" label="Text size" value={SIZE_LABEL[st.textSize]} onPress={() => setPanel('size')} />
        </Group>

        {admin ? (
          <Group title="Developer">
            <Row first icon="library-outline" label="Story brain (novels and lessons)" onPress={() => nav.navigate('Brain')} />
            <Row icon="cloud-upload-outline" label={busy ? 'Seeding...' : 'Seed sample stories'} onPress={seed} />
          </Group>
        ) : null}

        <View style={s.group}>
          {user ? (
            <Row first danger icon="log-out-outline" label="Log out" onPress={async () => { await logout(); update({ guest: false }); }} />
          ) : (
            <Row first icon="log-in-outline" label="Sign in" onPress={() => update({ guest: false })} />
          )}
        </View>
      </ScrollView>

      <Sheet form visible={panel === 'brain'} onClose={closePanel} title="AI brain">
        <View style={{ gap: 12 }}>
          <Text style={s.hint}>Your key stays on this phone in secure storage. It is never sent to Firebase.</Text>
          <View style={s.chipRow}>
            {(['groq', 'openrouter', 'custom'] as Preset[]).map((p) => <Chip key={p} label={PRESET_LABEL[p]} active={prov.preset === p} onPress={() => pickPreset(p)} />)}
          </View>
          <Field label="API key" value={key} onChangeText={setKey} secureTextEntry placeholder="Paste your API key" />
          <Field label="Base URL" value={prov.baseUrl} onChangeText={(v) => edit({ baseUrl: v })} keyboardType="url" />
          <Field label="Chat model" value={prov.model} onChangeText={(v) => edit({ model: v })} />
          <Field label="Summary model (cheaper)" value={prov.summaryModel} onChangeText={(v) => edit({ summaryModel: v })} />
          <View style={{ gap: 8, marginTop: 4 }}>
            <GradientButton title="Save" onPress={async () => { await saveProvider(); setPanel(null); }} />
            <OutlineButton title={testing ? 'Testing...' : 'Save and test connection'} onPress={test} />
          </View>
        </View>
      </Sheet>

      <Sheet form visible={panel === 'voice'} onClose={closePanel} title="Voice">
        <View style={{ gap: 12 }}>
          <Text style={s.hint}>{`${LANG_LABEL[lang]} voices run on this phone with sherpa-onnx. Download one once, then it works offline.`}</Text>
          <View style={{ gap: 8 }}>
            {voicesFor(lang).map((v) => (
              <VoiceRow key={v.id} v={v} lang={lang} chosen={chosen === v.id} onUse={() => update({ voices: { ...st.voices, [lang]: v.id } })} />
            ))}
          </View>
          <View style={s.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.switchTitle}>Auto-play voice</Text>
              <Text style={s.hint}>Play each reply as soon as it arrives.</Text>
            </View>
            <Switch value={st.autoPlay} onValueChange={(v) => update({ autoPlay: v })} trackColor={{ true: colors.accent, false: colors.line }} thumbColor={colors.text} />
          </View>
        </View>
      </Sheet>

      <Sheet form visible={panel === 'lang'} onClose={closePanel} title="Reading language">
        <Text style={[s.hint, { marginBottom: 12 }]}>Stories are shown in this language.</Text>
        <View style={s.chipRow}>
          {LANGS.map((l) => <Chip key={l} label={LANG_LABEL[l]} active={l === lang} onPress={() => { update({ language: l }); setPanel(null); }} />)}
        </View>
      </Sheet>

      <Sheet form visible={panel === 'size'} onClose={closePanel} title="Text size">
        <View style={s.chipRow}>
          {(['small', 'medium', 'large'] as TextSize[]).map((z) => <Chip key={z} label={SIZE_LABEL[z]} active={st.textSize === z} onPress={() => { update({ textSize: z }); setPanel(null); }} />)}
        </View>
      </Sheet>

      <Sheet form visible={panel === 'gender'} onClose={closePanel} title="I am">
        <Text style={[s.hint, { marginBottom: 12 }]}>You play roles that match you. A male reader plays male roles, a female reader plays female roles.</Text>
        <View style={s.chipRow}>
          {(['male', 'female'] as Gender[]).map((g) => <Chip key={g} label={GENDER_LABEL[g]} active={st.gender === g} onPress={() => { update({ gender: g }); saveMyGender(g); setPanel(null); }} />)}
        </View>
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: space.card, borderRadius: radius.card, backgroundColor: colors.surface },
  name: { color: colors.text, fontSize: 18, fontWeight: '800' },
  sub: { color: colors.sub, fontSize: 13 },
  groupTitle: { color: colors.sub, fontSize: 14, fontWeight: '600', paddingHorizontal: 4 },
  group: { borderRadius: radius.card, backgroundColor: colors.surface, overflow: 'hidden' },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 54, paddingHorizontal: space.card },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  rowLabel: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '600' },
  rowValue: { color: colors.sub, fontSize: 15, maxWidth: '45%' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { color: colors.sub, fontSize: 13, lineHeight: 18 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.gap, marginTop: 4 },
  switchTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  fieldLabel: { color: colors.sub, fontSize: 13, fontWeight: '600' },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: space.gap, padding: 12, borderRadius: radius.btn, backgroundColor: colors.surface },
  voiceMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  voiceName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  voiceActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  dl: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.chip, backgroundColor: colors.accentSoft },
  dlText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  input: { height: 46, borderRadius: radius.btn, backgroundColor: colors.surface, paddingHorizontal: 14, color: colors.text, fontSize: 15 },
});
