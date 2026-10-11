import React from 'react';
import { Empty, Screen } from '../components/Ui';

export const Chats = () => (
  <Screen><Empty icon="chatbubbles-outline" title="No chats yet" body="Start a story and your chats will show up here. Chat is coming in M2." /></Screen>
);
export const Community = () => (
  <Screen><Empty icon="people-outline" title="Community" body="Story posts, likes, saves and comments are coming in M5." /></Screen>
);
export const Library = () => (
  <Screen><Empty icon="library-outline" title="Library" body="Saved, History and Downloads are coming in M6." /></Screen>
);
