import { useState, useRef, useEffect, useMemo } from 'react';
import { Play, Pause, Save, FolderOpen, Undo, Redo, ZoomIn, ZoomOut, SkipBack, Zap, ImageIcon, Columns, HelpCircle, Magnet, Plus, Copy, RotateCcw, Camera, Scissors, Grid, Hand, AlignLeft, Music, Car, Layers, Settings, ClipboardPaste, Download, Upload, X, Trash2, ChevronUp, ChevronDown, Activity, Volume2, VolumeX } from 'lucide-react';
import { PlayFromBookmarkIcon } from './PlayFromBookmarkIcon';
import { ProjectState } from '../core/ProjectState';
import { ShowRenderer } from '../core/ShowRenderer';
import { LayoutParser } from '../utils/LayoutParser';
import { Timeline } from './Timeline';
import ClipEditor from './ClipEditor';
import ClipPalette from './ClipPalette';

import { FseqWriter } from '../utils/FseqWriter';
import { XsqWriter } from '../utils/XsqWriter';
import { AudioWaveformManager } from '../utils/AudioWaveformManager';
import JSZip from 'jszip';
import MatrixPreview2D from './MatrixPreview2D';
import LayoutGridEditor, { createDefaultGridData } from './LayoutGridEditor';
import { Midi } from '@tonejs/midi';

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

const isMac = window.navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const modKey = isMac ? '⌘' : 'Ctrl';



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
    const [volume, setVolume] = useState(() => {
        const stored = localStorage.getItem('ls_editor_volume');
        return stored !== null ? parseFloat(stored) : 1;
    });
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

    useEffect(() => {
        localStorage.setItem('ls_editor_volume', volume);
        if (audioRef.current) {
            audioRef.current.volume = volume;
        }
    }, [volume]);

    // Layout system state
    const [layoutData, setLayoutData] = useState(null);
    const [showGroundLight, setShowGroundLight] = useState(true);
    const [activeModal, setActiveModal] = useState(null); // 'lightGroups', 'trackProperties', 'carGroups'
    const [selectedCars, setSelectedCars] = useState(new Set());
    const [fitTrigger2D, setFitTrigger2D] = useState(0);
    const [showLayoutEditor, setShowLayoutEditor] = useState(false);
    const [gridLayoutData, setGridLayoutData] = useState(null);

    // Convert grid layout data to the existing layoutData format used by MatrixPreview2D and exports
    const gridDataToLayoutData = (gd) => {
        if (!gd) return null;
        const layout = [];
        for (let r = 0; r < gd.rows; r++) {
            layout[r] = [];
            for (let c = 0; c < gd.cols; c++) {
                const cell = gd.cells[r]?.[c] || { exists: true, yaw: 0 };
                layout[r][c] = {
                    exists: cell.exists,
                    offsetX: 0,
                    offsetY: 0,
                    rotation: cell.yaw || 0,
                    raw: { r: 127, g: 127, b: Math.round((cell.yaw || 0) / 360 * 255), a: cell.exists ? 255 : 0 }
                };
            }
        }
        return { width: gd.cols, height: gd.rows, layout, imageUrl: null };
    };

    // Get the car filename for a given grid position using gridLayoutData IDs
    const getCarFileName = (r, c) => {
        if (gridLayoutData) {
            const colId = gridLayoutData.colIds[c] || '';
            const rowId = gridLayoutData.rowIds[r] || '';
            return gridLayoutData.colFirst ? `${colId}${rowId}` : `${rowId}${colId}`;
        }
        // Fallback to default naming
        const rowLetter = String.fromCharCode(65 + r);
        const colId = (c + 1).toString().padStart(2, '0');
        return `${rowLetter}${colId}`;
    };

    const handleApplyGridLayout = (gd) => {
        setGridLayoutData(gd);
        const converted = gridDataToLayoutData(gd);
        setLayoutData(converted);
        const newConfig = { rows: gd.rows, cols: gd.cols };
        setMatrixConfig(newConfig);
        rendererRef.current.setMatrixMode(true, newConfig);
        setFitTrigger2D(Date.now());
    };

    const audioRef = useRef(null);
    const rendererRef = useRef(new ShowRenderer());
    const requestRef = useRef();
    const fileInputRef = useRef(null);

    const audioUrlRef = useRef(null); // Cache audio URL
    const lastTickRef = useRef(0); // For manual playback timing
    const isPlayingRef = useRef(false);
    const audioFileRef = useRef(audioFile);
    const projectRef = useRef(project);
    const currentTimeRef = useRef(currentTime);
    const animateRef = useRef();
    const [fpsDisplay, setFpsDisplay] = useState(0);

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
                if (bundledData.gridLayoutData) setGridLayoutData(bundledData.gridLayoutData);

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
                // Update clip by deeply cloning the layers to ensure state mutability
                const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
                newProject.layers = newProject.layers.map(layer => {
                    const clonedLayer = { ...layer, clips: [...layer.clips] };
                    const clipIndex = clonedLayer.clips.findIndex(c => c.id === clipId);

                    if (clipIndex !== -1) {
                        const clip = { ...clonedLayer.clips[clipIndex] };
                        if (event.detail.bandIndex !== undefined) {
                            clip.bands = [...(clip.bands || [])];
                            if (clip.bands[event.detail.bandIndex]) {
                                clip.bands[event.detail.bandIndex] = {
                                    ...clip.bands[event.detail.bandIndex],
                                    imageId: assetId
                                };
                            }
                        } else {
                            clip.assetId = assetId;
                        }
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

                        clonedLayer.clips[clipIndex] = clip;
                    }
                    return clonedLayer;
                });

                setProject(newProject);
                rendererRef.current.setProject(newProject);
                if (typeof rendererRef.current.clearCache === 'function') {
                    rendererRef.current.clearCache();
                }
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
                        pointsPerSecond: pointsPerSecond,
                        spectrogram: waveformData.spectrogram,
                        fftSampleRate: waveformData.fftSampleRate,
                        fftSize: waveformData.fftSize
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



    const handleSeek = (timeMs) => {
        if (audioFile && audioRef.current) {
            audioRef.current.currentTime = timeMs / 1000;
        }
        setCurrentTime(timeMs);
        currentTimeRef.current = timeMs;
    };

    const saveToHistory = (newState) => {
        // toJSON(false) skips expensive asset serialization (base64 PNG encoding)
        const snapshot = project.toJSON(false);
        setHistory(prev => [...prev.slice(-19), snapshot]);
        setRedoStack([]);
        // Preserve waveform (including spectrogram) which toJSON() deliberately strips
        if (project.waveform && !newState.waveform?.spectrogram) {
            newState.waveform = project.waveform;
        }
        setProject(newState);
        rendererRef.current.setProject(newState);
    };

    const handleUndo = () => {
        if (history.length === 0) return;
        const previous = history[history.length - 1];
        setRedoStack(prev => [...prev, project.toJSON(false)]);
        setHistory(prev => prev.slice(0, -1));

        const loaded = ProjectState.fromJSONSync(previous);
        // Preserve assets (not stored in lightweight history snapshots)
        loaded.assets = project.assets;
        // Preserve waveform spectrogram (stripped by toJSON)
        if (project.waveform?.spectrogram && !loaded.waveform?.spectrogram) {
            loaded.waveform = project.waveform;
        }
        setProject(loaded);
        rendererRef.current.setProject(loaded);
    };

    const handleRedo = () => {
        if (redoStack.length === 0) return;
        const next = redoStack[redoStack.length - 1];
        setHistory(prev => [...prev, project.toJSON(false)]);
        setRedoStack(prev => prev.slice(0, -1));

        const loaded = ProjectState.fromJSONSync(next);
        // Preserve assets (not stored in lightweight history snapshots)
        loaded.assets = project.assets;
        // Preserve waveform spectrogram (stripped by toJSON)
        if (project.waveform?.spectrogram && !loaded.waveform?.spectrogram) {
            loaded.waveform = project.waveform;
        }
        setProject(loaded);
        rendererRef.current.setProject(loaded);
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
            // Preserve waveform spectrogram (stripped by toJSON)
            if (project.waveform?.spectrogram && !loaded.waveform?.spectrogram) {
                loaded.waveform = project.waveform;
            }
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

    const handleAddMidiTrack = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.mid,.midi';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    const arrayBuffer = await file.arrayBuffer();
                    const midi = new Midi(arrayBuffer);

                    // Extract all notes from all tracks
                    const midiData = [];
                    midi.tracks.forEach(track => {
                        track.notes.forEach(note => {
                            midiData.push({
                                time: note.time * 1000,
                                duration: note.duration * 1000,
                                midi: note.midi,
                                name: note.name,
                                velocity: note.velocity
                            });
                        });
                    });

                    // Sort by time
                    midiData.sort((a, b) => a.time - b.time);

                    project.addMidiLayer(file.name || 'Midi Track', midiData);
                    const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
                    setProject(newProject);
                    setSelectedLayerId(newProject.layers[newProject.layers.length - 1].id);
                } catch (err) {
                    console.error("Failed to parse MIDI file:", err);
                    alert("Failed to parse MIDI file: " + err.message);
                }
            }
            e.target.value = ''; // Reset
        };
        input.click();
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
                    targetLightGroups: [],
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
                    }),
                    ...(type === 'eq' && {
                        bandCount: 1,
                        bands: [{ minFreq: 20, maxFreq: 20000, maxScale: 1.0, minCutoff: 0, imageId: null }],
                        peakHold: false,
                        decay: 0.1,
                        updateInterval: 40
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

        let changed = false;

        newProject.layers.forEach(layer => {
            const selectedInLayer = layer.clips
                .filter(c => selectedClipIds.includes(c.id))
                .sort((a, b) => a.startTime - b.startTime);

            if (selectedInLayer.length >= 2) {
                for (let i = 1; i < selectedInLayer.length; i++) {
                    const prev = selectedInLayer[i - 1];
                    const current = selectedInLayer[i];
                    const nextStartTime = prev.startTime + prev.duration;

                    if (Math.abs(current.startTime - nextStartTime) > 0.1) {
                        current.startTime = nextStartTime;
                        changed = true;
                    }
                }
            }
        });

        if (changed) {
            saveToHistory(newProject);
        }
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

    const handleAlignClips = () => {
        if (selectedClipIds.length === 0) return;

        const json = project.toJSON(false);
        const newProject = ProjectState.fromJSONSync(json);
        newProject.assets = project.assets;

        // Group selected clips by layer
        const selectionByLayer = new Map();
        let globalMin = Infinity;

        newProject.layers.forEach(layer => {
            const selectedInLayer = layer.clips.filter(c => selectedClipIds.includes(c.id));
            if (selectedInLayer.length > 0) {
                selectionByLayer.set(layer.id, selectedInLayer);
                selectedInLayer.forEach(c => {
                    if (c.startTime < globalMin) globalMin = c.startTime;
                });
            }
        });

        if (globalMin === Infinity) return;

        let changed = false;
        selectionByLayer.forEach((clips, layerId) => {
            // Find the earliest selected clip in this layer
            const layerMin = Math.min(...clips.map(c => c.startTime));
            const offset = globalMin - layerMin;

            if (Math.abs(offset) > 0.1) {
                clips.forEach(c => {
                    c.startTime += offset;
                });
                changed = true;
            }
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

                        const carName = getCarFileName(r, c);
                        const xml = writer.createXsq(frames, {
                            song: `${audioFileName} - ${carName}`,
                            author: 'Lightshow Generator'
                        });
                        zip.file(`${carName}.xsq`, xml);
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

            // Count total cars to process
            let totalCars = 0;
            for (let r = 0; r < gridSize.rows; r++) {
                for (let c = 0; c < gridSize.cols; c++) {
                    const cell = layoutData?.layout?.[r]?.[c];
                    if (layoutData && cell && !cell.exists) continue;
                    totalCars++;
                }
            }
            console.log(`[FSEQ Export] Starting: ${totalCars} cars, ${frameCount} frames (${(durationMs / 1000).toFixed(1)}s), ${gridSize.rows}×${gridSize.cols} grid`);
            const exportStartTime = performance.now();
            let carIndex = 0;

            // Process each car in the grid
            for (let r = 0; r < gridSize.rows; r++) {
                for (let c = 0; c < gridSize.cols; c++) {
                    // Check if car exists in layout
                    const cell = layoutData?.layout?.[r]?.[c];
                    if (layoutData && cell && !cell.exists) continue;

                    const carStartTime = performance.now();
                    const frames = [];
                    for (let f = 0; f < frameCount; f++) {
                        const timeMs = f * 20;
                        const frame = rendererRef.current.getFrameForPosition(timeMs, r, c, gridSize);
                        frames.push(frame);
                    }

                    // Use grid layout car IDs or default naming
                    const carName = getCarFileName(r, c);
                    const blob = writer.createFseq(frames);
                    const arrayBuffer = await blob.arrayBuffer(); // Convert to ArrayBuffer for JSZip
                    zip.file(`${carName}.fseq`, arrayBuffer);
                    hasFiles = true;
                    carIndex++;
                    const carElapsed = (performance.now() - carStartTime).toFixed(0);
                    const pct = ((carIndex / totalCars) * 100).toFixed(1);
                    console.log(`[FSEQ Export] ${pct}% (${carIndex}/${totalCars}) ${carName} - ${carElapsed}ms`);
                }
            }

            if (!hasFiles) {
                alert("No cars found in layout to export.");
                return;
            }

            console.log(`[FSEQ Export] Generating ZIP...`);
            const content = await zip.generateAsync({
                type: 'blob',
                compression: "DEFLATE",
                compressionOptions: { level: 9 }
            });
            const totalElapsed = ((performance.now() - exportStartTime) / 1000).toFixed(1);
            console.log(`[FSEQ Export] Complete in ${totalElapsed}s`);
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

    const handleExportTimeline = () => {
        try {
            const timelineData = {
                version: '1.2_timeline',
                layers: project.layers,
                duration: project.duration,
                palette: project.palette,
                assets: project.serializeAssets()
            };

            const dataStr = JSON.stringify(timelineData, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `timeline_data_${new Date().getTime()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Timeline export failed:', error);
            alert('Failed to export timeline data: ' + error.message);
        }
    };

    const handleImportTimeline = (file) => {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);

                if (!data.layers || !data.version?.includes('timeline')) {
                    alert('Invalid timeline data file.');
                    return;
                }

                // Create a clone of the current project to merge into
                const newProject = ProjectState.fromJSONSync(project.toJSON(false));
                newProject.assets = project.assets; // keep existing ones temporarily

                // Deserialize and merge new assets into current project
                if (data.assets) {
                    const importedAssets = await ProjectState.deserializeAssets(data.assets);
                    newProject.assets = { ...newProject.assets, ...importedAssets };
                }

                // Overwrite purely timeline data
                newProject.layers = data.layers;
                if (data.duration) newProject.duration = data.duration;
                if (data.palette) newProject.palette = data.palette;

                saveToHistory(newProject);
                alert('Timeline data imported successfully!');

            } catch (err) {
                console.error('Timeline import failed:', err);
                alert('Failed to import timeline data: ' + err.message);
            }
        };
        reader.readAsText(file);
    };

    const handleAppendTimeline = (file) => {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);

                if (!data.layers || !data.version?.includes('timeline')) {
                    alert('Invalid timeline data file.');
                    return;
                }

                const newProject = ProjectState.fromJSONSync(project.toJSON(false));
                newProject.assets = { ...project.assets };

                // Deserialize and merge new assets
                if (data.assets) {
                    const importedAssets = await ProjectState.deserializeAssets(data.assets);
                    newProject.assets = { ...newProject.assets, ...importedAssets };
                }

                // Append layers instead of replacing
                newProject.layers = [...newProject.layers, ...data.layers];

                // Extend duration if imported data is longer
                if (data.duration && data.duration > newProject.duration) {
                    newProject.duration = data.duration;
                }

                saveToHistory(newProject);
                alert(`Appended ${data.layers.length} tracks to timeline!`);

            } catch (err) {
                console.error('Timeline append failed:', err);
                alert('Failed to append timeline data: ' + err.message);
            }
        };
        reader.readAsText(file);
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

                layoutData,
                gridLayoutData,
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
            if (data.gridLayoutData) setGridLayoutData(data.gridLayoutData);

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
                    if (!loadedProject.waveform || !loadedProject.waveform.spectrogram || !loadedProject.analysis?.beat_times) {
                        console.log('Missing waveform, spectrogram, or beat data, starting automatic re-analysis...');
                        try {
                            const pointsPerSecond = loadedProject.waveform?.pointsPerSecond || 100;
                            const waveformData = await AudioWaveformManager.generateWaveform(audioFileObj, pointsPerSecond);
                            loadedProject.waveform = {
                                peaks: waveformData.peaks,
                                pointsPerSecond: pointsPerSecond,
                                spectrogram: waveformData.spectrogram,
                                fftSampleRate: waveformData.fftSampleRate,
                                fftSize: waveformData.fftSize
                            };

                            if (!loadedProject.analysis?.beat_times) {
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
                            }

                            // Update project state after analysis
                            const updatedProject = Object.assign(Object.create(Object.getPrototypeOf(loadedProject)), loadedProject);
                            setProject(updatedProject);
                            if (rendererRef.current) {
                                rendererRef.current.setProject(updatedProject);
                                if (typeof rendererRef.current.clearCache === 'function') {
                                    rendererRef.current.clearCache();
                                }
                            }
                            console.log('Automatic re-analysis completed');
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

                    <button
                        className={`btn-icon ${showLayoutEditor ? 'active' : ''}`}
                        tabIndex={-1}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                            e.currentTarget.blur();
                            setShowLayoutEditor(true);
                        }}
                        title="Layout Grid Editor"
                        style={{ borderLeft: '1px solid #444', paddingLeft: '10px' }}
                    >
                        <Grid size={20} />
                    </button>

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
                <div className="preview-panel" style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 4, left: 8, background: 'rgba(0,0,0,0.7)', color: '#0f0', fontSize: '11px', fontFamily: 'monospace', padding: '2px 6px', borderRadius: '3px', zIndex: 20, pointerEvents: 'none' }}>
                        {fpsDisplay} FPS
                    </div>
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
                            key={selectedPaletteClip ? selectedPaletteClipId : selectedClipIds.join(',')}
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

                    <div className="volume-control" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '10px', background: '#222', padding: '2px 8px', borderRadius: '15px', border: '1px solid #333' }}>
                        <button onClick={() => setVolume(v => v > 0 ? 0 : 1)} className="btn-icon" style={{ padding: '2px', color: volume === 0 ? '#888' : '#e2e8f0' }} title="Mute/Unmute">
                            {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                        </button>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={volume}
                            onChange={(e) => setVolume(parseFloat(e.target.value))}
                            style={{ width: '60px', height: '4px' }}
                            title="Volume"
                        />
                    </div>

                    <div className="history-controls" style={{ display: 'flex', gap: '5px', marginLeft: '10px', borderLeft: '1px solid #444', paddingLeft: '10px' }}>
                        <button onClick={handleUndo} disabled={history.length === 0} className="btn-icon" title="Undo (Ctrl+Z)">
                            <Undo size={18} />
                        </button>
                        <button onClick={handleRedo} disabled={redoStack.length === 0} className="btn-icon" title="Redo (Ctrl+Y)">
                            <Redo size={18} />
                        </button>

                        <div style={{ width: '1px', height: '20px', background: '#444', margin: '0 5px', alignSelf: 'center' }} />

                        <button onClick={handleTakeSnapshot} className="btn-icon" title="Take Snapshot" style={{ marginLeft: '5px', color: '#4a90e2' }}>
                            <Camera size={18} />
                        </button>
                        <button onClick={handleRestoreSnapshot} disabled={!snapshot} className={`btn-icon ${!snapshot ? 'disabled' : ''}`} title="Restore Snapshot" style={{ color: '#e82020' }}>
                            <RotateCcw size={18} />
                        </button>

                        <div style={{ width: '1px', height: '20px', background: '#444', margin: '0 5px', alignSelf: 'center' }} />

                        <button onClick={handleRemoveGaps} disabled={selectedClipIds.length < 2} className="btn-icon" title="Remove Gaps" style={{ marginLeft: '5px', color: '#ffbb00' }}>
                            <Magnet size={18} />
                        </button>
                        <button onClick={handleAlignToSnap} disabled={selectedClipIds.length === 0 || snapMode === 'off'} className="btn-icon" title="Align to Snap" style={{ marginLeft: '5px', color: '#00ccff' }}>
                            <Grid size={18} />
                        </button>
                        <button onClick={handleAlignClips} disabled={selectedClipIds.length === 0} className="btn-icon" title="Align Tracks" style={{ marginLeft: '5px', color: '#00ff88' }}>
                            <AlignLeft size={18} />
                        </button>

                        <div style={{ width: '1px', height: '20px', background: '#444', margin: '0 5px', alignSelf: 'center' }} />

                        <label className="btn-icon" title="Import Timeline Data" style={{ marginLeft: '5px', color: '#ff77aa', cursor: 'pointer' }}>
                            <Upload size={18} />
                            <input
                                type="file"
                                accept=".json"
                                onChange={(e) => {
                                    if (e.target.files[0]) {
                                        handleImportTimeline(e.target.files[0]);
                                    }
                                    e.target.value = '';
                                }}
                                style={{ display: 'none' }}
                            />
                        </label>
                        <label className="btn-icon" title="Append To Timeline Data" style={{ marginLeft: '5px', color: '#ffaa44', cursor: 'pointer' }}>
                            <Plus size={18} />
                            <input
                                type="file"
                                accept=".json"
                                onChange={(e) => {
                                    if (e.target.files[0]) {
                                        handleAppendTimeline(e.target.files[0]);
                                    }
                                    e.target.value = '';
                                }}
                                style={{ display: 'none' }}
                            />
                        </label>
                        <button onClick={handleExportTimeline} className="btn-icon" title="Export Timeline Data" style={{ marginLeft: '5px', color: '#ff77aa' }}>
                            <Download size={18} />
                        </button>

                        <div style={{ width: '1px', height: '20px', background: '#444', margin: '0 5px', alignSelf: 'center' }} />
                    </div>
                    <span className="time-display">{(currentTime / 1000).toFixed(2)}s</span>

                    <div className="zoom-control" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '0px' }}>
                        <span style={{ fontSize: '12px', color: '#666' }}>Zoom:</span>
                        <input
                            type="range"
                            min="10"
                            max="200"
                            value={zoom}
                            onChange={(e) => setZoom(parseInt(e.target.value))}
                            style={{ width: '80px' }}
                        />
                    </div>

                    <div className="snap-control" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '0px' }}>
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

                    <div className="bpm-control" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '0px' }}>
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

                    <div className="jitter-control" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '0px' }}>
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
                        <div style={{ display: 'flex', borderRight: '1px solid #333', paddingRight: '10px', marginRight: '5px' }}>
                            <button
                                onClick={() => {
                                    if (!selectedLayerId) return;
                                    const index = project.layers.findIndex(l => l.id === selectedLayerId);
                                    if (index > 0) {
                                        const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
                                        const temp = newProject.layers[index];
                                        newProject.layers[index] = newProject.layers[index - 1];
                                        newProject.layers[index - 1] = temp;
                                        setProject(newProject);
                                        rendererRef.current.setProject(newProject);
                                    }
                                }}
                                className="btn-icon"
                                title="Move Track Up"
                                disabled={!selectedLayerId || project.layers.findIndex(l => l.id === selectedLayerId) <= 0}
                                style={{ color: (!selectedLayerId || project.layers.findIndex(l => l.id === selectedLayerId) <= 0) ? '#444' : '#fff' }}
                            >
                                <ChevronUp size={20} />
                            </button>
                            <button
                                onClick={() => {
                                    if (!selectedLayerId) return;
                                    const index = project.layers.findIndex(l => l.id === selectedLayerId);
                                    if (index !== -1 && index < project.layers.length - 1) {
                                        const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
                                        const temp = newProject.layers[index];
                                        newProject.layers[index] = newProject.layers[index + 1];
                                        newProject.layers[index + 1] = temp;
                                        setProject(newProject);
                                        rendererRef.current.setProject(newProject);
                                    }
                                }}
                                className="btn-icon"
                                title="Move Track Down"
                                disabled={!selectedLayerId || project.layers.findIndex(l => l.id === selectedLayerId) >= project.layers.length - 1}
                                style={{ color: (!selectedLayerId || project.layers.findIndex(l => l.id === selectedLayerId) >= project.layers.length - 1) ? '#444' : '#fff' }}
                            >
                                <ChevronDown size={20} />
                            </button>
                        </div>
                        <button onClick={handleAddTrack} className="btn-icon" title="Add Track">
                            <Layers size={20} /> <Plus size={10} style={{ marginLeft: -8, marginBottom: 8 }} />
                        </button>
                        <button onClick={handleAddMidiTrack} className="btn-icon" title="Add Midi Track" style={{ color: '#a020f0' }}>
                            <Music size={20} /> <Plus size={10} style={{ marginLeft: -8, marginBottom: 8 }} />
                        </button>
                        <button onClick={() => handleAddClip('effect')} className="btn-icon" title="Add Effect at Cursor" style={{ color: '#e82020' }}>
                            <Zap size={20} /> Effect
                        </button>
                        <button onClick={() => handleAddClip('eq')} className="btn-icon" title="Add Equalizer at Cursor" style={{ color: '#6366f1' }}>
                            <Activity size={20} /> EQ
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
                activeModal === 'trackProperties' && selectedLayerId && (() => {
                    const layer = project.layers.find(l => l.id === selectedLayerId);
                    return (
                        <Modal
                            title="Track Properties"
                            onClose={() => setActiveModal(null)}
                            className={layer?.isMidi ? "modal-wide" : ""}
                        >
                            <TrackProperties
                                layer={layer}
                                lightGroups={project.lightGroups}
                                clipboard={clipboard}
                                onUpdate={(updatedLayer) => {
                                    const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
                                    newProject.layers = newProject.layers.map(l => l.id === updatedLayer.id ? updatedLayer : l);
                                    saveToHistory(newProject);
                                }}
                                assets={project.assets}
                                carGroups={project.carGroups}
                                allCarsThumbnail={allCarsThumbnail}
                            />
                        </Modal>
                    );
                })()
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
                    <Modal
                        title="Help & Shortcuts"
                        onClose={() => setShowHelpModal(false)}
                        footer={
                            < div className="help-footer-content" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px' }}>
                                <div className="help-contact" style={{ flex: 1, textAlign: 'left', fontSize: '12px', color: '#ccc', lineHeight: '1.4' }}>
                                    <span style={{ fontWeight: 'bold', color: 'white', display: 'block', marginBottom: '4px' }}>Bug Report & Inquiries</span>
                                    X: <a href="https://x.com/mikiglico" target="_blank" rel="noopener noreferrer" style={{ color: '#4a90e2', textDecoration: 'none' }}>@mikiglico</a> |
                                    Email: <a href="mailto:junghun.cha@gmail.com" style={{ color: '#4a90e2', textDecoration: 'none' }}>junghun.cha@gmail.com</a>
                                </div>
                                <div className="help-donation">
                                    <a
                                        href="https://buymeacoffee.com/lightstory"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ color: '#ffdd00', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 'bold', background: 'rgba(255,221,0,0.1)', padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(255,221,0,0.2)' }}
                                    >
                                        <Heart size={18} fill="#ffdd00" /> Buy me a coffee
                                    </a>
                                </div>
                            </div>
                        }
                    >
                        <div className="help-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                            <div className="help-col">
                                <table className="help-table">
                                    <thead>
                                        <tr><th colSpan="3" style={{ textAlign: 'left', color: '#888', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '1px', paddingBottom: '10px' }}>Playback & Editing</th></tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="cat-cell">Playback</td>
                                            <td><kbd>Space</kbd></td>
                                            <td>Play / Pause</td>
                                        </tr>
                                        <tr>
                                            <td className="cat-cell"></td>
                                            <td><kbd>Enter</kbd></td>
                                            <td>Play Bookmark</td>
                                        </tr>
                                        <tr>
                                            <td className="cat-cell">Editing</td>
                                            <td><kbd>{modKey}+Z/Y</kbd></td>
                                            <td>Undo / Redo</td>
                                        </tr>
                                        <tr>
                                            <td className="cat-cell"></td>
                                            <td><kbd>{modKey}+C/V/X</kbd></td>
                                            <td>Copy/Paste/Cut</td>
                                        </tr>
                                        <tr>
                                            <td className="cat-cell"></td>
                                            <td><kbd>{modKey}+D</kbd></td>
                                            <td>Duplicate</td>
                                        </tr>
                                        <tr>
                                            <td className="cat-cell"></td>
                                            <td><kbd>Del / BS</kbd></td>
                                            <td>Delete</td>
                                        </tr>
                                    </tbody>
                                </table>

                                <div className="help-section-header" style={{ marginTop: '20px', marginBottom: '10px', color: '#888', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '1px' }}>Quick Tools</div>
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '12px', background: '#222', padding: '4px 8px', borderRadius: '4px', border: '1px solid #333' }}><Camera size={12} style={{ verticalAlign: 'middle', marginRight: '4px', color: '#4a90e2' }} /> Snapshot</span>
                                    <span style={{ fontSize: '12px', background: '#222', padding: '4px 8px', borderRadius: '4px', border: '1px solid #333' }}><RotateCcw size={12} style={{ verticalAlign: 'middle', marginRight: '4px', color: '#e82020' }} /> Restore</span>
                                    <span style={{ fontSize: '12px', background: '#222', padding: '4px 8px', borderRadius: '4px', border: '1px solid #333' }}><Magnet size={12} style={{ verticalAlign: 'middle', marginRight: '4px', color: '#ffbb00' }} /> Remove Gaps</span>
                                    <span style={{ fontSize: '12px', background: '#222', padding: '4px 8px', borderRadius: '4px', border: '1px solid #333' }}><Grid size={12} style={{ verticalAlign: 'middle', marginRight: '4px', color: '#00ccff' }} /> Snap</span>
                                    <span style={{ fontSize: '12px', background: '#222', padding: '4px 8px', borderRadius: '4px', border: '1px solid #333' }}><AlignLeft size={12} style={{ verticalAlign: 'middle', marginRight: '4px', color: '#00ff88' }} /> Align Tracks</span>
                                </div>
                            </div>

                            <div className="help-col">
                                <table className="help-table">
                                    <thead>
                                        <tr><th colSpan="3" style={{ textAlign: 'left', color: '#888', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '1px', paddingBottom: '10px' }}>Timeline Controls</th></tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="cat-cell">Zoom</td>
                                            <td><kbd>{modKey}+Wheel</kbd></td>
                                            <td>In / Out</td>
                                        </tr>
                                        <tr>
                                            <td className="cat-cell">Scroll</td>
                                            <td><kbd>Shift+Wheel</kbd></td>
                                            <td>Horizontal</td>
                                        </tr>
                                        <tr>
                                            <td className="cat-cell">Select</td>
                                            <td><kbd>Shift+Drag</kbd></td>
                                            <td>Marquee</td>
                                        </tr>
                                        <tr>
                                            <td className="cat-cell"></td>
                                            <td><kbd>{modKey}+Click</kbd></td>
                                            <td>Multi-select</td>
                                        </tr>
                                        <tr>
                                            <td className="cat-cell">Move</td>
                                            <td><kbd>{isMac ? 'Opt' : 'Alt'}+Drag</kbd></td>
                                            <td>Duplicate</td>
                                        </tr>
                                        <tr>
                                            <td className="cat-cell">Bookmark</td>
                                            <td><kbd>{modKey}+Click</kbd></td>
                                            <td>Toggle Ruler</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <style>{`
                            .help-table { width: 100%; border-collapse: collapse; }
                            .help-table td { padding: 4px 0; font-size: 13px; vertical-align: top; }
                            .help-table .cat-cell { width: 70px; color: #666; font-size: 11px; text-transform: uppercase; padding-top: 6px; }
                            .help-table kbd { 
                                background: #333; 
                                border: 1px solid #444; 
                                border-radius: 4px; 
                                padding: 2px 6px; 
                                font-size: 11px; 
                                font-family: monospace;
                                color: #eee;
                                margin-right: 8px;
                            }
                        `}</style>
                    </Modal >
                )
            }

            {showLayoutEditor && (
                <LayoutGridEditor
                    gridData={gridLayoutData || createDefaultGridData(matrixConfig.cols, matrixConfig.rows)}
                    onApply={handleApplyGridLayout}
                    onClose={() => setShowLayoutEditor(false)}
                />
            )}

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

function Modal({ title, children, onClose, footer, className = "" }) {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className={`modal-content ${className}`} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{title}</h3>
                    <button className="modal-close" onClick={onClose}><X size={20} /></button>
                </div>
                <div className="modal-body">
                    {children}
                </div>
                {footer && (
                    <div className="modal-footer">
                        {footer}
                    </div>
                )}
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
                    width: 95%;
                    max-width: 800px;
                    max-height: 90vh;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.4);
                }
                .modal-content.modal-wide {
                    max-width: 100vw;
                    width: 100vw;
                    height: 100vh;
                    max-height: 100vh;
                    border-radius: 0;
                    border: none;
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
                .modal-footer {
                    padding: 16px 20px;
                    border-top: 1px solid #333;
                    background: #222;
                    border-bottom-left-radius: 12px;
                    border-bottom-right-radius: 12px;
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

function TrackProperties({ layer, lightGroups, clipboard, onUpdate, assets, carGroups, allCarsThumbnail }) {
    const [selectedNote, setSelectedNote] = useState(null);
    const [selectedNoteIndex, setSelectedNoteIndex] = useState(0);

    const playNote = (midiNumber, durationMs = 200) => {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            // MIDI to Frequency: 440 * 2^((d-69)/12)
            const frequency = 440 * Math.pow(2, (midiNumber - 69) / 12);
            osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);

            // Simple synth envelope
            gain.gain.setValueAtTime(0, audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.05);
            gain.gain.setValueAtTime(0.5, audioCtx.currentTime + (durationMs / 1000) - 0.05);
            gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + (durationMs / 1000));

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start();
            osc.stop(audioCtx.currentTime + (durationMs / 1000));

            // Cleanup context after play
            setTimeout(() => {
                if (audioCtx.state !== 'closed') {
                    audioCtx.close();
                }
            }, durationMs + 100);
        } catch (e) {
            console.warn("AudioContext playback failed", e);
        }
    };

    if (!layer) return null;

    return (
        <div className="track-properties" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="form-group mb-6">
                <label>Track Name</label>
                <input
                    type="text"
                    value={layer.name}
                    onChange={(e) => onUpdate({ ...layer, name: e.target.value })}
                    placeholder="Enter track name..."
                />
            </div>

            {layer.isMidi && layer.midiData && (() => {
                const handleExportMidiMapping = () => {
                    const exportData = {
                        mappings: layer.midiMappings || {},
                        comments: layer.midiComments || {}
                    };
                    const dataStr = JSON.stringify(exportData, null, 2);
                    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
                    const exportFileDefaultName = `${layer.name || 'Midi_Track'}_Mapping.json`;
                    const linkElement = document.createElement('a');
                    linkElement.setAttribute('href', dataUri);
                    linkElement.setAttribute('download', exportFileDefaultName);
                    linkElement.click();
                };

                const handleImportMidiMapping = () => {
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
                                onUpdate({
                                    ...layer,
                                    midiMappings: content.mappings || content, // Try to support older direct mapping exports if any
                                    midiComments: content.comments || {}
                                });
                            } catch (err) {
                                alert('Invalid JSON file');
                            }
                        };
                        e.target.value = ''; // Reset
                    };
                    input.click();
                };

                return (
                    <div className="midi-mapping-section" style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h4>Midi Note Mapping</h4>
                                <p className="section-desc">Assign copied FX clips to specific MIDI notes, then tweak them on the right.</p>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn-link-small" onClick={handleImportMidiMapping} title="Import Mapping" style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}>
                                    <Upload size={14} /> Import
                                </button>
                                <button className="btn-link-small" onClick={handleExportMidiMapping} title="Export Mapping" style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}>
                                    <Download size={14} /> Export
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '20px', alignItems: 'stretch', marginTop: '12px', flex: 1, minHeight: 0 }}>
                            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px' }} className="custom-scrollbar">
                                {(() => {
                                    const uniqueNotes = [...new Set(layer.midiData.map(n => n.midi))].sort((a, b) => a - b);

                                    // Calculate maximum time in track for timeline scale
                                    let maxEndTime = 1000; // minimum 1 sec scale
                                    layer.midiData.forEach(n => {
                                        const end = n.time + n.duration;
                                        if (end > maxEndTime) maxEndTime = end;
                                    });

                                    return uniqueNotes.map(noteNumber => {
                                        const noteName = layer.midiData.find(n => n.midi === noteNumber)?.name || `Note ${noteNumber}`;
                                        const noteOccurrences = layer.midiData.filter(n => n.midi === noteNumber);
                                        const isMapped = !!layer.midiMappings?.[noteNumber];
                                        const isSelected = selectedNote === noteNumber;
                                        return (
                                            <div key={noteNumber}
                                                onClick={() => setSelectedNote(noteNumber)}
                                                className={`midi-note-row ${isSelected ? 'selected' : ''}`}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px',
                                                    background: isSelected ? 'rgba(160, 32, 240, 0.2)' : 'transparent',
                                                    border: isSelected ? '1px solid rgba(160, 32, 240, 0.4)' : '1px solid transparent',
                                                    padding: '0px 4px',
                                                    transition: 'all 0.2s',
                                                    cursor: 'pointer'
                                                }}>
                                                <div style={{ width: '70px', color: isSelected ? '#fff' : '#ccc', fontSize: '12px', fontWeight: isSelected ? 'bold' : 'normal' }} title={noteName}>
                                                    {noteNumber} ({noteName.split('-')[0]})
                                                </div>
                                                <input
                                                    type="text"
                                                    placeholder="Comment..."
                                                    onClick={(e) => e.stopPropagation()}
                                                    value={layer.midiComments?.[noteNumber] || ''}
                                                    onChange={(e) => {
                                                        onUpdate({
                                                            ...layer,
                                                            midiComments: {
                                                                ...(layer.midiComments || {}),
                                                                [noteNumber]: e.target.value
                                                            }
                                                        });
                                                    }}
                                                    style={{ flex: 1, maxWidth: '100px', background: 'rgba(0,0,0,0.2)', border: '1px solid #444', color: '#fff', fontSize: '12px', padding: '4px 4px', outline: 'none' }}
                                                    title="Add comment for this note"
                                                />
                                                <div style={{ flex: 1, minWidth: '200px', display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                    {isMapped && (() => {
                                                        const mappingData = layer.midiMappings[noteNumber];
                                                        const mappedArray = Array.isArray(mappingData) ? mappingData : [mappingData];
                                                        return mappedArray.map((fxItem, idx) => (
                                                            <button
                                                                key={idx}
                                                                title={`Select Variation ${idx + 1}`}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedNote(noteNumber);
                                                                    setSelectedNoteIndex(idx);
                                                                }}
                                                                className={`btn-link-small`}
                                                                style={{
                                                                    padding: '4px 8px', fontSize: '11px',
                                                                    background: (isSelected && selectedNoteIndex === idx) ? '#a020f0' : 'rgba(255,255,255,0.1)',
                                                                    color: (isSelected && selectedNoteIndex === idx) ? '#fff' : '#ccc',
                                                                    border: (isSelected && selectedNoteIndex === idx) ? '1px solid #d884ff' : '1px solid #444'
                                                                }}
                                                            >
                                                                {fxItem.type === 'effect' ? (fxItem.effectType || 'FX') : 'GIF'}
                                                            </button>
                                                        ));
                                                    })()}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (clipboard && clipboard.length > 0) {
                                                                const newFxDatas = clipboard.map(clip => {
                                                                    // eslint-disable-next-line no-unused-vars
                                                                    const { id, startTime, duration, ...fxData } = clip;
                                                                    return fxData;
                                                                });

                                                                const existing = layer.midiMappings[noteNumber];
                                                                const currentArr = Array.isArray(existing) ? existing : (existing ? [existing] : []);

                                                                onUpdate({
                                                                    ...layer,
                                                                    midiMappings: {
                                                                        ...layer.midiMappings,
                                                                        [noteNumber]: [...currentArr, ...newFxDatas]
                                                                    }
                                                                });
                                                                setSelectedNote(noteNumber);
                                                                setSelectedNoteIndex(currentArr.length); // Select the first pasted one
                                                            } else {
                                                                alert('Clipboard is empty! Copy an FX first.');
                                                            }
                                                        }}
                                                        className="btn-icon"
                                                        style={{ padding: '4px', color: '#ccc', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}
                                                        title="Paste copied clip(s) as new variation"
                                                    >
                                                        <ClipboardPaste size={14} />
                                                    </button>
                                                    {isMapped && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (window.confirm(`Clear all mappings for note ${noteNumber}?`)) {
                                                                    const newMappings = { ...layer.midiMappings };
                                                                    delete newMappings[noteNumber];
                                                                    onUpdate({
                                                                        ...layer,
                                                                        midiMappings: newMappings
                                                                    });
                                                                    if (selectedNote === noteNumber) {
                                                                        setSelectedNote(null);
                                                                        setSelectedNoteIndex(0);
                                                                    }
                                                                }
                                                            }}
                                                            className="btn-icon"
                                                            style={{ padding: '4px', color: '#ef4444', background: 'rgba(239,68,68,0.1)', borderRadius: '4px', marginLeft: 'auto' }}
                                                            title="Clear all mappings for this note"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Mini Timeline Preview */}
                                                <div style={{
                                                    flex: 2,
                                                    minWidth: '200px',
                                                    height: '24px',
                                                    background: 'rgba(0,0,0,0.3)',
                                                    border: '1px solid #333',
                                                    borderRadius: '4px',
                                                    position: 'relative',
                                                    overflow: 'hidden'
                                                }}>
                                                    {noteOccurrences.map((occ, oIdx) => {
                                                        const leftPct = (occ.time / maxEndTime) * 100;
                                                        const widthPct = Math.max(0.5, (occ.duration / maxEndTime) * 100);
                                                        return (
                                                            <div
                                                                key={`prev-${noteNumber}-${oIdx}`}
                                                                onMouseDown={(e) => {
                                                                    e.stopPropagation();
                                                                    playNote(noteNumber, Math.min(1000, occ.duration || 200));
                                                                }}
                                                                style={{
                                                                    position: 'absolute',
                                                                    left: `${leftPct}%`,
                                                                    width: `${widthPct}%`,
                                                                    height: '100%',
                                                                    background: isMapped ? '#a020f0' : '#4a90e2',
                                                                    opacity: 0.8,
                                                                    borderRadius: '2px',
                                                                    cursor: 'pointer',
                                                                    border: '1px solid rgba(255,255,255,0.2)'
                                                                }}
                                                                title={`Play ${noteName} (${(occ.duration / 1000).toFixed(2)}s)`}
                                                                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                                                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>

                            {/* Editor Side Panel */}
                            <div style={{
                                width: '340px',
                                minWidth: '340px',
                                overflowY: 'auto',
                                background: '#151515',
                                borderRadius: '8px',
                                border: '1px solid #333',
                            }} className="custom-scrollbar">
                                {selectedNote ? (
                                    layer.midiMappings?.[selectedNote] ? (
                                        <div style={{ padding: '10px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '10px', marginBottom: '10px' }}>
                                                <h4 style={{ margin: 0, color: '#a020f0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Settings size={16} />
                                                    Editing Note {selectedNote}
                                                </h4>
                                            </div>
                                            {(() => {
                                                const mappingData = layer.midiMappings[selectedNote];
                                                const mappedArray = Array.isArray(mappingData) ? mappingData : [mappingData];

                                                // Ensure index is valid
                                                const activeIdx = Math.min(selectedNoteIndex, mappedArray.length - 1);
                                                if (activeIdx < 0) return null; // Shouldn't happen if mappedArray exists
                                                const fxItem = mappedArray[activeIdx];

                                                return (
                                                    <div style={{ marginBottom: '20px', padding: '10px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', border: '1px solid #444' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                                            <span style={{ fontSize: '13px', color: '#a020f0', fontWeight: 'bold' }}>Variation {activeIdx + 1} of {mappedArray.length}</span>
                                                            <button
                                                                onClick={() => {
                                                                    const currentArr = Array.isArray(layer.midiMappings[selectedNote]) ? layer.midiMappings[selectedNote] : [layer.midiMappings[selectedNote]];
                                                                    const newArr = currentArr.filter((_, i) => i !== activeIdx);

                                                                    const newMappings = { ...layer.midiMappings };
                                                                    if (newArr.length > 0) {
                                                                        newMappings[selectedNote] = newArr;
                                                                        setSelectedNoteIndex(0);
                                                                    } else {
                                                                        delete newMappings[selectedNote];
                                                                        setSelectedNote(null);
                                                                        setSelectedNoteIndex(0);
                                                                    }

                                                                    onUpdate({
                                                                        ...layer,
                                                                        midiMappings: newMappings
                                                                    });
                                                                }}
                                                                className="btn-icon"
                                                                title="Delete this FX variation"
                                                                style={{ color: '#ef4444', padding: '4px' }}
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                        <ClipEditor
                                                            clips={[{
                                                                ...fxItem,
                                                                id: `midi-${selectedNote}-${activeIdx}`,
                                                                type: fxItem.type || 'effect'
                                                            }]}
                                                            onChange={(updatedData) => {
                                                                // eslint-disable-next-line no-unused-vars
                                                                const { id, startTime, duration, ...updatedFxData } = updatedData;
                                                                const currentArr = Array.isArray(layer.midiMappings[selectedNote]) ? layer.midiMappings[selectedNote] : [layer.midiMappings[selectedNote]];
                                                                const newArr = [...currentArr];
                                                                newArr[activeIdx] = updatedFxData;

                                                                onUpdate({
                                                                    ...layer,
                                                                    midiMappings: {
                                                                        ...layer.midiMappings,
                                                                        [selectedNote]: newArr
                                                                    }
                                                                });
                                                            }}
                                                            onDelete={() => { }} // Disabled the delete call inside clipEditor to use our custom header button
                                                            assets={assets}
                                                            lightGroups={lightGroups}
                                                            carGroups={carGroups}
                                                            allCarsThumbnail={allCarsThumbnail}
                                                        />
                                                    </div>
                                                );
                                            })()}
                                            {/* Hide timing fields in clip editor as they are overridden by Midi notes */}
                                            <style>{`
                                            .midi-mapping-section .custom-number-input-container:has(label:contains("Start Time")),
                                            .midi-mapping-section .custom-number-input-container:has(label:contains("Duration")) {
                                                opacity: 0.5;
                                                pointer-events: none;
                                            }
                                            .midi-mapping-section .header { display: none; /* hide clip editor default header */ }
                                            `}</style>
                                        </div>
                                    ) : (
                                        <div style={{ padding: '20px', textAlign: 'center', color: '#666', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                            Note {selectedNote} is not mapped. Paste an FX first to edit properties.
                                        </div>
                                    )
                                ) : (
                                    <div style={{ padding: '40px 20px', textAlign: 'center', color: '#888', fontSize: '14px', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                        <div style={{ margin: '0 auto 12px auto' }}>
                                            <Settings size={32} opacity={0.3} style={{ display: 'block', margin: '0 auto' }} />
                                        </div>
                                        Select a Note row to view or edit its FX properties
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}
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
    const appendInputRef = useRef(null);
    const replaceInputRef = useRef(null);

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

    const handleImport = (e, mode) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const imported = JSON.parse(event.target.result);
                if (Array.isArray(imported)) {
                    const validGroups = imported.filter(g => g.name && g.selection).map(g => ({
                        ...g,
                        id: crypto.randomUUID()
                    }));

                    if (mode === 'replace') {
                        onUpdate(validGroups);
                        alert(`Replaced with ${validGroups.length} groups`);
                    } else {
                        onUpdate([...carGroups, ...validGroups]);
                        alert(`Appended ${validGroups.length} groups`);
                    }
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
                    <Download size={18} style={{ marginRight: 6 }} /> Export
                </button>
                <button className="btn-secondary" onClick={() => appendInputRef.current?.click()} style={{ marginLeft: 8 }}>
                    <Upload size={18} style={{ marginRight: 6 }} /> Import (Append)
                </button>
                <button className="btn-secondary" onClick={() => replaceInputRef.current?.click()} style={{ marginLeft: 4, color: '#fbbf24', borderColor: '#fbbf24' }}>
                    <Upload size={18} style={{ marginRight: 6 }} /> Import (Replace)
                </button>
                <input
                    ref={appendInputRef}
                    type="file"
                    accept=".json"
                    style={{ display: 'none' }}
                    onChange={(e) => { handleImport(e, 'append'); e.target.value = ''; }}
                />
                <input
                    ref={replaceInputRef}
                    type="file"
                    accept=".json"
                    style={{ display: 'none' }}
                    onChange={(e) => { handleImport(e, 'replace'); e.target.value = ''; }}
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

