import { getFileAudioBuffer as getMP3FileAudioBuffer } from '@soundcut/decode-audio-data-fast';

import { getFileArrayBuffer } from './getFileArrayBuffer';

// Use a promise wrapper on top of event based syntax
// for browsers (Safari) which do not support promise-based syntax.
function decodeAudioData(audioCtx, arrayBuffer) {
  return new Promise(audioCtx.decodeAudioData.bind(audioCtx, arrayBuffer));
}

export function getFileAudioBuffer(file, audioCtx, opts) {
  const safari = !!window.webkitAudioContext;
  const options = opts || {};

  const slow = options.slow || safari;

  if (slow) {
    return getFileArrayBuffer(file).then((arrayBuffer) => {
      return decodeAudioData(audioCtx, arrayBuffer);
    });
  }

  return getMP3FileAudioBuffer(file, audioCtx).catch((err) => {
    // Unable to decode audio data fast.
    // Either because:
    // - the file is not MP3
    // - the browser does not support.. something?
    // Fallback to regular AudioBuffer.decodeAudioData()
    console.error(err);
    return getFileArrayBuffer(file, audioCtx, { slow: true });
  });
}
