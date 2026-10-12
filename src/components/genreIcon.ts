import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

export const GENRE_ICON: Record<string, ComponentProps<typeof Ionicons>['name']> = {
  Romance: 'heart', Thriller: 'eye', Horror: 'skull', Fantasy: 'sparkles', Campus: 'school',
};
