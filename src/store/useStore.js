import { create } from 'zustand';
import { createProjectSlice } from './projectSlice';
import { createPlaybackSlice } from './playbackSlice';
import { createEditorSlice } from './editorSlice';

// Combine slices
// NOTE: devtools middleware was removed because it serializes the ENTIRE store
// (including massive spectrogram/project data) on every state update via postMessage,
// causing 500ms+ main thread blocks at 60fps playback.
export const useStore = create((...a) => ({
    ...createProjectSlice(...a),
    ...createPlaybackSlice(...a),
    ...createEditorSlice(...a),
}));
