import { useState, useRef, useEffect, useMemo } from 'react';
import { Play, Pause, Save, Plus, Layers, Upload, Download, Zap, Undo, Redo, Bookmark, Image as ImageIcon, Music, FolderOpen, SkipBack, Car, Trash2, X, Settings, HelpCircle, Camera, RotateCcw, Magnet, Grid } from 'lucide-react';
import { PlayFromBookmarkIcon } from './PlayFromBookmarkIcon';
import { ProjectState } from '../core/ProjectState';
import { ShowRenderer } from '../core/ShowRenderer';
import { Timeline } from './Timeline';
import ClipEditor from './ClipEditor';
import ClipPalette from './ClipPalette';
import { LayoutParser } from '../utils/LayoutParser';
import { FseqWriter } from '../utils/FseqWriter';
import { XsqWriter } from '../utils/XsqWriter';
import { AudioWaveformManager } from '../utils/AudioWaveformManager';
import JSZip from 'jszip';
import MatrixPreview2D from './MatrixPreview2D';

const CHANNEL_NAMES = {
    0: "Left Outer Main Beam",
    1: "Right Outer Main Beam",
    2: "Left Inner Main Beam",
    3: "Right Inner Main Beam",
    4: "Left Signature",
    5: "Right Signature",
    6: "Left Channel 4",
    7: "Right Channel 4",
    8: "Left Channel 5",
    9: "Right Channel 5",
    10: "Left Channel 6",
    11: "Right Channel 6",
    12: "Left Front Turn",
    13: "Right Front Turn",
    14: "Left Front Fog",
    15: "Right Front Fog",
    16: "Left Aux Park",
    17: "Right Aux Park",
    18: "Left Side Marker",
    19: "Right Side Marker",
    20: "Left Side Repeater",
    21: "Right Side Repeater",
    22: "Left Rear Turn",
    23: "Right Rear Turn",
    24: "Brake Lights",
    25: "Left Tail",
    26: "Right Tail",
    27: "Reverse Lights",
    28: "Rear Fog Lights",
    29: "License Plate Lights",
    30: "Left Falcon Door",
    31: "Right Falcon Door",
    32: "Left Front Door",
    33: "Right Front Door",
    34: "Left Mirror",
    35: "Right Mirror",
    36: "Left Front Window",
    37: "Right Front Window",
    38: "Left Rear Window",
    39: "Right Rear Window",
    40: "Liftgate",
    41: "Left Front Door Handle",
    42: "Right Front Door Handle",
    43: "Left Rear Door Handle",
    44: "Right Rear Door Handle",
    45: "Charge Port",
};

// Channels up to 47 are standard for Tesla
for (let i = 46; i < 48; i++) {
    if (!CHANNEL_NAMES[i]) CHANNEL_NAMES[i] = `Channel ${i}`;
}



export default function EditorApp({ audioFile: initialAudioFile, analysis: initialAnalysis, bundledData, onExit, onChangeMode }) {
    const [project, setProject] = useState(new ProjectState());
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [selectedClipIds, setSelectedClipIds] = useState([]);
    const [selectedLayerId, setSelectedLayerId] = useState(null);
    const [matrixConfig, setMatrixConfig] = useState({ cols: 63, rows: 16 });
    const [audioFile, setAudioFile] = useState(null);
    const [audioFileName, setAudioFileName] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [zoom, setZoom] = useState(() => parseFloat(localStorage.getItem('ls_editor_zoom')) || 50);
    const [snapMode, setSnapMode] = useState(() => localStorage.getItem('ls_editor_snap') || '1/4');
    const [bpm, setBpm] = useState(() => parseFloat(localStorage.getItem('ls_editor_bpm')) || 120);
    const [clipboard, setClipboard] = useState(null);
    const [history, setHistory] = useState([]);
    const [redoStack, setRedoStack] = useState([]);
    const [bookmarks, setBookmarks] = useState([]);
    const [snapshot, setSnapshot] = useState(null);
    const [showHelpModal, setShowHelpModal] = useState(false);
    const [selectedPaletteClipId, setSelectedPaletteClipId] = useState(null);

    // Sync UI settings to localStorage
    useEffect(() => {
        localStorage.setItem('ls_editor_zoom', zoom);
    }, [zoom]);

    useEffect(() => {
        localStorage.setItem('ls_editor_snap', snapMode);
    }, [snapMode]);

    useEffect(() => {
        localStorage.setItem('ls_editor_bpm', bpm);
    }, [bpm]);

    // Layout system state
    const [layoutData, setLayoutData] = useState(null);
    const [layoutFileName, setLayoutFileName] = useState('');
    const [showGroundLight, setShowGroundLight] = useState(true);
    const [activeModal, setActiveModal] = useState(null); // 'lightGroups', 'trackProperties', 'carGroups'
    const [selectedCars, setSelectedCars] = useState(new Set());
    const [fitTrigger2D, setFitTrigger2D] = useState(0);

    const audioRef = useRef(null);
    const rendererRef = useRef(new ShowRenderer());
    const requestRef = useRef();
    const fileInputRef = useRef(null);
    const layoutInputRef = useRef(null);
    const audioUrlRef = useRef(null); // Cache audio URL
    const lastTickRef = useRef(0); // For manual playback timing
    const isPlayingRef = useRef(false);
    const audioFileRef = useRef(audioFile);
    const projectRef = useRef(project);
    const currentTimeRef = useRef(currentTime);
    const animateRef = useRef();

    // Keep refs in sync with state for the animation loop
    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
    useEffect(() => { audioFileRef.current = audioFile; }, [audioFile]);
    useEffect(() => { projectRef.current = project; }, [project]);
    useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);

    const handleToggleBookmark = (timeMs) => {
        setBookmarks(prev => {
            const exists = prev.some(b => Math.abs(b - timeMs) < 10);
            if (exists) {
                return prev.filter(b => Math.abs(b - timeMs) >= 10);
            } else {
                return [...prev, timeMs].sort((a, b) => a - b);
            }
        });
    };

    const handleBookmarkMove = (oldTime, newTime) => {
        setBookmarks(prev => {
            const index = prev.findIndex(b => Math.abs(b - oldTime) < 10);
            if (index === -1) return prev;
            const updated = [...prev];
            updated[index] = newTime;
            return updated.sort((a, b) => a - b);
        });
    };


    const handlePlayFromBookmark = () => {
        if (bookmarks.length === 0) return;

        // Find the latest bookmark before or at current time, or just the first one
        let targetTime = bookmarks[0];
        const currentMs = currentTimeRef.current; // Use ref for live time

        const pastBookmarks = bookmarks.filter(b => b <= currentMs + 50); // small buffer
        if (pastBookmarks.length > 0) {
            targetTime = pastBookmarks[pastBookmarks.length - 1];
        }

        handleSeek(targetTime);
        if (!isPlayingRef.current) togglePlay();
    };

    const allCarsThumbnail = useMemo(() => {
        if (!matrixConfig) return null;
        const canvas = document.createElement('canvas');
        const tRows = matrixConfig.rows;
        const tCols = matrixConfig.cols;
        const tW = 1; // pixel per car width (as requested)
        const tH = 2; // pixel per car height (1:2 ratio)
        canvas.width = tCols * tW;
        canvas.height = tRows * tH;
        const tCtx = canvas.getContext('2d');
        tCtx.fillStyle = '#000';
        tCtx.fillRect(0, 0, canvas.width, canvas.height);

        for (let r = 0; r < tRows; r++) {
            for (let c = 0; c < tCols; c++) {
                const carExists = !layoutData || (layoutData.layout[r]?.[c]?.exists);
                if (carExists) {
                    tCtx.fillStyle = '#0f0'; // All selected style
                    tCtx.fillRect(c * tW, r * tH, tW, tH);
                }
            }
        }
        return canvas.toDataURL('image/png');
    }, [matrixConfig, layoutData]);

    const handleClipSelect = (idOrIds, e) => {
        setSelectedPaletteClipId(null); // Clear palette selection when timeline clip is selected
        if (!idOrIds || (Array.isArray(idOrIds) && idOrIds.length === 0)) {
            setSelectedClipIds([]);
            return;
        }

        const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
        const isMulti = e && (e.ctrlKey || e.metaKey);

        if (isMulti) {
            setSelectedClipIds(prev => {
                let next = [...prev];
                ids.forEach(id => {
                    if (next.includes(id)) {
                        next = next.filter(cid => cid !== id);
                    } else {
                        next.push(id);
                    }
                });
                return next;
            });
        } else {
            setSelectedClipIds(ids);
        }
    };

    const handleDelete = (clipIds) => {
        const idsToDelete = Array.isArray(clipIds) ? clipIds : [clipIds];
        const json = project.toJSON(false);
        const newProject = ProjectState.fromJSONSync(json);
        newProject.assets = project.assets;
        let foundCount = 0;
        newProject.layers.forEach(layer => {
            const initialLen = layer.clips.length;
            layer.clips = layer.clips.filter(c => !idsToDelete.includes(c.id));
            foundCount += (initialLen - layer.clips.length);
        });
        if (foundCount > 0) {
            saveToHistory(newProject);
            setSelectedClipIds([]);
        }
    };

    // Sync BPM when project analysis is available
    useEffect(() => {
        if (project.analysis?.bpm) {
            setBpm(project.analysis.bpm);
        }
    }, [project.analysis?.bpm]);

    const handleBpmChange = (newBpm) => {
        const val = parseFloat(newBpm);
        if (isNaN(val) || val <= 0) return;

        setBpm(val);
        const json = project.toJSON(false);
        const newProject = ProjectState.fromJSONSync(json);
        // Preserve assets (fromJSONSync skips them for performance)
        newProject.assets = project.assets;
        if (!newProject.analysis) newProject.analysis = {};
        newProject.analysis.bpm = val;
        saveToHistory(newProject);
    };

    // Initialize with props or default
    useEffect(() => {
        const init = async () => {
            if (bundledData) {
                // 1. Restore State from bundle
                const loadedProject = await ProjectState.fromJSON(bundledData.project);
                setProject(loadedProject);
                rendererRef.current.setProject(loadedProject);

                if (bundledData.matrixConfig) setMatrixConfig(bundledData.matrixConfig);
                if (bundledData.layoutData) setLayoutData(bundledData.layoutData);
                setLayoutFileName(bundledData.layoutFileName || '');
                if (bundledData.bookmarks) setBookmarks(bundledData.bookmarks);

                // 2. Load Audio if provided via bundle (already set in setAudioFile in App.jsx but we need local state)
                if (audioFile) {
                    setAudioFile(audioFile);
                    setAudioFileName(audioFile.name);
                    const url = URL.createObjectURL(audioFile);
                    audioUrlRef.current = url;
                }
            } else if (initialAnalysis) {
                // Handle standard auto-gen analysis
                const newProject = new ProjectState();
                newProject.loadAnalysis(initialAnalysis);
                setProject(newProject);
                rendererRef.current.setProject(newProject);

                // Set audio
                if (initialAudioFile) {
                    setAudioFile(initialAudioFile);
                    setAudioFileName(initialAudioFile.name);
                    const url = URL.createObjectURL(initialAudioFile);
                    audioUrlRef.current = url;
                }
            } else {
                // Default new project
                const newProject = new ProjectState();
                newProject.addLayer('Track 1');
                newProject.duration = 60000;
                setProject(newProject);
                rendererRef.current.setProject(newProject);

                // Set audio if provided
                if (initialAudioFile) {
                    setAudioFile(initialAudioFile);
                    setAudioFileName(initialAudioFile.name);
                    const url = URL.createObjectURL(initialAudioFile);
                    audioUrlRef.current = url;
                }
            }

            // Initialize with default layout if none
            if (!layoutData && !bundledData?.layoutData) {
                const defaultLayout = LayoutParser.createDefaultLayout(matrixConfig.cols, matrixConfig.rows);
                setLayoutData(defaultLayout);
            }

            setFitTrigger2D(Date.now());
        };

        init();
    }, [bundledData, initialAnalysis, initialAudioFile]);

    useEffect(() => {
        rendererRef.current.setMatrixMode(true, matrixConfig);
    }, [matrixConfig]);

    // Handle image upload from ClipEditor
    useEffect(() => {
        const handleImageUpload = async (event) => {
            const { clipId, file } = event.detail;

            try {
                // Import ImageProcessor
                const { ImageProcessor } = await import('../utils/ImageProcessor');

                // Parse image/GIF
                let asset;
                if (file.type === 'image/gif') {
                    asset = await ImageProcessor.parseGIF(file);
                } else {
                    asset = await ImageProcessor.loadImage(file);
                }

                // Store asset
                const assetId = crypto.randomUUID();
                project.assets[assetId] = asset;

                // Update clip
                const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
                for (const layer of newProject.layers) {
                    const clip = layer.clips.find(c => c.id === clipId);
                    if (clip) {
                        clip.assetId = assetId;
                        clip.fps = asset.fps;

                        // Recalculate duration for GIF
                        if (clip.type === 'gif') {
                            const bpm = clip.bpm || 120;
                            const beatsPerFrame = clip.beatsPerFrame || 1;
                            const repetitions = clip.repetitions || 1;
                            const frameCount = asset.frames.length;

                            const msPerBeat = 60000 / bpm;
                            const frameDuration = msPerBeat * beatsPerFrame;
                            clip.duration = Math.round(frameDuration * frameCount * repetitions);

                            // Force timing mode to beat
                            if (!clip.timingMode) clip.timingMode = 'beat';

                            // Log duration update
                            console.log('GIF Duration updated:', clip.duration, 'ms', frameCount, 'frames');
                        }
                        break;
                    }
                }

                setProject(newProject);
                rendererRef.current.setProject(newProject);
                console.log('Image uploaded:', asset.width, 'x', asset.height, asset.frames.length, 'frames');
            } catch (err) {
                console.error('Failed to upload image:', err);
                alert('Failed to upload image: ' + err.message);
            }
        };

        window.addEventListener('imageUpload', handleImageUpload);
        return () => window.removeEventListener('imageUpload', handleImageUpload);
    }, [project]);

    const animate = () => {
        if (isPlayingRef.current) {
            const currentAudioFile = audioFileRef.current;
            const currentAudio = audioRef.current;

            if (currentAudioFile && currentAudio && !currentAudio.paused && !currentAudio.seeking) {
                const time = currentAudio.currentTime * 1000;
                if (Math.abs(time - currentTimeRef.current) > 1) {
                    setCurrentTime(time);
                }
            } else if (!currentAudioFile) {
                const now = performance.now();
                const delta = now - lastTickRef.current;
                lastTickRef.current = now;

                setCurrentTime(prev => {
                    const next = prev + delta;
                    if (next >= projectRef.current.duration) {
                        setIsPlaying(false);
                        return projectRef.current.duration;
                    }
                    return next;
                });
            }
        }
    };

    // Keep the animate function fresh for the loop
    useEffect(() => {
        animateRef.current = animate;
    });

    useEffect(() => {
        const handleKeyDown = (e) => {
            // Check if user is typing in an input
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 'z':
                        e.preventDefault();
                        if (e.shiftKey) handleRedo();
                        else handleUndo();
                        break;
                    case 'y':
                        e.preventDefault();
                        handleRedo();
                        break;
                    case 'd':
                        e.preventDefault();
                        handleDuplicateClip();
                        break;
                    case 'x':
                        // Cut logic
                        if (selectedClipIds.length > 0) {
                            const foundClips = project.layers.flatMap(l => l.clips).filter(c => selectedClipIds.includes(c.id));
                            if (foundClips.length > 0) {
                                setClipboard(foundClips.map(c => ({ ...c })));
                                handleDelete(selectedClipIds);
                            }
                        }
                        break;
                    case 'c':
                        // Copy logic
                        if (selectedClipIds.length > 0) {
                            const foundClips = project.layers.flatMap(l => l.clips).filter(c => selectedClipIds.includes(c.id));
                            if (foundClips.length > 0) {
                                setClipboard(foundClips.map(c => ({ ...c })));
                            }
                        }
                        break;
                    case 'v':
                        // Paste logic
                        if (clipboard && Array.isArray(clipboard) && clipboard.length > 0) {
                            const json = project.toJSON(false);
                            const newProject = ProjectState.fromJSONSync(json);
                            newProject.assets = project.assets;

                            // Calculate global offset relative to earliest clip
                            const earliestStart = Math.min(...clipboard.map(c => c.startTime));
                            const offset = currentTimeRef.current - earliestStart;

                            const newPastedIds = [];
                            clipboard.forEach(clip => {
                                // Default target layer is the one it was originally on, or selected layer
                                let targetLayerId = selectedLayerId || newProject.layers[0].id;
                                // If multiple clips, try to maintain track relationship (simplified)
                                const layer = newProject.layers.find(l => l.id === targetLayerId);
                                if (layer) {
                                    const newClip = {
                                        ...clip,
                                        id: crypto.randomUUID(),
                                        startTime: Math.max(0, clip.startTime + offset)
                                    };
                                    layer.clips.push(newClip);
                                    newPastedIds.push(newClip.id);
                                }
                            });
                            saveToHistory(newProject);
                            setSelectedClipIds(newPastedIds);
                        }
                        break;
                }
            } else {
                // Non-ctrl shortcuts
                const key = e.key.toLowerCase();

                // Palette shortcuts: 1-5, q-t
                const paletteKeys = ['1', '2', '3', '4', '5', 'q', 'w', 'e', 'r', 't'];
                const slotIndex = paletteKeys.indexOf(key);
                if (slotIndex !== -1) {
                    e.preventDefault();
                    handlePasteFromPalette(slotIndex);
                    return;
                }

                switch (key) {
                    case ' ':
                        e.preventDefault();
                        togglePlay();
                        break;
                    case 'enter':
                        e.preventDefault();
                        handlePlayFromBookmark();
                        break;
                    case 'delete':
                    case 'backspace':
                        if (selectedClipIds.length > 0) {
                            handleDelete(selectedClipIds);
                        } else if (selectedPaletteClipId) {
                            handleClipDelete([selectedPaletteClipId]);
                        }
                        break;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [project, history, redoStack, selectedClipIds, selectedLayerId, clipboard, isPlaying, audioFile, bookmarks]);

    useEffect(() => {
        const loop = () => {
            animateRef.current?.();
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
            // Ensure lastTick is initialized regardless of audio mode
            // to prevent huge deltas if the logic switches branches.
            lastTickRef.current = performance.now();

            if (currentTimeRef.current >= projectRef.current.duration) {
                handleSeek(0);
            }

            if (audioFile) {
                if (audioRef.current) {
                    // Force audio to match UI time precisely before playing
                    audioRef.current.currentTime = currentTimeRef.current / 1000;
                    audioRef.current.play()
                        .then(() => {
                            console.log('Audio playing successfully');
                            // Randomize jitter seed for this session (with fallback for stale instances)
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
                // Manual playback start
                lastTickRef.current = performance.now();

                // Randomize jitter seed for this session (with fallback for stale instances)
                if (typeof rendererRef.current.setJitterSeed === 'function') {
                    rendererRef.current.setJitterSeed(Math.random());
                } else {
                    rendererRef.current.jitterSeed = Math.random();
                }

                setIsPlaying(true);
            }
        }
    };

    const handleAudioUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            // Revoke old URL if exists
            if (audioUrlRef.current) {
                URL.revokeObjectURL(audioUrlRef.current);
            }

            // Create new URL and cache it
            audioUrlRef.current = URL.createObjectURL(file);

            setAudioFile(file);
            setAudioFileName(file.name);
            setIsPlaying(false);
            setCurrentTime(0);

            // Reset input value to allow re-uploading same file
            e.target.value = '';

            // Get duration from audio file
            const audio = new Audio(audioUrlRef.current);
            audio.addEventListener('loadedmetadata', async () => {
                const duration = audio.duration * 1000;
                project.duration = duration;

                // Generate waveform
                try {
                    const pointsPerSecond = 100; // Increased resolution (10ms)
                    const waveformData = await AudioWaveformManager.generateWaveform(file, pointsPerSecond);
                    project.waveform = {
                        peaks: waveformData.peaks,
                        pointsPerSecond: pointsPerSecond
                    };

                    // Detect beats and reference bars
                    const beatData = AudioWaveformManager.detectBeats(waveformData.peaks, pointsPerSecond);
                    project.analysis = {
                        beat_times: beatData.beatTimes,
                        reference_beats: beatData.referenceBeats,
                        onset_times: [], // Assuming detectBeats doesn't return this separate list yet
                        bpm: beatData.bpm,
                        offset: beatData.offset
                    };

                    if (beatData.bpm && beatData.bpm > 0) {
                        setBpm(beatData.bpm);
                    }
                } catch (err) {
                    console.error('Failed to generate waveform or beats:', err);
                }

                setProject(Object.assign(Object.create(Object.getPrototypeOf(project)), project));
            });
        }
    };

    const handleAnalyzeAudio = async () => {
        if (!audioFile) {
            alert('Please upload an audio file first');
            return;
        }

        setIsAnalyzing(true);

        // Client-side simulation of analysis
        // Since we removed the python backend, we just set defaults
        setTimeout(() => {
            // Default to 120 BPM if not manually set
            const defaultAnalysis = {
                bpm: 120,
                markers: [], // No automatic markers without backend
                onset_env: [] // No waveform data without backend
            };

            project.loadAnalysis(defaultAnalysis);
            setProject(Object.assign(Object.create(Object.getPrototypeOf(project)), project));
            // alert('Audio analysis initialized (Client Mode). Default BPM set to 120.');
            setIsAnalyzing(false);
        }, 500); // Fake delay for UX
    };

    const handleLayoutUpload = async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                const parsed = await LayoutParser.parseLayoutImage(file);
                setLayoutData(parsed);
                setLayoutFileName(file.name);

                // Reset input value
                e.target.value = '';

                // Update matrix config based on image dimensions
                const newConfig = {
                    rows: parsed.height,
                    cols: parsed.width
                };
                setMatrixConfig(newConfig);
                rendererRef.current.setMatrixMode(true, newConfig);

                console.log('Layout loaded:', parsed.width, 'x', parsed.height);
            } catch (err) {
                console.error('Failed to load layout:', err);
                alert('Failed to load layout image: ' + err.message);
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

    const saveToHistory = (newState) => {
        const snapshot = project.toJSON();
        setHistory(prev => [...prev.slice(-19), snapshot]);
        setRedoStack([]);
        setProject(newState);
        rendererRef.current.setProject(newState);
    };

    const handleUndo = () => {
        if (history.length === 0) return;
        const previous = history[history.length - 1];
        setRedoStack(prev => [...prev, project.toJSON()]);
        setHistory(prev => prev.slice(0, -1));

        ProjectState.fromJSON(previous).then(loaded => {
            setProject(loaded);
            rendererRef.current.setProject(loaded);
        });
    };

    const handleRedo = () => {
        if (redoStack.length === 0) return;
        const next = redoStack[redoStack.length - 1];
        setHistory(prev => [...prev, project.toJSON()]);
        setRedoStack(prev => prev.slice(0, -1));

        ProjectState.fromJSON(next).then(loaded => {
            setProject(loaded);
            rendererRef.current.setProject(loaded);
        });
    };

    const handleTakeSnapshot = () => {
        const currentData = project.toJSON();
        setSnapshot(currentData);
        console.log('Snapshot taken');
    };

    const handleRestoreSnapshot = () => {
        if (!snapshot) return;

        // Make the restore undoable
        const currentData = project.toJSON(false);
        setHistory(prev => [...prev.slice(-19), currentData]);
        setRedoStack([]);

        ProjectState.fromJSON(snapshot).then(loaded => {
            setProject(loaded);
            rendererRef.current.setProject(loaded);
            console.log('Snapshot restored');
        });
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

    const handleAddTrack = () => {
        project.addLayer(`Track ${project.layers.length + 1}`);
        const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
        setProject(newProject);
        setSelectedLayerId(newProject.layers[newProject.layers.length - 1].id);
    };

    const handleClipUpdate = (updatedData, field = null) => {
        const json = project.toJSON(false);
        const newProject = ProjectState.fromJSONSync(json);
        newProject.assets = project.assets;

        // If field is provided, it's a batch/partial update for all selected clips.
        // Otherwise, it's a full update for a single clip (legacy/palette support).
        const targetIds = field ? selectedClipIds : [updatedData.id];
        let found = false;

        newProject.layers.forEach(layer => {
            layer.clips = layer.clips.map(c => {
                if (targetIds.includes(c.id)) {
                    found = true;
                    if (field) {
                        if (field === '__multiple__') {
                            return { ...c, ...updatedData };
                        }
                        return { ...c, [field]: updatedData[field] };
                    }
                    return updatedData;
                }
                return c;
            });
        });

        if (!found) {
            newProject.palette.forEach(slot => {
                slot.clips = slot.clips.map(c => {
                    if (targetIds.includes(c.id) || c.id === updatedData.id) {
                        found = true;
                        if (field) {
                            if (field === '__multiple__') {
                                return { ...c, ...updatedData };
                            }
                            return { ...c, [field]: updatedData[field] };
                        }
                        return updatedData;
                    }
                    return c;
                });
            });
        }

        if (found) {
            saveToHistory(newProject);
        }
    };

    const handleClipDelete = (clipIdOrIds) => {
        const clipIds = Array.isArray(clipIdOrIds) ? clipIdOrIds : [clipIdOrIds];
        const clipIdSet = new Set(clipIds);

        const json = project.toJSON(false);
        const newProject = ProjectState.fromJSONSync(json);
        newProject.assets = project.assets;

        let changed = false;
        // Delete from layers
        newProject.layers.forEach(layer => {
            const initialLen = layer.clips.length;
            layer.clips = layer.clips.filter(c => !clipIdSet.has(c.id));
            if (layer.clips.length !== initialLen) changed = true;
        });

        // Delete from palette
        newProject.palette.forEach(slot => {
            const initialLen = slot.clips.length;
            slot.clips = slot.clips.filter(c => !clipIdSet.has(c.id));
            if (slot.clips.length !== initialLen) changed = true;
        });

        if (changed) {
            saveToHistory(newProject);
            if (clipIdSet.has(selectedPaletteClipId)) {
                setSelectedPaletteClipId(null);
            }
            setSelectedClipIds(prev => prev.filter(id => !clipIdSet.has(id)));
        }
    };

    const handlePaletteClipSelect = (clipId) => {
        setSelectedPaletteClipId(clipId);
        setSelectedClipIds([]); // Clear timeline selection
    };

    const handlePasteFromPalette = (slotIndex) => {
        const slot = project.palette[slotIndex];
        if (!slot || slot.clips.length === 0) return;

        const json = project.toJSON(false);
        const newProject = ProjectState.fromJSONSync(json);
        newProject.assets = project.assets;

        const targetLayerId = selectedLayerId || newProject.layers[0].id;
        const layer = newProject.layers.find(l => l.id === targetLayerId);

        if (layer) {
            let clipsToPaste = slot.clips;

            if (slot.randomToggle) {
                const randomIndex = Math.floor(Math.random() * slot.clips.length);
                clipsToPaste = [slot.clips[randomIndex]];
            } else if (slot.sequentialToggle) {
                const index = (slot.sequentialIndex || 0) % slot.clips.length;
                clipsToPaste = [slot.clips[index]];
                // We'll update the index later in the project state
            }

            // Find earliest clip in slot to calculate relative offsets
            const earliestClip = clipsToPaste.reduce((earliest, current) =>
                current.startTime < earliest.startTime ? current : earliest, clipsToPaste[0]
            );

            const newPastedIds = [];
            clipsToPaste.forEach(clip => {
                const relativeOffset = clip.startTime - earliestClip.startTime;
                const newClip = {
                    ...clip,
                    id: crypto.randomUUID(),
                    startTime: currentTimeRef.current + relativeOffset
                };
                layer.clips.push(newClip);
                newPastedIds.push(newClip.id);
            });

            if (slot.sequentialToggle) {
                const slotInNewProject = newProject.palette[slotIndex];
                slotInNewProject.sequentialIndex = ((slotInNewProject.sequentialIndex || 0) + 1) % slot.clips.length;
            }

            saveToHistory(newProject);
            setSelectedClipIds(newPastedIds);
            setSelectedPaletteClipId(null);
        }
    };

    const handleAddCarGroup = () => {
        if (selectedCars.size === 0) {
            alert('Please select cars in the 2D view first');
            return;
        }

        const defaultName = `Group ${(project.carGroups?.length || 0) + 1}`;
        const name = prompt('Enter car group name:', defaultName);
        if (!name) return;

        // Generate thumbnail
        const canvas = document.createElement('canvas');
        const tRows = matrixConfig.rows;
        const tCols = matrixConfig.cols;
        const tW = 1;
        const tH = 2; // 1:2 ratio
        canvas.width = tCols * tW;
        canvas.height = tRows * tH;
        const tCtx = canvas.getContext('2d');
        tCtx.fillStyle = '#000';
        tCtx.fillRect(0, 0, canvas.width, canvas.height);

        for (let r = 0; r < tRows; r++) {
            for (let c = 0; c < tCols; c++) {
                if (selectedCars.has(`${r},${c}`)) {
                    tCtx.fillStyle = '#0f0';
                    tCtx.fillRect(c * tW, r * tH, tW, tH);
                } else if (!layoutData || layoutData.layout[r]?.[c]?.exists) {
                    tCtx.fillStyle = '#333';
                    tCtx.fillRect(c * tW, r * tH, tW, tH);
                }
            }
        }
        const thumbnail = canvas.toDataURL('image/png');

        const newGroup = {
            id: crypto.randomUUID(),
            name,
            selection: Array.from(selectedCars),
            thumbnail
        };

        const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
        newProject.carGroups = [...(project.carGroups || []), newGroup];
        saveToHistory(newProject);
        setSelectedCars(new Set());
    };

    const handleAddClip = (type = 'effect') => {
        if (project.layers.length > 0) {
            const json = project.toJSON(false);
            const newProject = ProjectState.fromJSONSync(json);
            // Preserve assets (fromJSONSync skips them for performance)
            newProject.assets = project.assets;
            const targetLayerId = selectedLayerId || newProject.layers[0].id;
            const layer = newProject.layers.find(l => l.id === targetLayerId);

            if (layer) {
                // Smart placement logic: check for overlaps at currentTime
                let startTime = currentTimeRef.current;

                // Sort clips by startTime to find the right gap
                const sortedClips = [...layer.clips].sort((a, b) => a.startTime - b.startTime);

                // Find if currentTime is inside any clip
                const overlappingClip = sortedClips.find(c =>
                    currentTimeRef.current >= c.startTime && currentTimeRef.current < (c.startTime + c.duration)
                );

                if (overlappingClip) {
                    // Position it immediately after the overlapping clip (or the last one in a chain of overlaps)
                    let currentEnd = overlappingClip.startTime + overlappingClip.duration;
                    let foundOverlap = true;
                    while (foundOverlap) {
                        const nextOverlap = sortedClips.find(c =>
                            c.startTime < currentEnd + 10 && (c.startTime + c.duration) > currentEnd
                        );
                        if (nextOverlap) {
                            currentEnd = nextOverlap.startTime + nextOverlap.duration;
                        } else {
                            foundOverlap = false;
                        }
                    }
                    startTime = currentEnd;
                }

                const newClip = {
                    id: crypto.randomUUID(),
                    startTime: startTime,
                    duration: 1000,
                    type: type, // 'effect' or 'gif'
                    effectType: type === 'effect' ? 'flash' : 'image',
                    channels: [],
                    targetLightGroups: (type === 'gif' && layer?.lightMapping)
                        ? Object.values(layer.lightMapping).filter(Boolean)
                        : [],
                    fadeIn: 0,
                    fadeOut: 0,
                    pattern: 'uniform',
                    patternDirection: 'horizontal',
                    patternSpeed: 1.0,
                    // GIF clips use beat-based timing by default
                    ...(type === 'gif' && {
                        timingMode: 'beat',
                        bpm: 120,
                        beatsPerFrame: 1,
                        repetitions: 1
                    })
                };

                if (type === 'gif') {
                    // Trigger image upload for GIF type
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = (e) => {
                        const file = e.target.files[0];
                        if (file) {
                            window.dispatchEvent(new CustomEvent('imageUpload', {
                                detail: { clipId: newClip.id, file }
                            }));
                        }
                        e.target.value = ''; // Reset
                    };
                    input.click();
                }

                layer.clips.push(newClip);
                saveToHistory(newProject);
                setSelectedClipIds([newClip.id]);
            }
        }
    };

    const handleDuplicateClip = () => {
        if (selectedClipIds.length === 0) return;

        const json = project.toJSON(false);
        const newProject = ProjectState.fromJSONSync(json);
        newProject.assets = project.assets;

        const newSelection = [];
        selectedClipIds.forEach(clipId => {
            let sourceClip = null;
            let targetLayer = null;

            for (const layer of newProject.layers) {
                const found = layer.clips.find(c => c.id === clipId);
                if (found) {
                    sourceClip = found;
                    targetLayer = layer;
                    break;
                }
            }

            if (sourceClip && targetLayer) {
                const newClip = {
                    ...sourceClip,
                    id: crypto.randomUUID(),
                    startTime: sourceClip.startTime + sourceClip.duration
                };
                targetLayer.clips.push(newClip);
                newSelection.push(newClip.id);
            }
        });

        if (newSelection.length > 0) {
            saveToHistory(newProject);
            setSelectedClipIds(newSelection);
        }
    };

    const handleRemoveGaps = () => {
        if (selectedClipIds.length < 2) return;

        const json = project.toJSON(false);
        const newProject = ProjectState.fromJSONSync(json);
        newProject.assets = project.assets;

        // Collect all selected clips across layers
        const selectedClipsData = [];
        newProject.layers.forEach(layer => {
            layer.clips.forEach(clip => {
                if (selectedClipIds.includes(clip.id)) {
                    selectedClipsData.push({ clip, layer });
                }
            });
        });

        if (selectedClipsData.length < 2) return;

        // Sort by start time
        selectedClipsData.sort((a, b) => a.clip.startTime - b.clip.startTime);

        // Adjust timings
        for (let i = 1; i < selectedClipsData.length; i++) {
            const prev = selectedClipsData[i - 1].clip;
            const current = selectedClipsData[i].clip;
            current.startTime = prev.startTime + prev.duration;
        }

        saveToHistory(newProject);
    };

    const handleAlignToSnap = () => {
        if (selectedClipIds.length === 0 || snapMode === 'off') return;

        const json = project.toJSON(false);
        const newProject = ProjectState.fromJSONSync(json);
        newProject.assets = project.assets;

        const analysis = project.analysis;
        const beatMarkers = analysis?.beat_times || [];
        const onsetMarkers = analysis?.onset_times || [];
        const duration = project.duration || 60000;

        let snapIntervalMs = null;
        const beatDurationMs = (60 / (bpm || 120)) * 1000;
        const multiplier = snapMode === '1' ? 1
            : snapMode === '1/2' ? 0.5
                : snapMode === '1/4' ? 0.25
                    : 0.125;
        snapIntervalMs = beatDurationMs * multiplier;

        const snapCandidates = [0, ...beatMarkers.map(t => t * 1000), ...onsetMarkers.map(t => t * 1000)];
        if (snapIntervalMs) {
            for (let t = 0; t <= duration; t += snapIntervalMs) {
                snapCandidates.push(t);
            }
        }

        let changed = false;
        newProject.layers.forEach(layer => {
            layer.clips.forEach(clip => {
                if (selectedClipIds.includes(clip.id)) {
                    let snappedTime = clip.startTime;
                    let minDiff = Infinity;
                    snapCandidates.forEach(snap => {
                        const diff = Math.abs(clip.startTime - snap);
                        if (diff < minDiff) {
                            minDiff = diff;
                            snappedTime = snap;
                        }
                    });
                    if (Math.abs(clip.startTime - snappedTime) > 0.1) {
                        clip.startTime = snappedTime;
                        changed = true;
                    }
                }
            });
        });

        if (changed) {
            saveToHistory(newProject);
        }
    };

    const handleExportXsq = async () => {
        try {
            const writer = new XsqWriter();
            const durationMs = project.duration || 10000;
            const frameCount = Math.ceil(durationMs / 20);
            const gridSize = matrixConfig;
            const isMatrix = gridSize.rows > 1 || gridSize.cols > 1;

            if (isMatrix) {
                const zip = new JSZip();
                let hasFiles = false;

                for (let r = 0; r < gridSize.rows; r++) {
                    for (let c = 0; c < gridSize.cols; c++) {
                        const cell = layoutData?.layout?.[r]?.[c];
                        if (layoutData && cell && !cell.exists) continue;

                        const frames = [];
                        for (let f = 0; f < frameCount; f++) {
                            const timeMs = f * 20;
                            const frame = rendererRef.current.getFrameForPosition(timeMs, r, c, gridSize);
                            frames.push(frame);
                        }

                        const rowLetter = String.fromCharCode(65 + r);
                        const colId = (c + 1).toString().padStart(2, '0');
                        const xml = writer.createXsq(frames, {
                            song: `${audioFileName} - ${rowLetter}${colId}`,
                            author: 'Lightshow Generator'
                        });
                        zip.file(`${rowLetter}${colId}.xsq`, xml);
                        hasFiles = true;
                    }
                }

                if (!hasFiles) {
                    alert("No cars found in layout to export.");
                    return;
                }

                const content = await zip.generateAsync({
                    type: 'blob',
                    compression: "DEFLATE",
                    compressionOptions: { level: 9 }
                });
                const url = URL.createObjectURL(content);
                const a = document.createElement('a');
                a.href = url;
                a.download = `lightshow_matrix_xsq_${new Date().getTime()}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                console.log('Matrix XSQ Exported');
            } else {
                // Single car export
                const frames = [];
                for (let i = 0; i < frameCount; i++) {
                    frames.push(rendererRef.current.getFrame(i * 20));
                }

                const safeName = (audioFileName || 'lightshow').split('.')[0];
                writer.download(frames, `${safeName}.xsq`, {
                    song: audioFileName,
                    author: 'Lightshow Generator'
                });
                console.log('Single XSQ Exported');
            }
        } catch (err) {
            console.error('Failed to export XSQ:', err);
            alert('Failed to export XLights sequence: ' + err.message);
        }
    };

    const handleExportMatrix = async () => {
        try {
            const writer = new FseqWriter(48, 20); // 48 channels, 20ms step
            const durationMs = project.duration || 10000;
            const frameCount = Math.ceil(durationMs / 20);
            const gridSize = matrixConfig;

            const zip = new JSZip();
            let hasFiles = false;

            // Process each car in the grid
            for (let r = 0; r < gridSize.rows; r++) {
                for (let c = 0; c < gridSize.cols; c++) {
                    // Check if car exists in layout
                    const cell = layoutData?.layout?.[r]?.[c];
                    if (layoutData && cell && !cell.exists) continue;

                    const frames = [];
                    for (let f = 0; f < frameCount; f++) {
                        const timeMs = f * 20;
                        const frame = rendererRef.current.getFrameForPosition(timeMs, r, c, gridSize);
                        frames.push(frame);
                    }

                    // Use requested naming convention
                    const rowLetter = String.fromCharCode(65 + r); // A, B, C...
                    const colId = (c + 1).toString().padStart(2, '0'); // 01, 02...
                    const blob = writer.createFseq(frames);
                    const arrayBuffer = await blob.arrayBuffer(); // Convert to ArrayBuffer for JSZip
                    zip.file(`${rowLetter}${colId}.fseq`, arrayBuffer);
                    hasFiles = true;
                }
            }

            if (!hasFiles) {
                alert("No cars found in layout to export.");
                return;
            }

            const content = await zip.generateAsync({
                type: 'blob',
                compression: "DEFLATE",
                compressionOptions: { level: 9 }
            });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `lightshow_matrix_${new Date().getTime()}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export failed:', error);
            alert('Failed to export light show.', error);
        }
    };

    const selectedClips = useMemo(() => {
        if (selectedClipIds.length === 0) return [];
        const found = [];
        project.layers.forEach(layer => {
            layer.clips.forEach(clip => {
                if (selectedClipIds.includes(clip.id)) {
                    found.push(clip);
                }
            });
        });
        return found;
    }, [selectedClipIds, project]);

    const selectedPaletteClip = useMemo(() => {
        if (!selectedPaletteClipId) return null;
        for (const slot of project.palette) {
            const found = slot.clips.find(c => c.id === selectedPaletteClipId);
            if (found) return found;
        }
        return null;
    }, [selectedPaletteClipId, project.palette]);

    const handleSaveProject = async () => {
        try {
            const zip = new JSZip();

            const projectData = {
                version: '1.1',
                project: project.toJSON(),
                matrixConfig,
                audioFileName,
                layoutFileName,
                layoutData,
                bookmarks
            };

            // 1. Add project metadata
            zip.file("project.json", JSON.stringify(projectData, null, 2));

            // 2. Add audio file if exists
            if (audioFile) {
                zip.file(audioFileName || "audio.mp3", audioFile);
            }

            const content = await zip.generateAsync({
                type: 'blob',
                compression: "DEFLATE",
                compressionOptions: { level: 9 }
            });
            const url = URL.createObjectURL(content);

            const a = document.createElement('a');
            a.href = url;
            const safeName = (audioFileName || 'lightshow').split('.')[0];
            a.download = `${safeName}_project.ls`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            URL.revokeObjectURL(url);
            console.log('Project bundle saved');
        } catch (err) {
            console.error('Failed to save project:', err);
            alert('Failed to save project bundle: ' + err.message);
        }
    };

    const handleLoadProject = async (file) => {
        try {
            const zip = await JSZip.loadAsync(file);

            // 1. Load project.json
            const jsonFile = zip.file("project.json");
            if (!jsonFile) throw new Error("Not a valid lightshow bundle (missing project.json)");

            const jsonText = await jsonFile.async("string");
            const data = JSON.parse(jsonText);

            // 2. Restore State
            const loadedProject = await ProjectState.fromJSON(data.project);
            setProject(loadedProject);
            rendererRef.current.setProject(loadedProject);

            if (data.matrixConfig) setMatrixConfig(data.matrixConfig);
            if (data.layoutData) setLayoutData(data.layoutData);
            setLayoutFileName(data.layoutFileName || '');
            if (data.bookmarks) setBookmarks(data.bookmarks);

            // 3. Load Audio from bundle
            const audioName = data.audioFileName;
            if (audioName) {
                const audioInZip = zip.file(audioName);
                if (audioInZip) {
                    const audioBlob = await audioInZip.async("blob");
                    const audioFileObj = new File([audioBlob], audioName, { type: audioBlob.type });

                    setAudioFile(audioFileObj);
                    setAudioFileName(audioName);

                    const url = URL.createObjectURL(audioFileObj);
                    audioUrlRef.current = url;
                    if (audioRef.current) {
                        audioRef.current.src = url;
                        audioRef.current.load();
                    }

                    // 4. Automatic Re-analysis if missing
                    if (!loadedProject.waveform || !loadedProject.analysis?.beat_times) {
                        console.log('Missing waveform or beat data, starting automatic re-analysis...');
                        try {
                            const pointsPerSecond = 20;
                            const waveformData = await AudioWaveformManager.generateWaveform(audioFileObj, pointsPerSecond);
                            loadedProject.waveform = {
                                peaks: waveformData.peaks,
                                pointsPerSecond: pointsPerSecond
                            };

                            const beatData = AudioWaveformManager.detectBeats(waveformData.peaks, pointsPerSecond);
                            loadedProject.analysis = {
                                ...(loadedProject.analysis || {}),
                                beat_times: beatData.beatTimes,
                                reference_beats: beatData.referenceBeats,
                                bpm: beatData.bpm,
                                offset: beatData.offset
                            };

                            // Update global BPM if detected
                            if (beatData.bpm && beatData.bpm > 0) {
                                setBpm(beatData.bpm);
                            }

                            // Update project state after analysis
                            setProject(Object.assign(Object.create(Object.getPrototypeOf(loadedProject)), loadedProject));
                            console.log('Automatic re-analysis completed', beatData);
                        } catch (reErr) {
                            console.error('Auto re-analysis failed:', reErr);
                        }
                    }
                }
            }

            console.log('Project bundle loaded');
            setFitTrigger2D(Date.now());
            alert('Project bundle loaded successfully!');

        } catch (err) {
            console.error('Failed to load project bundle:', err);
            alert('Failed to load project bundle: ' + err.message);
        } finally {
            // Optional: if handleLoadProject was called from an input, we might need a way to reset it
            // However, the caller should handle it. Let's look at the caller in JSX.
        }
    };

    return (
        <div className="editor-container">
            <header className="editor-header">
                <h2 style={{ margin: 0, fontSize: '18px' }}>🎵 Light Show Editor</h2>
                <div className="actions" style={{ display: 'flex', gap: '8px', alignItems: 'center', position: 'relative', zIndex: 100 }}>
                    <div className="nav-links" style={{ display: 'flex', gap: '5px', marginRight: '15px', borderRight: '1px solid #444', paddingRight: '10px' }}>
                        <button
                            className="btn-link-small"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const url = window.location.origin + '/fseq-viewer';
                                window.open(url, '_blank');
                            }}
                            style={{ fontSize: '12px', color: '#aaa', padding: '4px 8px', cursor: 'pointer' }}
                        >
                            FSEQ Viewer
                        </button>
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="audio/*"
                        onChange={handleAudioUpload}
                        style={{ display: 'none' }}
                    />
                    <button
                        className="btn-icon"
                        tabIndex={-1}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                            e.currentTarget.blur();
                            fileInputRef.current?.click();
                        }}
                        title="Upload Audio"
                    >
                        <Music size={20} />
                    </button>
                    {audioFileName && (
                        <span style={{ fontSize: '12px', color: '#888', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {audioFileName}
                        </span>
                    )}



                    <label
                        className="btn-icon"
                        title="Load Project"
                        style={{ cursor: 'pointer', borderLeft: '1px solid #444', paddingLeft: '10px' }}
                    >
                        <FolderOpen size={20} />
                        <input
                            type="file"
                            accept=".ls,.json,.zip"
                            onChange={(e) => {
                                if (e.target.files[0]) {
                                    handleLoadProject(e.target.files[0]);
                                }
                                e.target.value = ''; // Reset to allow reloading same file
                            }}
                            style={{ display: 'none' }}
                        />
                    </label>

                    <button
                        className="btn-icon"
                        tabIndex={-1}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                            e.currentTarget.blur();
                            handleSaveProject();
                        }}
                        title="Save Project"
                    >
                        <Save size={20} />
                    </button>

                    {/* Layout Image Upload */}
                    <input
                        ref={layoutInputRef}
                        type="file"
                        accept="image/png"
                        onChange={handleLayoutUpload}
                        style={{ display: 'none' }}
                    />
                    <button
                        className="btn-icon"
                        tabIndex={-1}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                            e.currentTarget.blur();
                            layoutInputRef.current?.click();
                        }}
                        title="Upload Layout Image (PNG)"
                        style={{ borderLeft: '1px solid #444', paddingLeft: '10px' }}
                    >
                        <ImageIcon size={20} />
                    </button>
                    {layoutFileName && (
                        <span style={{ fontSize: '12px', color: '#888', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {layoutFileName}
                        </span>
                    )}

                    <button
                        className={`btn-icon ${activeModal === 'lightGroups' ? 'active' : ''}`}
                        tabIndex={-1}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                            e.currentTarget.blur();
                            setActiveModal('lightGroups');
                        }}
                        title="Light Group Editor"
                        style={{ borderLeft: '1px solid #444', paddingLeft: '10px' }}
                    >
                        <Car size={20} />
                    </button>

                    {/* Car Group Controls */}
                    <div className="car-group-controls" style={{ display: 'flex', gap: '8px', borderLeft: '1px solid #444', paddingLeft: '10px' }}>
                        <button
                            className="btn-icon"
                            title="Add Selected Cars to Group"
                            onClick={handleAddCarGroup}
                            disabled={selectedCars.size === 0}
                        >
                            <Plus size={20} />
                        </button>
                        <button
                            className={`btn-icon ${activeModal === 'carGroups' ? 'active' : ''}`}
                            title="Manage Car Groups"
                            onClick={() => setActiveModal('carGroups')}
                        >
                            <Layers size={20} />
                        </button>
                    </div>

                    {/* Matrix Size Controls */}
                    <div className="matrix-config" style={{ display: 'flex', alignItems: 'center', gap: '5px', borderLeft: '1px solid #444', paddingLeft: '10px' }}>
                        <span style={{ fontSize: '12px', color: '#666' }}>Grid:</span>
                        <input
                            type="number"
                            value={matrixConfig.cols}
                            onChange={e => setMatrixConfig(prev => ({ ...prev, cols: parseInt(e.target.value) || 1 }))}
                            style={{ width: '45px', background: '#333', border: '1px solid #444', color: 'white', padding: '2px 5px', borderRadius: '3px' }}
                            min="1"
                            max="100"
                            title="Columns"
                        />
                        <span style={{ color: '#666' }}>×</span>
                        <input
                            type="number"
                            value={matrixConfig.rows}
                            onChange={e => setMatrixConfig(prev => ({ ...prev, rows: parseInt(e.target.value) || 1 }))}
                            style={{ width: '45px', background: '#333', border: '1px solid #444', color: 'white', padding: '2px 5px', borderRadius: '3px' }}
                            min="1"
                            max="50"
                            title="Rows"
                        />
                    </div>

                    <div className="ground-light-toggle" style={{ display: 'flex', alignItems: 'center', gap: '5px', borderLeft: '1px solid #444', paddingLeft: '10px', marginLeft: '10px' }}>
                        <input
                            type="checkbox"
                            id="showGroundLight"
                            checked={showGroundLight}
                            onChange={(e) => setShowGroundLight(e.target.checked)}
                            style={{ cursor: 'pointer' }}
                        />
                        <label htmlFor="showGroundLight" style={{ fontSize: '12px', color: '#888', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            Ground Light
                        </label>
                    </div>

                    <div className="toolbar-group" style={{ display: 'flex', gap: '10px', borderLeft: '1px solid #444', paddingLeft: '12px', marginLeft: '12px' }}>
                        <button className="btn-secondary" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.currentTarget.blur(); handleExportXsq(); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 14px', fontSize: '14px' }}>
                            <Save size={18} />
                            .xsq
                        </button>
                        <button className="btn-secondary" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.currentTarget.blur(); handleExportMatrix(); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 14px', fontSize: '14px' }}>
                            <Save size={18} />
                            .fseq
                        </button>
                    </div>
                </div>
            </header>

            <div className="editor-main">
                <div className="preview-panel">
                    <MatrixPreview2D
                        matrixData={rendererRef.current.getMatrixFrame(currentTime, matrixConfig)}
                        rows={matrixConfig.rows}
                        cols={matrixConfig.cols}
                        layoutData={layoutData}
                        showGroundLight={showGroundLight}
                        lightGroups={project.lightGroups}
                        selectedCars={selectedCars}
                        onSelectionChange={setSelectedCars}
                        fitTrigger={fitTrigger2D}
                        updateTrigger={currentTime}
                    />
                </div>

                <div className="palette-panel">
                    <ClipPalette
                        palette={project.palette}
                        clipboard={clipboard}
                        assets={project.assets}
                        selectedClipId={selectedPaletteClipId}
                        onClipSelect={handlePaletteClipSelect}
                        onPaletteChange={(newPalette) => {
                            const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
                            newProject.palette = newPalette;
                            setProject(newProject);
                        }}
                    />
                </div>

                <div className="properties-panel">
                    {(selectedClips.length > 0 || selectedPaletteClip) ? (
                        <ClipEditor
                            clips={selectedPaletteClip ? [selectedPaletteClip] : selectedClips}
                            onChange={handleClipUpdate}
                            onDelete={handleDelete}
                            assets={project.assets}
                            lightGroups={project.lightGroups}
                            carGroups={project.carGroups}
                            allCarsThumbnail={allCarsThumbnail}
                        />
                    ) : selectedLayerId ? (
                        <div className="p-4">
                            <h3 className="text-lg font-bold mb-4">Track: {project.layers.find(l => l.id === selectedLayerId)?.name}</h3>
                            <div className="text-sm text-gray-500 italic">Settings window is open</div>
                        </div>
                    ) : (
                        <div className="text-muted p-4">Select a track or clip to edit</div>
                    )}
                </div>
            </div>

            <div className="timeline-panel">
                <div className="timeline-controls">
                    <button onClick={togglePlay} className="btn-icon">
                        {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                    </button>
                    <button onClick={handlePlayFromBookmark} className="btn-icon" title="Play from Bookmark" disabled={bookmarks.length === 0}>
                        <PlayFromBookmarkIcon size={22} />
                    </button>
                    <button onClick={handleReset} className="btn-icon" title="Reset to Start">
                        <SkipBack size={24} />
                    </button>
                    <div className="history-controls" style={{ display: 'flex', gap: '5px', marginLeft: '10px', borderLeft: '1px solid #444', paddingLeft: '10px' }}>
                        <button onClick={handleUndo} disabled={history.length === 0} className="btn-icon" title="Undo (Ctrl+Z)">
                            <Undo size={18} />
                        </button>
                        <button onClick={handleRedo} disabled={redoStack.length === 0} className="btn-icon" title="Redo (Ctrl+Y)">
                            <Redo size={18} />
                        </button>
                        <button onClick={handleTakeSnapshot} className="btn-icon" title="Take Snapshot" style={{ marginLeft: '5px', color: '#4a90e2' }}>
                            <Camera size={18} />
                        </button>
                        <button onClick={handleRestoreSnapshot} disabled={!snapshot} className={`btn-icon ${!snapshot ? 'disabled' : ''}`} title="Restore Snapshot" style={{ color: '#e82020' }}>
                            <RotateCcw size={18} />
                        </button>
                        <button onClick={handleRemoveGaps} disabled={selectedClipIds.length < 2} className="btn-icon" title="Remove Gaps" style={{ marginLeft: '5px', color: '#ffbb00' }}>
                            <Magnet size={18} />
                        </button>
                        <button onClick={handleAlignToSnap} disabled={selectedClipIds.length === 0 || snapMode === 'off'} className="btn-icon" title="Align to Snap" style={{ marginLeft: '5px', color: '#00ccff' }}>
                            <Grid size={18} />
                        </button>
                    </div>
                    <span className="time-display">{(currentTime / 1000).toFixed(2)}s</span>

                    <div className="zoom-control" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '20px' }}>
                        <span style={{ fontSize: '12px', color: '#666' }}>Zoom:</span>
                        <input
                            type="range"
                            min="10"
                            max="200"
                            value={zoom}
                            onChange={(e) => setZoom(parseInt(e.target.value))}
                            style={{ width: '100px' }}
                        />
                    </div>

                    <div className="snap-control" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '20px' }}>
                        <span style={{ fontSize: '12px', color: '#666' }}>Snap:</span>
                        <select
                            value={snapMode}
                            onChange={(e) => setSnapMode(e.target.value)}
                            style={{
                                background: '#333',
                                border: '1px solid #444',
                                color: 'white',
                                padding: '2px 5px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                cursor: 'pointer'
                            }}
                        >
                            <option value="1">1 Beat</option>
                            <option value="1/2">1/2 Beat</option>
                            <option value="1/4">1/4 Beat</option>
                            <option value="1/8">1/8 Beat</option>
                            <option value="off">Off</option>
                        </select>
                    </div>

                    <div className="bpm-control" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '20px' }}>
                        <span style={{ fontSize: '12px', color: '#666' }}>BPM:</span>
                        <input
                            type="number"
                            value={bpm}
                            onChange={(e) => setBpm(e.target.value)}
                            onBlur={(e) => handleBpmChange(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleBpmChange(e.target.value)}
                            style={{
                                width: '50px',
                                background: '#333',
                                border: '1px solid #444',
                                color: 'white',
                                padding: '2px 5px',
                                borderRadius: '4px',
                                fontSize: '12px'
                            }}
                        />
                    </div>

                    <div className="jitter-control" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '20px' }}>
                        <span style={{ fontSize: '12px', color: '#666' }}>Jitter:</span>
                        <input
                            type="number"
                            value={project.jitter || 0}
                            onChange={e => {
                                const val = parseInt(e.target.value) || 0;
                                const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
                                newProject.jitter = val;
                                setProject(newProject);
                                rendererRef.current.setProject(newProject);
                            }}
                            style={{
                                width: '50px',
                                background: '#333',
                                border: '1px solid #444',
                                color: 'white',
                                padding: '2px 5px',
                                borderRadius: '4px',
                                fontSize: '12px'
                            }}
                            min="0"
                            title="Jitter (ms)"
                        />
                        <span style={{ fontSize: '11px', color: '#666' }}>ms</span>
                    </div>
                    <div className="control-group" style={{ marginLeft: '20px', display: 'flex', gap: '5px' }}>
                        <button onClick={handleAddTrack} className="btn-icon" title="Add Track">
                            <Layers size={20} /> <Plus size={10} style={{ marginLeft: -8, marginBottom: 8 }} />
                        </button>
                        <button onClick={() => handleAddClip('effect')} className="btn-icon" title="Add Effect at Cursor" style={{ color: '#e82020' }}>
                            <Zap size={20} /> Effect
                        </button>
                        <button onClick={() => handleAddClip('gif')} className="btn-icon" title="Add GIF at Cursor" style={{ color: '#4a90e2' }}>
                            <ImageIcon size={20} /> GIF
                        </button>
                        <button onClick={() => setShowHelpModal(true)} className="btn-icon" title="Help / Shortcuts" style={{ marginLeft: '10px', color: '#888' }}>
                            <HelpCircle size={20} />
                        </button>
                    </div>
                </div>

                <div className="timeline-tracks-container">
                    <Timeline
                        project={project}
                        currentTime={currentTime}
                        duration={project.duration || 60000}
                        zoom={zoom}
                        snapMode={snapMode}
                        bpm={bpm}
                        onZoomChange={setZoom}
                        selectedClipIds={selectedClipIds}
                        selectedLayerId={selectedLayerId}
                        onClipSelect={handleClipSelect}
                        onLayerSelect={setSelectedLayerId}
                        onLayerDoubleClick={() => setActiveModal('trackProperties')}
                        onSeek={handleSeek}
                        onProjectChange={saveToHistory}
                        bookmarks={bookmarks}
                        onToggleBookmark={handleToggleBookmark}
                        onBookmarkMove={handleBookmarkMove}
                    />
                </div>
            </div>

            {/* Modals */}
            {
                activeModal === 'lightGroups' && (
                    <Modal title="Light Group Editor" onClose={() => setActiveModal(null)}>
                        <LightGroupEditor
                            lightGroups={project.lightGroups}
                            onUpdate={(updatedGroups) => {
                                const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
                                newProject.lightGroups = updatedGroups;
                                saveToHistory(newProject);
                            }}
                        />
                    </Modal>
                )
            }

            {
                activeModal === 'trackProperties' && selectedLayerId && (
                    <Modal title="Track Properties" onClose={() => setActiveModal(null)}>
                        <TrackProperties
                            layer={project.layers.find(l => l.id === selectedLayerId)}
                            lightGroups={project.lightGroups}
                            onUpdate={(updatedLayer) => {
                                const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
                                newProject.layers = newProject.layers.map(l => l.id === updatedLayer.id ? updatedLayer : l);
                                saveToHistory(newProject);
                            }}
                        />
                    </Modal>
                )
            }

            {
                activeModal === 'carGroups' && (
                    <Modal title="Car Group Manager" onClose={() => setActiveModal(null)}>
                        <CarGroupManager
                            carGroups={project.carGroups}
                            onUpdate={(updatedGroups) => {
                                const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
                                newProject.carGroups = updatedGroups;
                                saveToHistory(newProject);
                            }}
                            onSelect={(selection) => {
                                setSelectedCars(new Set(selection));
                                setActiveModal(null);
                            }}
                        />
                    </Modal>
                )
            }

            {
                showHelpModal && (
                    <Modal title="Help & Shortcuts" onClose={() => setShowHelpModal(false)}>
                        <div className="help-content">
                            <table className="help-table">
                                <thead>
                                    <tr>
                                        <th>Category</th>
                                        <th>Shortcut</th>
                                        <th>Function</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td rowSpan="2" className="cat-cell">Playback</td>
                                        <td><kbd>Space</kbd></td>
                                        <td>Play / Pause</td>
                                    </tr>
                                    <tr>
                                        <td><kbd>Enter</kbd></td>
                                        <td>Play from Bookmark</td>
                                    </tr>
                                    <tr>
                                        <td rowSpan="5" className="cat-cell">Editing</td>
                                        <td><kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd></td>
                                        <td>Undo / Redo</td>
                                    </tr>
                                    <tr>
                                        <td className="cat-cell" style={{ borderTop: 'none', borderLeft: 'none' }}>Snapshot</td>
                                        <td colSpan="2">
                                            <div style={{ display: 'flex', gap: '15px' }}>
                                                <span><Camera size={14} style={{ verticalAlign: 'middle', marginRight: '4px', color: '#4a90e2' }} /> Take Snapshot</span>
                                                <span><RotateCcw size={14} style={{ verticalAlign: 'middle', marginRight: '4px', color: '#e82020' }} /> Restore Snapshot</span>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td><kbd>Ctrl+C</kbd> / <kbd>V</kbd> / <kbd>X</kbd></td>
                                        <td>Copy / Paste / Cut</td>
                                    </tr>
                                    <tr>
                                        <td><kbd>Ctrl+D</kbd></td>
                                        <td>Duplicate Clip</td>
                                    </tr>
                                    <tr>
                                        <td><kbd>Del</kbd> / <kbd>Backspace</kbd></td>
                                        <td>Delete Clip</td>
                                    </tr>
                                    <tr>
                                        <td><kbd>1-5</kbd>, <kbd>Q-T</kbd></td>
                                        <td>Paste from Palette Slot 1-10</td>
                                    </tr>
                                    <tr>
                                        <td rowSpan="6" className="cat-cell">Timeline</td>
                                        <td><kbd>Ctrl + Wheel</kbd></td>
                                        <td>Zoom In/Out</td>
                                    </tr>
                                    <tr>
                                        <td><kbd>Shift + Drag</kbd></td>
                                        <td>Marquee Selection</td>
                                    </tr>
                                    <tr>
                                        <td><kbd>Ctrl + Click</kbd></td>
                                        <td>Multi-select Clips</td>
                                    </tr>
                                    <tr>
                                        <td><kbd>Alt + Drag</kbd></td>
                                        <td>Duplicate selection while moving</td>
                                    </tr>
                                    <tr>
                                        <td><kbd>Shift + Wheel</kbd></td>
                                        <td>Horizontal Scroll</td>
                                    </tr>
                                    <tr>
                                        <td><kbd>Ctrl + Click</kbd></td>
                                        <td>Toggle Bookmark (in Ruler)</td>
                                    </tr>
                                </tbody>
                            </table>
                            <div className="help-extras">
                                <p><strong>Pro Tip:</strong> Click and drag bookmarks in the ruler to move them. Double-click a track header to open track-specific settings.</p>
                            </div>
                        </div>
                    </Modal>
                )
            }

            <audio
                ref={audioRef}
                src={audioUrlRef.current || null}
                onEnded={() => setIsPlaying(false)}
                onError={(e) => console.error('Audio error:', e)}
                onLoadedData={() => console.log('Audio loaded successfully')}
            />

            <style>{`
        .editor-container { display: flex; flex-direction: column; height: 100%; background: #111; color: white; margin: 0; padding: 0; }
        .editor-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 20px; background: #222; border-bottom: 1px solid #333; min-height: 42px; line-height: 1; margin: 0; }
        .editor-header h2 { line-height: 1; margin: 0; }
        .editor-main { flex: 1; display: flex; overflow: hidden; margin: 0; padding: 0; }
        .preview-panel { flex: 1 1 auto; min-width: 400px; background: #000; display: flex; align-items: center; justify-content: center; position: relative; padding: 0; margin: 0; }
        .palette-panel { flex: 0 0 280px; min-width: 230px; max-width: 350px; background: #1a1a1a; border-left: 1px solid #333; overflow-y: auto; padding: 0; margin: 0; }
        .properties-panel { flex: 0 0 350px; min-width: 280px; max-width: 400px; background: #1a1a1a; border-left: 1px solid #333; overflow-y: auto; padding: 0; margin: 0; }
        .timeline-panel { height: 350px; background: #151515; border-top: 1px solid #333; display: flex; flex-direction: column; margin: 0; padding: 0; }
        .timeline-controls { padding: 10px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #333; }
        .timeline-tracks-container { flex: 1; overflow-y: auto; position: relative; }
        .btn-tesla-sm { background: #e82020; color: white; border: none; padding: 5px 15px; border-radius: 4px; display: flex; align-items: center; gap: 5px; cursor: pointer; }
        .btn-link-small { background: transparent; border: 1px solid #444; color: #aaa; cursor: pointer; border-radius: 4px; transition: all 0.2s; }
        .btn-link-small:hover { color: white; border-color: #e82020; background: rgba(232, 32, 32, 0.1); }
        .btn-icon { background: transparent; border: none; color: white; cursor: pointer; padding: 5px; }
        .btn-icon:hover { color: #e82020; }
        .btn-icon.active { color: #e82020; }
        .btn-icon:disabled { opacity: 0.3; cursor: not-allowed; }
        .text-muted { color: #888; }
        
        .help-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
        .help-table th { text-align: left; padding: 10px; border-bottom: 2px solid #333; color: #888; font-weight: 500; }
        .help-table td { padding: 10px; border-bottom: 1px solid #222; vertical-align: middle; }
        .help-table kbd { background: #333; padding: 2px 6px; border-radius: 4px; border: 1px solid #444; font-family: monospace; font-size: 12px; color: #ef4444; }
        .cat-cell { font-weight: bold; color: #e82020; border-right: 1px solid #222; }
        .help-extras { background: rgba(232, 32, 32, 0.1); padding: 12px; border-radius: 8px; border-left: 4px solid #e82020; font-size: 13px; color: #ccc; }
        .time-display { font-family: monospace; min-width: 80px; display: inline-block; font-size: 14px; color: #ef4444; margin-left: 10px; }
      `}</style>
        </div >
    );
}

function Modal({ title, children, onClose }) {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{title}</h3>
                    <button className="modal-close" onClick={onClose}><X size={20} /></button>
                </div>
                <div className="modal-body">
                    {children}
                </div>
            </div>
            <style>{`
                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.85);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                }
                .modal-content {
                    background: #1a1a1a;
                    border: 1px solid #333;
                    border-radius: 12px;
                    width: 90%;
                    max-width: 600px;
                    max-height: 80vh;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.4);
                }
                .modal-header {
                    padding: 16px 20px;
                    border-bottom: 1px solid #333;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .modal-header h3 {
                    margin: 0;
                    font-size: 18px;
                    color: white;
                }
                .modal-close {
                    background: transparent;
                    border: none;
                    color: #888;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .modal-close:hover {
                    color: white;
                }
                .modal-body {
                    padding: 20px;
                    overflow-y: auto;
                    flex: 1;
                }
            `}</style>
        </div>
    );
}

function LightGroupEditor({ lightGroups, onUpdate }) {
    const [editingGroup, setEditingGroup] = useState(null);

    const handleAddGroup = () => {
        const name = prompt("Enter light group name:");
        if (name && !lightGroups[name]) {
            onUpdate({ ...lightGroups, [name]: { channels: [], color: '#ffffff' } });
        }
    };

    const handleDeleteGroup = (name) => {
        if (confirm(`Delete group "${name}"?`)) {
            const newGroups = { ...lightGroups };
            delete newGroups[name];
            onUpdate(newGroups);
        }
    };

    const toggleChannel = (groupName, channel) => {
        const group = lightGroups[groupName];
        const channels = group.channels || [];
        const newChannels = channels.includes(channel)
            ? channels.filter(c => c !== channel)
            : [...channels, channel].sort((a, b) => a - b);
        onUpdate({
            ...lightGroups,
            [groupName]: { ...group, channels: newChannels }
        });
    };

    const toggleChannelRange = (groupName, start, end) => {
        const group = lightGroups[groupName];
        const channels = new Set(group.channels || []);

        // Determine if we should select all or deselect all
        // Strategy: if any channel in the range is missing, select all. if all are present, deselect all.
        let allPresent = true;
        for (let i = start; i <= end; i++) {
            if (!channels.has(i)) {
                allPresent = false;
                break;
            }
        }

        if (allPresent) {
            // Deselect all in range
            for (let i = start; i <= end; i++) {
                channels.delete(i);
            }
        } else {
            // Select all in range
            for (let i = start; i <= end; i++) {
                channels.add(i);
            }
        }

        onUpdate({
            ...lightGroups,
            [groupName]: { ...group, channels: Array.from(channels).sort((a, b) => a - b) }
        });
    };

    const updateGroupColor = (name, color) => {
        onUpdate({
            ...lightGroups,
            [name]: { ...lightGroups[name], color }
        });
    };

    const handleExportLightGroups = () => {
        const dataStr = JSON.stringify(lightGroups, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        const exportFileDefaultName = 'tesla_light_groups.json';
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    };

    const handleImportLightGroups = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.readAsText(file, 'UTF-8');
            reader.onload = (readerEvent) => {
                try {
                    const content = JSON.parse(readerEvent.target.result);
                    onUpdate(content);
                } catch (err) {
                    alert('Invalid JSON file');
                }
            };
            e.target.value = ''; // Reset
        };
        input.click();
    };

    return (
        <div className="light-group-editor">
            <div className="editor-controls mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button onClick={handleAddGroup} className="btn-tesla-sm">
                    <Plus size={18} /> Add New Group
                </button>
                <div className="header-actions" style={{ display: 'flex', gap: '8px' }}>
                    <button className="import-btn" onClick={handleImportLightGroups} title="Import Light Groups">
                        <Upload size={16} style={{ marginRight: '6px' }} /> Import
                    </button>
                    <button className="export-btn" onClick={handleExportLightGroups} title="Export Light Groups">
                        <Download size={16} style={{ marginRight: '6px' }} /> Export
                    </button>
                </div>
            </div>

            <div className="groups-list">
                {Object.entries(lightGroups).map(([name, groupData]) => {
                    const channels = groupData.channels || [];
                    const color = groupData.color || '#ffffff';

                    return (
                        <div key={name} className="group-card">
                            <div className="group-header">
                                <div className="group-info">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <input
                                            type="color"
                                            value={color}
                                            onChange={(e) => updateGroupColor(name, e.target.value)}
                                            style={{
                                                width: '24px',
                                                height: '24px',
                                                border: 'none',
                                                padding: 0,
                                                background: 'none',
                                                cursor: 'pointer'
                                            }}
                                            title="Set group color"
                                        />
                                        <span className="group-name">{name}</span>
                                    </div>
                                    <span className="channel-count">{channels.length} channels</span>
                                </div>
                                <div className="group-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    {editingGroup === name && (
                                        <>
                                            <button
                                                className="btn-tesla-outline-sm"
                                                onClick={() => toggleChannelRange(name, 46, 75)}
                                                style={{ fontSize: '11px', padding: '4px 8px' }}
                                            >
                                                Left Lightbar
                                            </button>
                                            <button
                                                className="btn-tesla-outline-sm"
                                                onClick={() => toggleChannelRange(name, 76, 105)}
                                                style={{ fontSize: '11px', padding: '4px 8px' }}
                                            >
                                                Right Lightbar
                                            </button>
                                        </>
                                    )}
                                    <button
                                        className={`btn-secondary ${editingGroup === name ? 'active' : ''}`}
                                        onClick={() => setEditingGroup(editingGroup === name ? null : name)}
                                    >
                                        {editingGroup === name ? "Finish" : "Edit Channels"}
                                    </button>
                                    <button onClick={() => handleDeleteGroup(name)} className="btn-delete-plain">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>

                            {editingGroup === name && (
                                <div className="channels-grid-container">
                                    <div className="channels-grid">
                                        {Array.from({ length: 200 }).map((_, i) => (
                                            <button
                                                key={i}
                                                onClick={() => toggleChannel(name, i)}
                                                className={`channel-btn ${channels.includes(i) ? 'selected' : ''}`}
                                                title={CHANNEL_NAMES[i]}
                                            >
                                                <div className="ch-num">CH{i}</div>
                                                <div className="ch-name">{CHANNEL_NAMES[i]}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <style>{`
                .light-group-editor { color: white; }
                .btn-tesla-sm {
                    background: #e82020;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    font-weight: 500;
                    transition: background 0.2s;
                }
                .btn-tesla-sm:hover { background: #c01818; }
                .btn-tesla-outline-sm {
                    background: transparent;
                    color: #e82020;
                    border: 1px solid #e82020;
                    border-radius: 4px;
                    padding: 4px 10px;
                    font-size: 13px;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-weight: 500;
                }
                .btn-tesla-outline-sm:hover {
                    background: rgba(232, 32, 32, 0.1);
                    border-color: #ff2a2a;
                    color: #ff2a2a;
                }
                .light-group-editor .editor-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                    padding-bottom: 12px;
                    border-bottom: 1px solid #333;
                }
                .light-group-editor .editor-header h3 {
                    margin: 0;
                    font-size: 18px;
                    color: white;
                }
                .light-group-editor .header-actions {
                    display: flex;
                    gap: 8px;
                }
                .light-group-editor .export-btn,
                .light-group-editor .import-btn {
                    padding: 6px 14px;
                    border-radius: 6px;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    background: #333;
                    color: #eee;
                    border: 1px solid #444;
                    transition: all 0.2s;
                }
                .light-group-editor .export-btn:hover,
                .light-group-editor .import-btn:hover {
                    background: #444;
                    color: white;
                    border-color: #666;
                }
                .groups-list {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    margin-top: 16px;
                }
                .group-card {
                    background: #252525;
                    border: 1px solid #333;
                    border-radius: 8px;
                    overflow: hidden;
                }
                .group-header {
                    padding: 12px 16px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #2a2a2a;
                }
                .group-info { display: flex; flex-direction: column; gap: 2px; }
                .group-name { font-weight: 600; color: #e82020; font-size: 15px; }
                .channel-count { font-size: 11px; color: #888; }
                .group-actions { display: flex; gap: 8px; align-items: center; }
                .btn-secondary {
                    background: #333;
                    color: #ddd;
                    border: 1px solid #444;
                    padding: 5px 12px;
                    border-radius: 4px;
                    font-size: 12px;
                    cursor: pointer;
                }
                .btn-secondary:hover { background: #444; color: white; }
                .btn-secondary.active { background: #e82020; border-color: #e82020; color: white; }
                .btn-delete-plain {
                    background: transparent;
                    border: none;
                    color: #555;
                    cursor: pointer;
                    padding: 4px;
                }
                .btn-delete-plain:hover { color: #ef4444; }
                .channels-grid-container {
                    padding: 16px;
                    background: #111;
                    max-height: 400px;
                    overflow-y: auto;
                }
                .channels-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 6px;
                }
                .channel-btn {
                    background: #222;
                    border: 1px solid #333;
                    border-radius: 4px;
                    padding: 6px;
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    cursor: pointer;
                    transition: all 0.2s;
                    text-align: left;
                }
                .channel-btn:hover { border-color: #555; background: #2a2a2a; }
                .channel-btn.selected {
                    background: #e82020;
                    border-color: #ff4d4d;
                    box-shadow: 0 0 10px rgba(232, 32, 32, 0.4);
                }
                .ch-num { font-size: 10px; font-weight: bold; color: #888; margin-bottom: 2px; }
                .selected .ch-num { color: rgba(255,255,255,0.7); }
                .ch-name { font-size: 11px; color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
                .selected .ch-name { color: white; font-weight: 500; }
            `}</style>
        </div>
    );
}

function TrackProperties({ layer, lightGroups, onUpdate }) {
    if (!layer) return null;

    const handleUpdateMapping = (color, groupName) => {
        const updatedLayer = {
            ...layer,
            lightMapping: {
                ...layer.lightMapping,
                [color]: groupName
            }
        };
        onUpdate(updatedLayer);
    };

    return (
        <div className="track-properties">
            <div className="form-group mb-6">
                <label>Track Name</label>
                <input
                    type="text"
                    value={layer.name}
                    onChange={(e) => onUpdate({ ...layer, name: e.target.value })}
                    placeholder="Enter track name..."
                />
            </div>

            <div className="mapping-section">
                <h4>RGB Pixel Mapping</h4>
                <p className="section-desc">Map the Red, Green, and Blue channels of your images/GIFs to light groups.</p>
                <div className="mapping-grid">
                    {['R', 'G', 'B'].map(color => {
                        const labels = { R: 'Red Pixels', G: 'Green Pixels', B: 'Blue Pixels' };
                        const dotColors = { R: '#ef4444', G: '#10b981', B: '#3b82f6' };
                        return (
                            <div key={color} className="mapping-item">
                                <div className="mapping-label">
                                    <div className="channel-indicator" style={{ backgroundColor: dotColors[color] }}></div>
                                    <span>{labels[color]}</span>
                                </div>
                                <div className="mapping-select-wrapper">
                                    <select
                                        value={layer.lightMapping?.[color] || ''}
                                        onChange={(e) => handleUpdateMapping(color, e.target.value)}
                                    >
                                        <option value="">(Not Mapped)</option>
                                        {Object.keys(lightGroups).map(groupName => (
                                            <option key={groupName} value={groupName}>{groupName}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            <style>{`
                .track-properties { color: white; }
                .form-group { display: flex; flex-direction: column; gap: 8px; }
                .form-group label { font-size: 13px; color: #888; font-weight: 500; }
                .form-group input {
                    background: #2a2a2a;
                    border: 1px solid #333;
                    border-radius: 6px;
                    padding: 10px 14px;
                    color: white;
                    font-size: 15px;
                    outline: none;
                }
                .form-group input:focus { border-color: #e82020; }
                .mapping-section h4 { margin: 0 0 4px 0; font-size: 16px; color: white; }
                .section-desc { font-size: 12px; color: #666; margin: 0 0 16px 0; }
                .mapping-grid { display: flex; flex-direction: column; gap: 10px; }
                .mapping-item {
                    background: #252525;
                    border: 1px solid #333;
                    border-radius: 8px;
                    padding: 12px 16px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .mapping-label { display: flex; align-items: center; gap: 10px; }
                .channel-indicator { width: 10px; height: 10px; border-radius: 50%; }
                .mapping-label span { font-size: 14px; font-weight: 500; }
                .mapping-select-wrapper select {
                    background: #1a1a1a;
                    color: white;
                    border: 1px solid #444;
                    padding: 6px 12px;
                    border-radius: 6px;
                    font-size: 13px;
                    outline: none;
                }
                .mapping-select-wrapper select:focus { border-color: #e82020; }
            `}</style>
        </div>
    );
}

function CarGroupManager({ carGroups = [], onUpdate, onSelect }) {
    const fileInputRef = useRef(null);

    const handleDelete = (id) => {
        if (confirm('Delete this car group?')) {
            onUpdate(carGroups.filter(g => g.id !== id));
        }
    };

    const handleExport = () => {
        const data = JSON.stringify(carGroups, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `car_groups_${new Date().getTime()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const imported = JSON.parse(event.target.result);
                if (Array.isArray(imported)) {
                    // Merge or replace? Let's append with new IDs to avoid collisions
                    const merged = [...carGroups];
                    imported.forEach(g => {
                        if (g.name && g.selection) {
                            merged.push({
                                ...g,
                                id: crypto.randomUUID()
                            });
                        }
                    });
                    onUpdate(merged);
                    alert(`Imported ${imported.length} groups`);
                }
            } catch (err) {
                alert('Failed to parse car groups file');
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="car-group-manager">
            <div className="manager-toolbar mb-4">
                <button className="btn-tesla-sm" onClick={handleExport}>
                    <Download size={18} style={{ marginRight: 6 }} /> Export Groups
                </button>
                <button className="btn-secondary" onClick={() => fileInputRef.current?.click()} style={{ marginLeft: 8 }}>
                    <Upload size={18} style={{ marginRight: 6 }} /> Import Groups
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                        handleImport(e);
                        e.target.value = ''; // Reset
                    }}
                />
            </div>

            <div className="groups-grid">
                {carGroups.length === 0 && (
                    <div className="text-muted text-center p-8">No groups saved yet. Select cars and click the + button in the toolbar.</div>
                )}
                {carGroups.map(group => (
                    <div key={group.id} className="group-item-card">
                        <div className="group-thumbnail" onClick={() => onSelect(group.selection)}>
                            <img src={group.thumbnail} alt={group.name} />
                            <div className="hover-overlay">Apply Selection</div>
                        </div>
                        <div className="group-info">
                            <span className="group-name">{group.name}</span>
                            <span className="car-count">{group.selection.length} cars</span>
                            <button className="btn-delete-plain" onClick={() => handleDelete(group.id)}>
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <style>{`
                .car-group-manager { color: white; }
                .manager-toolbar { display: flex; align-items: center; margin-bottom: 20px; }
                .groups-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
                    gap: 16px;
                }
                .group-item-card {
                    background: #252525;
                    border: 1px solid #333;
                    border-radius: 8px;
                    overflow: hidden;
                    transition: transform 0.2s;
                }
                .group-item-card:hover { transform: translateY(-2px); border-color: #444; }
                .group-thumbnail {
                    aspect-ratio: 16/9;
                    background: #000;
                    position: relative;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .group-thumbnail img {
                    max-width: 100%;
                    max-height: 100%;
                    image-rendering: pixelated;
                }
                .hover-overlay {
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(232, 32, 32, 0.7);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    font-weight: 600;
                    opacity: 0;
                    transition: opacity 0.2s;
                }
                .group-thumbnail:hover .hover-overlay { opacity: 1; }
                .group-info {
                    padding: 8px 10px;
                    display: flex;
                    flex-direction: column;
                    position: relative;
                }
                .group-name { font-size: 13px; font-weight: 600; color: #eee; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 20px; }
                .car-count { font-size: 11px; color: #888; }
                .group-info .btn-delete-plain {
                    position: absolute;
                    top: 8px; right: 6px;
                    color: #444;
                }
                .group-info .btn-delete-plain:hover { color: #ef4444; }
            `}</style>
        </div>
    );
}

