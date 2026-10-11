import React from 'react';
import { ScrollView, Text } from 'react-native';

// Release builds have no red screen. If anything throws at startup (including a
// missing native module at import time), show the error text instead of closing.
let Main: React.ComponentType | null = null;
let loadError: unknown = null;
try {
  // @ts-ignore: require is provided by Metro
  Main = require('./src/Main').default;
} catch (e) {
  loadError = e;
}

function ErrorScreen({ error }: { error: unknown }) {
  const msg = error instanceof Error ? `${error.name}: ${error.message}\n\n${error.stack ?? ''}` : String(error);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0B0B10' }} contentContainerStyle={{ padding: 24, paddingTop: 64 }}>
      <Text style={{ color: '#FF5D7A', fontSize: 20, fontWeight: '800', marginBottom: 12 }}>One Fm hit an error</Text>
      <Text style={{ color: '#9A9AA6', fontSize: 13, marginBottom: 16 }}>Screenshot this screen and send it.</Text>
      <Text selectable style={{ color: '#F2F2F7', fontSize: 12, fontFamily: 'monospace' }}>{msg}</Text>
    </ScrollView>
  );
}

class Boundary extends React.Component<{ children: React.ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    return this.state.error != null ? <ErrorScreen error={this.state.error} /> : this.props.children;
  }
}

export default function App() {
  if (loadError != null || !Main) return <ErrorScreen error={loadError ?? 'Main failed to load'} />;
  const M = Main;
  return (
    <Boundary>
      <M />
    </Boundary>
  );
}
