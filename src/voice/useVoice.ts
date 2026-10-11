import { useEffect, useState } from 'react';
import { VoiceStatus, getVoiceStatus, refreshVoiceStatus, subscribeVoiceStatus } from './engine';

/** Live download state of one voice. */
export function useVoiceStatus(id: string): VoiceStatus {
  const [st, setSt] = useState<VoiceStatus>(() => getVoiceStatus(id));
  useEffect(() => {
    setSt(getVoiceStatus(id));
    const off = subscribeVoiceStatus(() => setSt(getVoiceStatus(id)));
    refreshVoiceStatus(id);
    return off;
  }, [id]);
  return st;
}
