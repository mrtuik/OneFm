import React from 'react';
import { Empty, Screen } from '../components/Ui';

export const Community = () => (
  <Screen><Empty icon="people-outline" title="Community" body="Story posts, likes, saves and comments are coming soon." /></Screen>
);
export const Library = () => (
  <Screen><Empty icon="library-outline" title="Library" body="Saved stories, history and downloads are coming soon." /></Screen>
);
