export const createPlaybackSlice = (set, get) => ({
    isPlaying: false,
    currentTime: 0,
    audioFile: null,
    audioFileName: '',
    bpm: parseFloat(localStorage.getItem('ls_editor_bpm')) || 120,
    volume: parseFloat(localStorage.getItem('ls_editor_volume') ?? 1),

    // Actions
    setIsPlaying: (playing) => set({ isPlaying: typeof playing === 'function' ? playing(get().isPlaying) : playing }),
    setCurrentTime: (time) => set({ currentTime: typeof time === 'function' ? time(get().currentTime) : time }),
    setAudioFile: (file) => set({ audioFile: typeof file === 'function' ? file(get().audioFile) : file }),
    setAudioFileName: (name) => set({ audioFileName: typeof name === 'function' ? name(get().audioFileName) : name }),
    setBpm: (bpm) => {
        const newBpm = typeof bpm === 'function' ? bpm(get().bpm) : bpm;
        localStorage.setItem('ls_editor_bpm', newBpm);
        set({ bpm: newBpm });
    },
    setVolume: (volume) => {
        const newVolume = typeof volume === 'function' ? volume(get().volume) : volume;
        localStorage.setItem('ls_editor_volume', newVolume);
        set({ volume: newVolume });
    },
});
