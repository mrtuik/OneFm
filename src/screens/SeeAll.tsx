import React from 'react';
import { FlatList } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StoryCard } from '../components/StoryCard';
import { colors, space } from '../theme';
import { Story } from '../types';

/** Every story of a Home section, one under the other. */
export default function SeeAll() {
  const { stories } = useRoute<any>().params as { title: string; stories: Story[] };
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: space.screen, gap: space.gap, paddingBottom: insets.bottom + space.section }}
      data={stories}
      keyExtractor={(i) => i.id}
      renderItem={({ item }) => <StoryCard story={item} variant="row" onPress={() => nav.navigate('StoryDetail', { story: item })} />}
    />
  );
}
