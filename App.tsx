import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

// Release builds have no red screen and a JS crash just closes the app.
// 1) Fatal JS errors are saved to storage, then shown on the next launch.
// 2) Errors at import time or during render are shown immediately.
const KEY = 'onefm.lastCrash';
let Store: any = null;
try {
  // @ts-ignore: require is provided by Metro
  Store = require('@react-native-async-storage/async-storage').default;
} catch {}

const g: any = globalThis;
const prevHandler = g.ErrorUtils?.getGlobalHandler?.();
g.ErrorUtils?.setGlobalHandler?.((err: any, isFatal?: boolean) => {
  try {
    Store?.setItem(KEY, JSON.stringify({ m: String(err?.message ?? err), s: String(err?.stack ?? ''), fatal: !!isFatal, t: Date.now() }));
  } catch {}
  setTimeout(() => prevHandler?.(err, isFatal), 500);
});

let Main: React.ComponentType | null = null;
let loadError: unknown = null;
try {
  // @ts-ignore: require is provided by Metro
  Main = require('./src/Main').default;
} catch (e) {
  loadError = e;
}

function ErrorScreen({ title, text, onContinue }: { title: string; text: string; onContinue?: () => void }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0B0B10' }} contentContainerStyle={{ padding: 24, paddingTop: 64 }}>
      <Text style={{ color: '#FF5D7A', fontSize: 20, fontWeight: '800', marginBottom: 8 }}>{title}</Text>
      <Text style={{ color: '#9A9AA6', fontSize: 13, marginBottom: 16 }}>Screenshot this screen and send it.</Text>
      <Text selectable style={{ color: '#F2F2F7', fontSize: 12, fontFamily: 'monospace' }}>{text}</Text>
      {onContinue ? (
        <Pressable onPress={onContinue} style={{ marginTop: 24, height: 48, borderRadius: 14, backgroundColor: '#FF5D7A', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#16090D', fontWeight: '700' }}>Clear and open app</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const fmt = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}\n\n${e.stack ?? ''}` : String(e));

class Boundary extends React.Component<{ children: React.ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    return this.state.error != null ? <ErrorScreen title="One Fm hit an error" text={fmt(this.state.error)} /> : this.props.children;
  }
}

export default function App() {
  const [crash, setCrash] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!Store) { setCrash(null); return; }
    Store.getItem(KEY)
      .then((raw: string | null) => {
        if (!raw) return setCrash(null);
        const c = JSON.parse(raw);
        setCrash(`${c.fatal ? 'FATAL' : 'non-fatal'} at ${new Date(c.t).toISOString()}\n\n${c.m}\n\n${c.s}`);
      })
      .catch(() => setCrash(null));
  }, []);

  if (loadError != null || !Main) return <ErrorScreen title="One Fm failed to start" text={fmt(loadError ?? 'Main failed to load')} />;
  if (crash === undefined) return <View style={{ flex: 1, backgroundColor: '#0B0B10' }} />;
  if (crash) {
    return <ErrorScreen title="Last time One Fm crashed" text={crash} onContinue={() => { Store?.removeItem(KEY); setCrash(null); }} />;
  }
  const M = Main;
  return (
    <Boundary>
      <M />
    </Boundary>
  );
}
