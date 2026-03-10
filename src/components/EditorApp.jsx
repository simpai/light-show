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
import { LightGroupEditor } from './LightGroupEditor';
import { CarGroupManager } from './CarGroupManager';
import { EditorToolbar } from './EditorToolbar';
import { EditorWorkspace } from './EditorWorkspace';
import { TimelineControls } from './TimelineControls';
import { useProjectHistory } from '../hooks/useProjectHistory';
import { usePlayback } from '../hooks/usePlayback';
import { useFileOperations } from '../hooks/useFileOperations';
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
    const [selectedClipIds, setSelectedClipIds] = useState([]);
    const [selectedLayerId, setSelectedLayerId] = useState(null);
    const [matrixConfig, setMatrixConfig] = useState({ cols: 63, rows: 16 });
    const [zoom, setZoom] = useState(() => parseFloat(localStorage.getItem('ls_editor_zoom')) || 50);
    const [snapMode, setSnapMode] = useState(() => localStorage.getItem('ls_editor_snap') || '1/4');
    const [bpm, setBpm] = useState(() => parseFloat(localStorage.getItem('ls_editor_bpm')) || 120);
    const [volume, setVolume] = useState(() => {
        const stored = localStorage.getItem('ls_editor_volume');
        return stored !== null ? parseFloat(stored) : 1;
    });
    const [clipboard, setClipboard] = useState(null);
    const [bookmarks, setBookmarks] = useState([]);
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

    const rendererRef = useRef(new ShowRenderer());
    const fileInputRef = useRef(null);

    const {
        history, redoStack, snapshot,
        saveToHistory, handleUndo, handleRedo,
        handleTakeSnapshot, handleRestoreSnapshot
    } = useProjectHistory(project, setProject, rendererRef);

    const {
        isPlaying, setIsPlaying,
        currentTime, setCurrentTime,
        audioFile, setAudioFile,
        audioFileName, setAudioFileName,
        fpsDisplay,
        isAnalyzing,
        audioRef,
        audioUrlRef,
        currentTimeRef,
        togglePlay,
        handleSeek,
        handleReset,
        handleAudioUpload,
        handleAnalyzeAudio,
        isPlayingRef
    } = usePlayback(project, setProject, rendererRef, setBpm, setFitTrigger2D);

    const {
        handleExportXsq,
        handleExportMatrix,
        handleExportTimeline,
        handleImportTimeline,
        handleAppendTimeline,
        handleSaveProject,
        handleLoadProject
    } = useFileOperations({
        project, setProject,
        rendererRef, matrixConfig, setMatrixConfig,
        audioFile, setAudioFile, audioFileName, setAudioFileName,
        audioUrlRef, audioRef,
        layoutData, setLayoutData,
        gridLayoutData, setGridLayoutData,
        bookmarks, setBookmarks, saveToHistory, setBpm, setFitTrigger2D,
        getCarFileName
    });

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

    // Keyboard shortcuts
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

    // Playback functions moved to usePlayback hook

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

    // File operations moved to useFileOperations hook

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

    return (
        <div className="editor-container">
            <EditorToolbar
                fileInputRef={fileInputRef}
                handleAudioUpload={handleAudioUpload}
                audioFileName={audioFileName}
                handleLoadProject={handleLoadProject}
                handleSaveProject={handleSaveProject}
                showLayoutEditor={showLayoutEditor}
                setShowLayoutEditor={setShowLayoutEditor}
                activeModal={activeModal}
                setActiveModal={setActiveModal}
                selectedCars={selectedCars}
                handleAddCarGroup={handleAddCarGroup}
                matrixConfig={matrixConfig}
                setMatrixConfig={setMatrixConfig}
                showGroundLight={showGroundLight}
                setShowGroundLight={setShowGroundLight}
                handleExportXsq={handleExportXsq}
                handleExportMatrix={handleExportMatrix}
                project={project}
                currentTime={currentTime}
            />

            <EditorWorkspace
                fpsDisplay={fpsDisplay}
                matrixData={rendererRef.current.getMatrixFrame(currentTime, matrixConfig)}
                matrixConfig={matrixConfig}
                layoutData={layoutData}
                showGroundLight={showGroundLight}
                project={project}
                selectedCars={selectedCars}
                setSelectedCars={setSelectedCars}
                fitTrigger2D={fitTrigger2D}
                currentTime={currentTime}
                clipboard={clipboard}
                selectedPaletteClipId={selectedPaletteClipId}
                handlePaletteClipSelect={handlePaletteClipSelect}
                setProject={setProject}
                selectedClips={selectedClips}
                selectedClipIds={selectedClipIds}
                selectedPaletteClip={selectedPaletteClip}
                handleClipUpdate={handleClipUpdate}
                handleDelete={handleDelete}
                allCarsThumbnail={allCarsThumbnail}
                selectedLayerId={selectedLayerId}
            />

            <div className="timeline-panel">
                <TimelineControls
                    isPlaying={isPlaying} togglePlay={togglePlay}
                    bookmarks={bookmarks} handlePlayFromBookmark={handlePlayFromBookmark}
                    handleReset={handleReset}
                    volume={volume} setVolume={setVolume}
                    history={history} handleUndo={handleUndo}
                    redoStack={redoStack} handleRedo={handleRedo}
                    handleTakeSnapshot={handleTakeSnapshot} snapshot={snapshot} handleRestoreSnapshot={handleRestoreSnapshot}
                    selectedClipIds={selectedClipIds} handleRemoveGaps={handleRemoveGaps} handleAlignToSnap={handleAlignToSnap} snapMode={snapMode} handleAlignClips={handleAlignClips}
                    handleImportTimeline={handleImportTimeline} handleAppendTimeline={handleAppendTimeline} handleExportTimeline={handleExportTimeline}
                    currentTime={currentTime}
                    zoom={zoom} setZoom={setZoom}
                    setSnapMode={setSnapMode}
                    bpm={bpm} setBpm={setBpm} handleBpmChange={handleBpmChange}
                    project={project} setProject={setProject} rendererRef={rendererRef}
                    selectedLayerId={selectedLayerId}
                    handleAddTrack={handleAddTrack} handleAddMidiTrack={handleAddMidiTrack} handleAddClip={handleAddClip} setShowHelpModal={setShowHelpModal}
                />

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

