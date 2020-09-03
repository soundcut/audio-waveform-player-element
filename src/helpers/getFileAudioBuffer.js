import { getFileAudioBuffer as getMP3FileAudioBuffer } from '@soundcut/decode-audio-data-fast';

import { getFileArrayBuffer } from './getFileArrayBuffer';

export function getFileAudioBuffer(file, audioCtx, opts) {
  return getMP3FileAudioBuffer(file, audioCtx, opts).catch((err) => {
    // Unable to decode audio data fast.
    // Either because:
    // - the file is not MP3
    // - the browser does not support.. something?
    // Fallback to regular AudioBuffer.decodeAudioData()
    console.error(err);
    return getFileArrayBuffer(file, audioCtx, { slow: true });
  });
}
