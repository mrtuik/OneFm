import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RichText } from '../components/RichText';
import { TypingDots } from '../components/TypingDots';
import { VoiceChip } from '../components/VoiceChip';
import { GradientButton } from '../components/Ui';
import { colors, radius, space } from '../theme';
import { ChatMessage, ChatState, Story } from '../types';
import { useSettings } from '../state/settings';
import { getApiKey } from '../ai/secure';
import { deleteChat, loadChat, newChat, saveChat } from '../chat/store';
import { TurnOptions, takeTurn } from '../chat/engine';
import { hasVoice, speak, stopSpeaking } from '../voice/engine';
import { incrementPlay } from '../firebase/db';

const FONT = { small: 14, medium: 16, large: 18 } as const;

export default function Chat() {
  const { story } = useRoute<any>().params as { story: Story };
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { s } = useSettings();

  const [chat, setChat] = useState<ChatState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const chatRef = useRef<ChatState | null>(null);
  const busyRef = useRef(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const font = FONT[s.textSize];
  const voiceId = s.voices[story.language];

  const setBoth = (c: ChatState) => { chatRef.current = c; setChat(c); };

  useEffect(() => {
    loadChat(story.id).then((c) => { setBoth(c ?? newChat(story)); setLoaded(true); });
    return () => stopSpeaking();
  }, [story.id]);

  useFocusEffect(useCallback(() => { getApiKey().then((k) => setHasKey(!!k)); }, []));

  const run = useCallback(async (opts: TurnOptions) => {
    if (!chatRef.current || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const startedAt = Date.now();
    try {
      const key = await getApiKey();
      const final = await takeTurn(story, chatRef.current, opts, s.provider, key, setBoth);
      const ai = [...final.messages].reverse().find((m) => m.role === 'ai' && m.createdAt >= startedAt);
      if (ai?.speech && s.autoPlay && (await hasVoice(story.language))) speak(ai.id, ai.speech, story.language, voiceId);
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [story, s.provider, s.autoPlay, voiceId]);

  // A new chat opens the first episode by itself.
  const empty = loaded && !!chat && chat.messages.length === 0;
  useEffect(() => {
    if (empty && hasKey) { incrementPlay(story.id); run({ begin: true }); }
  }, [empty, hasKey]);

  const last = chat?.messages[chat.messages.length - 1];
  const waitingNext = last?.role === 'episode_end';
  const canType = !!hasKey && !busy && !waitingNext && !empty;

  const send = (t: string) => {
    const text = t.trim();
    if (!text || !canType) return;
    stopSpeaking();
    setInput('');
    run({ userText: text });
  };

  const startNext = () => {
    const c = chatRef.current;
    if (!c) return;
    const l = c.messages[c.messages.length - 1];
    if (l && c.ep === l.ep) setBoth({ ...c, ep: c.ep + 1, epCount: 0 });
    run({ begin: true });
  };

  const retry = () => {
    const c = chatRef.current;
    if (!c) return;
    if (c.messages.length === 0) run({ begin: true });
    else run({});
  };

  const cycleCharacter = () => {
    const c = chatRef.current;
    if (!c || story.characters.length < 2) return;
    const i = story.characters.findIndex((x) => x.name === c.character);
    const next = story.characters[(i + 1) % story.characters.length].name;
    const n = { ...c, character: next };
    setBoth(n);
    saveChat(n);
  };

  const removeMessage = (m: ChatMessage) => {
    const c = chatRef.current;
    if (!c) return;
    const n = { ...c, messages: c.messages.filter((x) => x.id !== m.id) };
    setBoth(n);
    saveChat(n);
  };

  const onLongPress = (m: ChatMessage) => {
    const isLast = chat?.messages[chat.messages.length - 1]?.id === m.id;
    const buttons: { text: string; onPress: () => void; style?: 'destructive' }[] = [
      { text: 'Copy', onPress: () => Clipboard.setStringAsync(m.text) },
    ];
    if (m.role === 'ai' && isLast && !busy) buttons.push({ text: 'Regenerate', onPress: () => run({ regenerate: true }) });
    buttons.push({ text: 'Delete', style: 'destructive', onPress: () => removeMessage(m) });
    Alert.alert('Message', undefined, buttons, { cancelable: true });
  };

  const options = () => {
    Alert.alert('Chat options', undefined, [
      { text: 'Stop voice', onPress: () => stopSpeaking() },
      {
        text: 'Restart story', style: 'destructive',
        onPress: () => Alert.alert('Restart this story?', 'Your messages and the story memory will be deleted from this phone.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Restart', style: 'destructive', onPress: async () => { stopSpeaking(); await deleteChat(story.id); setBoth(newChat(story)); } },
        ]),
      },
    ], { cancelable: true });
  };

  const renderItem = ({ item }: { item: ChatMessage }) => {
    if (item.role === 'user') {
      return (
        <Pressable onLongPress={() => onLongPress(item)} style={s2.userCard}>
          <Text style={[s2.userText, { fontSize: font, lineHeight: font * 1.45 }]}>{item.text}</Text>
        </Pressable>
      );
    }
    if (item.role === 'episode_end') {
      return (
        <View style={s2.endCard}>
          <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={s2.endTitle}>{item.text}</Text>
            <Text style={s2.endSub}>Story memory updated.</Text>
          </View>
        </View>
      );
    }
    return (
      <Pressable onLongPress={() => onLongPress(item)} style={s2.ai}>
        <Text style={s2.speaker}>{item.speaker ?? 'Narrator'}</Text>
        <RichText text={item.text} style={{ color: colors.text, fontSize: font, lineHeight: font * 1.5 }} />
        {item.speech ? <View style={{ marginTop: 12 }}><VoiceChip id={item.id} text={item.speech} lang={story.language} voiceId={voiceId} /></View> : null}
      </Pressable>
    );
  };

  const choices = !busy && last?.role === 'ai' ? last.choices ?? [] : [];
  const initial = (chat?.character ?? story.characters[0]?.name ?? '?').charAt(0).toUpperCase();

  return (
    <View style={[s2.root, { paddingTop: insets.top }]}>
      <View style={s2.header}>
        <View style={s2.headLeft}>
          <Pressable onPress={() => nav.goBack()} hitSlop={10} style={s2.iconBtn} accessibilityLabel="Back"><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
          <Pressable onPress={options} hitSlop={10} style={s2.iconBtn} accessibilityLabel="Chat options"><Ionicons name="ellipsis-vertical" size={20} color={colors.text} /></Pressable>
        </View>
        <Text style={s2.title} numberOfLines={1}>{story.title}</Text>
        <View style={s2.headRight}><View style={s2.epPill}><Text style={s2.epText}>Ep: {chat?.ep ?? 1}</Text></View></View>
      </View>

      <FlatList
        ref={listRef}
        style={{ flex: 1 }}
        data={chat?.messages ?? []}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: space.screen, gap: space.section, flexGrow: 1 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListFooterComponent={
          <View>
            {busy ? <TypingDots /> : null}
            {hasKey === false ? (
              <View style={s2.setup}>
                <Text style={s2.setupTitle}>Connect your AI provider</Text>
                <Text style={s2.setupBody}>Stories are written by an AI model through your own key. Add a Groq or OpenRouter key in Profile to start.</Text>
                <GradientButton title="Open Profile" onPress={() => nav.navigate('Profile')} />
              </View>
            ) : null}
          </View>
        }
      />

      {error ? (
        <View style={s2.errorBar}>
          <Text style={s2.errorText} numberOfLines={3}>{error}</Text>
          <Pressable onPress={retry} hitSlop={8}><Text style={s2.retry}>Retry</Text></Pressable>
        </View>
      ) : null}

      {waitingNext && !busy ? (
        <View style={{ padding: space.screen }}>
          <GradientButton title={`Start Episode ${(last?.ep ?? 0) + 1}`} onPress={startNext} />
        </View>
      ) : (
        <View style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
          {choices.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.screen, gap: 8, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
              {choices.map((c) => (
                <Pressable key={c} onPress={() => send(c)} style={s2.choice}><Text style={s2.choiceText} numberOfLines={2}>{c}</Text></Pressable>
              ))}
            </ScrollView>
          ) : null}
          <View style={s2.inputRow}>
            <Pressable onPress={cycleCharacter} style={s2.charChip} accessibilityLabel="Switch character">
              <Text style={s2.charInitial}>{initial}</Text>
            </Pressable>
            <TextInput
              style={s2.input}
              placeholder={chat?.character ? `Say something to ${chat.character}` : 'Type your message'}
              placeholderTextColor={colors.sub}
              value={input}
              onChangeText={setInput}
              editable={canType}
              multiline
              maxLength={600}
            />
            <Pressable onPress={() => send(input)} disabled={!canType || !input.trim()} style={[s2.send, (!canType || !input.trim()) && { opacity: 0.35 }]} accessibilityLabel="Send">
              <Ionicons name="arrow-up" size={20} color={colors.onAccent} />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const s2 = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  headLeft: { flexDirection: 'row', width: 92 },
  headRight: { width: 92, alignItems: 'flex-end', paddingRight: 8 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 17, fontWeight: '700' },
  epPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.chip, borderWidth: 1.5, borderColor: colors.line },
  epText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  ai: { gap: 6 },
  speaker: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  userCard: { borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.card, padding: space.card },
  userText: { color: colors.text },
  endCard: { flexDirection: 'row', alignItems: 'center', gap: space.gap, padding: space.card, borderRadius: radius.card, backgroundColor: colors.surface },
  endTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  endSub: { color: colors.sub, fontSize: 13, marginTop: 2 },
  setup: { gap: space.gap, padding: space.card, borderRadius: radius.card, backgroundColor: colors.surface },
  setupTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  setupBody: { color: colors.sub, fontSize: 14, lineHeight: 20 },
  errorBar: { flexDirection: 'row', alignItems: 'center', gap: space.gap, marginHorizontal: space.screen, marginBottom: 8, padding: 12, borderRadius: radius.card, backgroundColor: colors.accentSoft },
  errorText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18 },
  retry: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  choice: { maxWidth: 260, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.chip, borderWidth: 1.5, borderColor: colors.accent },
  choiceText: { color: colors.text, fontSize: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: space.screen, paddingTop: 8 },
  charChip: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  charInitial: { color: colors.text, fontSize: 16, fontWeight: '800' },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: radius.btn, borderWidth: 1.5, borderColor: colors.line, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 11, color: colors.text, fontSize: 16 },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
