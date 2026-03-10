import { useState, useRef, useEffect } from 'react';
import { AudioWaveformManager } from '../utils/AudioWaveformManager';

export function usePlayback(project, setProject, rendererRef, setBpm, setFitTrigger2D) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [audioFile, setAudioFile] = useState(null);
    const [audioFileName, setAudioFileName] = useState('');
    const [fpsDisplay, setFpsDisplay] = useState(0);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const audioRef = useRef(null);
    const audioUrlRef = useRef(null);
    const lastTickRef = useRef(0);
    const isPlayingRef = useRef(false);
    const audioFileRef = useRef(null);
    const projectRef = useRef(project);
    const currentTimeRef = useRef(currentTime);
    const animateRef = useRef();
    const requestRef = useRef();

    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
    useEffect(() => { audioFileRef.current = audioFile; }, [audioFile]);
    useEffect(() => { projectRef.current = project; }, [project]);
    useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);

    const animate = () => {
        if (isPlayingRef.current) {
            const currentAudioFile = audioFileRef.current;
            const currentAudio = audioRef.current;

            if (currentAudioFile && currentAudio && !currentAudio.paused && !currentAudio.seeking) {
                const time = currentAudio.currentTime * 1000;
                if (Math.abs(time - currentTimeRef.current) > 1) {
                    setCurrentTime(time);
                }
                window.__lightShowTime = time;
            } else if (!currentAudioFile) {
                const now = performance.now();
                const delta = now - lastTickRef.current;
                lastTickRef.current = now;

                setCurrentTime(prev => {
                    const next = prev + delta;
                    if (next >= projectRef.current.duration) {
                        setIsPlaying(false);
                        window.__lightShowTime = projectRef.current.duration;
                        return projectRef.current.duration;
                    }
                    window.__lightShowTime = next;
                    return next;
                });
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

            if (currentTimeRef.current >= projectRef.current.duration) {
                handleSeek(0);
            }

            if (audioFile) {
                if (audioRef.current) {
                    audioRef.current.currentTime = currentTimeRef.current / 1000;
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
        currentTimeRef.current = timeMs;
    };

    const handleReset = () => {
        if (audioFile && audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
        setCurrentTime(0);
        currentTimeRef.current = 0;
        setIsPlaying(false);
        setFitTrigger2D(Date.now());
    };

    const handleAudioUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (audioUrlRef.current) {
                URL.revokeObjectURL(audioUrlRef.current);
            }

            audioUrlRef.current = URL.createObjectURL(file);

            setAudioFile(file);
            setAudioFileName(file.name);
            setIsPlaying(false);
            setCurrentTime(0);

            e.target.value = '';

            const audio = new window.Audio(audioUrlRef.current);
            audio.addEventListener('loadedmetadata', async () => {
                const duration = audio.duration * 1000;
                project.duration = duration;

                try {
                    const pointsPerSecond = 100;
                    const waveformData = await AudioWaveformManager.generateWaveform(file, pointsPerSecond);
                    project.waveform = {
                        peaks: waveformData.peaks,
                        pointsPerSecond: pointsPerSecond,
                        spectrogram: waveformData.spectrogram,
                        fftSampleRate: waveformData.fftSampleRate,
                        fftSize: waveformData.fftSize
                    };

                    const beatData = AudioWaveformManager.detectBeats(waveformData.peaks, pointsPerSecond);
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
        isPlaying, setIsPlaying,
        currentTime, setCurrentTime,
        audioFile, setAudioFile,
        audioFileName, setAudioFileName,
        fpsDisplay,
        isAnalyzing,
        audioRef,
        audioUrlRef,
        currentTimeRef,
        isPlayingRef,
        togglePlay,
        handleSeek,
        handleReset,
        handleAudioUpload,
        handleAnalyzeAudio
    };
}
