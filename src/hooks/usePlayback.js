import { useState, useRef, useEffect } from 'react';
import { AudioWaveformManager } from '../utils/AudioWaveformManager';
import { useStore } from '../store/useStore';

export function usePlayback(project, setProject, rendererRef, setBpm, setFitTrigger2D) {
    const isPlaying = useStore(state => state.isPlaying);
    const setIsPlaying = useStore(state => state.setIsPlaying);
    const setCurrentTime = useStore(state => state.setCurrentTime);
    const audioFile = useStore(state => state.audioFile);
    const setAudioFile = useStore(state => state.setAudioFile);
    const audioFileName = useStore(state => state.audioFileName);
    const setAudioFileName = useStore(state => state.setAudioFileName);
    const addConsoleLog = useStore(state => state.addConsoleLog);

    // Keep some minor local states local if they don't need to be global
    // Actually, fpsDisplay and isAnalyzing could be local or store, let's keep them in the Store or here.
    const [fpsDisplay, setFpsDisplay] = useState(0);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const audioRef = useRef(null);
    const audioUrlRef = useRef(null);
    const lastTickRef = useRef(0);
    const isPlayingRef = useRef(false);
    const audioFileRef = useRef(null);
    const projectRef = useRef(project);
    const animateRef = useRef();
    const requestRef = useRef();

    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
    useEffect(() => { audioFileRef.current = audioFile; }, [audioFile]);
    useEffect(() => { projectRef.current = project; }, [project]);

    const lastStoreUpdateRef = useRef(0);

    const animate = () => {
        if (isPlayingRef.current) {
            const currentAudioFile = audioFileRef.current;
            const currentAudio = audioRef.current;
            const now = performance.now();

            if (currentAudioFile && currentAudio && !currentAudio.paused && !currentAudio.seeking) {
                const time = currentAudio.currentTime * 1000;
                window.__lightShowTime = time;
                // Throttle React store updates to ~16fps (60ms) - canvas renderers use window.__lightShowTime directly
                if (now - lastStoreUpdateRef.current > 60) {
                    setCurrentTime(time);
                    lastStoreUpdateRef.current = now;
                }
            } else if (!currentAudioFile) {
                const delta = now - lastTickRef.current;
                lastTickRef.current = now;

                const prev = useStore.getState().currentTime;
                const next = prev + delta;
                if (next >= projectRef.current.duration) {
                    setIsPlaying(false);
                    window.__lightShowTime = projectRef.current.duration;
                    setCurrentTime(projectRef.current.duration);
                } else {
                    window.__lightShowTime = next;
                    // Throttle React store updates to ~16fps
                    if (now - lastStoreUpdateRef.current > 60) {
                        setCurrentTime(next);
                        lastStoreUpdateRef.current = now;
                    }
                }
            }
        }
    };

    useEffect(() => {
        animateRef.current = animate;
    });

    useEffect(() => {
        let frameCount = 0;
        let lastFpsTime = performance.now();
        const loop = () => {
            animateRef.current?.();
            frameCount++;
            const now = performance.now();
            if (now - lastFpsTime >= 1000) {
                setFpsDisplay(Math.round(frameCount * 1000 / (now - lastFpsTime)));
                frameCount = 0;
                lastFpsTime = now;
            }
            requestRef.current = requestAnimationFrame(loop);
        };
        requestRef.current = requestAnimationFrame(loop);
        return () => {
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
        };
    }, []);

    const togglePlay = () => {
        console.log('Toggle play:', { isPlaying, hasAudioRef: !!audioRef.current, audioFile: audioFile?.name });

        if (isPlaying) {
            if (audioFile) {
                audioRef.current?.pause();
            }
            setIsPlaying(false);
        } else {
            lastTickRef.current = performance.now();

            if (useStore.getState().currentTime >= projectRef.current.duration) {
                handleSeek(0);
            }

            if (audioFile) {
                if (audioRef.current) {
                    audioRef.current.currentTime = useStore.getState().currentTime / 1000;
                    audioRef.current.play()
                        .then(() => {
                            console.log('Audio playing successfully');
                            if (typeof rendererRef.current.setJitterSeed === 'function') {
                                rendererRef.current.setJitterSeed(Math.random());
                            } else {
                                rendererRef.current.jitterSeed = Math.random();
                            }
                            setIsPlaying(true);
                        })
                        .catch(err => {
                            console.error('Play failed:', err);
                            alert('Failed to play audio: ' + err.message);
                        });
                }
            } else {
                lastTickRef.current = performance.now();
                if (typeof rendererRef.current.setJitterSeed === 'function') {
                    rendererRef.current.setJitterSeed(Math.random());
                } else {
                    rendererRef.current.jitterSeed = Math.random();
                }
                setIsPlaying(true);
            }
        }
    };

    const handleSeek = (timeMs) => {
        if (audioFile && audioRef.current) {
            audioRef.current.currentTime = timeMs / 1000;
        }
        setCurrentTime(timeMs);
    };

    const handleReset = () => {
        if (audioFile && audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
        setCurrentTime(0);
        setIsPlaying(false);
        setFitTrigger2D(Date.now());
    };

    const processAudioFile = async (file) => {
        if (!file) return;
            if (audioUrlRef.current) {
                URL.revokeObjectURL(audioUrlRef.current);
            }

            audioUrlRef.current = URL.createObjectURL(file);

            setAudioFile(file);
            setAudioFileName(file.name);
            addConsoleLog(`Audio Uploaded: ${file.name}`, 'info');
            setIsPlaying(false);
            setCurrentTime(0);

            const audio = new window.Audio(audioUrlRef.current);
            audio.addEventListener('loadedmetadata', async () => {
                const duration = audio.duration * 1000;
                project.duration = duration;

                try {
                    addConsoleLog(`Starting audio FFT extraction: ${file.name}...`, 'info');
                    const pointsPerSecond = 100;
                    const waveformData = await AudioWaveformManager.generateWaveform(file, pointsPerSecond);
                    addConsoleLog(`FFT extraction complete`, 'success');
                    project.waveform = {
                        peaks: waveformData.peaks,
                        pointsPerSecond: pointsPerSecond,
                        spectrogram: waveformData.spectrogram,
                        fftSampleRate: waveformData.fftSampleRate,
                        fftSize: waveformData.fftSize
                    };

                    addConsoleLog(`Starting beat analysis...`, 'info');
                    const beatData = AudioWaveformManager.detectBeats(waveformData.peaks, pointsPerSecond);
                    addConsoleLog(`Beat analysis complete. BPM: ${beatData.bpm || 'Unknown'}`, 'success');
                    project.analysis = {
                        beat_times: beatData.beatTimes,
                        reference_beats: beatData.referenceBeats,
                        onset_times: [],
                        bpm: beatData.bpm,
                        offset: beatData.offset
                    };

                    if (beatData.bpm && beatData.bpm > 0) {
                        setBpm(beatData.bpm);
                    }
                } catch (err) {
                    console.error('Failed to generate waveform or beats:', err);
                    addConsoleLog(`Analysis failed: ${err.message}`, 'error');
                }

                const updatedProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
                setProject(updatedProject);
                if (rendererRef.current) {
                    rendererRef.current.setProject(updatedProject);
                    if (typeof rendererRef.current.clearCache === 'function') {
                        rendererRef.current.clearCache();
                    }
                }
            });
    };

    const handleAudioUpload = (e) => {
        const file = e.target.files?.[0];
        processAudioFile(file);
        if (e.target) e.target.value = '';
    };

    const handleAudioPicker = async () => {
        try {
            if (window.showOpenFilePicker) {
                const [handle] = await window.showOpenFilePicker({
                    types: [{
                        description: 'Audio Files',
                        accept: { 'audio/*': ['.mp3', '.wav', '.ogg', '.m4a'] }
                    }],
                    multiple: false
                });
                const file = await handle.getFile();
                processAudioFile(file);
            } else {
                // Fallback to legacy if API not supported
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'audio/*';
                input.onchange = (e) => handleAudioUpload(e);
                input.click();
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                addConsoleLog(`Audio selection failed: ${err.message}`, 'error');
            }
        }
    };

    const handleAnalyzeAudio = async () => {
        if (!audioFile) {
            alert('Please upload an audio file first');
            return;
        }

        setIsAnalyzing(true);
        setTimeout(() => {
            const defaultAnalysis = {
                bpm: 120,
                markers: [],
                onset_env: []
            };

            project.loadAnalysis(defaultAnalysis);
            setProject(Object.assign(Object.create(Object.getPrototypeOf(project)), project));
            setIsAnalyzing(false);
        }, 500);
    };

    return {
        fpsDisplay,
        isAnalyzing,
        audioRef,
        audioUrlRef,
        isPlayingRef,
        togglePlay,
        handleSeek,
        handleReset,
        handleAudioUpload,
        handleAudioPicker,
        handleAnalyzeAudio
    };
}
