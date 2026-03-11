import { useState, useRef, useEffect, useMemo } from 'react';
import { Play, Pause, Save, FolderOpen, Undo, Redo, ZoomIn, ZoomOut, SkipBack, Zap, ImageIcon, Columns, HelpCircle, Magnet, Plus, Copy, RotateCcw, Camera, Scissors, Grid, Hand, AlignLeft, Music, Car, Layers, Settings, ClipboardPaste, Download, Upload, X, Trash2, ChevronUp, ChevronDown, Activity, Volume2, VolumeX, Heart } from 'lucide-react';
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
import { AssetManager } from './AssetManager';
import { TimelineControls } from './TimelineControls';
import { useProjectHistory } from '../hooks/useProjectHistory';
import { usePlayback } from '../hooks/usePlayback';
import { useFileOperations } from '../hooks/useFileOperations';
import MatrixPreview2D from './MatrixPreview2D';
import LayoutGridEditor, { createDefaultGridData } from './LayoutGridEditor';
import { Midi } from '@tonejs/midi';
import { useStore } from '../store/useStore';
import { Modal } from './common/Modal';
import { CHANNEL_NAMES } from '../constants/channelNames';
import { useClipOperations } from '../hooks/useClipOperations';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';


const isMac = window.navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const modKey = isMac ? '⌘' : 'Ctrl';



export default function EditorApp({ audioFile: initialAudioFile, analysis: initialAnalysis, bundledData, onExit, onChangeMode }) {
    const project = useStore(state => state.project);
    const setProject = useStore(state => state.setProject);
    const selectedClipIds = useStore(state => state.selectedClipIds);
    const setSelectedClipIds = useStore(state => state.setSelectedClipIds);
    const selectedLayerId = useStore(state => state.selectedLayerId);
    const setSelectedLayerId = useStore(state => state.setSelectedLayerId);
    const matrixConfig = useStore(state => state.matrixConfig);
    const setMatrixConfig = useStore(state => state.setMatrixConfig);
    const zoom = useStore(state => state.zoom);
    const setZoom = useStore(state => state.setZoom);
    const snapMode = useStore(state => state.snapMode);
    const setSnapMode = useStore(state => state.setSnapMode);
    const bpm = useStore(state => state.bpm);
    const setBpm = useStore(state => state.setBpm);
    const volume = useStore(state => state.volume);
    const setVolume = useStore(state => state.setVolume);
    const isPlaying = useStore(state => state.isPlaying);
    const audioFile = useStore(state => state.audioFile);
    const setAudioFile = useStore(state => state.setAudioFile);
    const audioFileName = useStore(state => state.audioFileName);
    const setAudioFileName = useStore(state => state.setAudioFileName);
    const clipboard = useStore(state => state.clipboard);
    const setClipboard = useStore(state => state.setClipboard);
    const bookmarks = useStore(state => state.bookmarks);
    const setBookmarks = useStore(state => state.setBookmarks);
    const showHelpModal = useStore(state => state.showHelpModal);
    const setShowHelpModal = useStore(state => state.setShowHelpModal);
    const selectedPaletteClipId = useStore(state => state.selectedPaletteClipId);
    const setSelectedPaletteClipId = useStore(state => state.setSelectedPaletteClipId);

    const [showAssetManager, setShowAssetManager] = useState(false);
    useEffect(() => {
        console.log("showAssetManager state changed:", showAssetManager);
    }, [showAssetManager]);
    const [assetManagerMode, setAssetManagerMode] = useState('manage'); // 'manage' | 'select'
    const [assetManagerCallback, setAssetManagerCallback] = useState(null);
    const [assetManagerSelectedId, setAssetManagerSelectedId] = useState(null);

    const [timelineHeight, setTimelineHeight] = useState(350);
    const resizingTimelineRef = useRef(false);

    useEffect(() => {
        const handleGlobalMouseMove = (e) => {
            if (!resizingTimelineRef.current) return;
            const newHeight = Math.max(100, Math.min(window.innerHeight - e.clientY, window.innerHeight * 0.8));
            setTimelineHeight(newHeight);
        };
        const handleGlobalMouseUp = () => {
            if (resizingTimelineRef.current) {
                resizingTimelineRef.current = false;
                document.body.style.cursor = 'default';
                document.body.style.userSelect = 'auto';
            }
        };
        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, []);

    // Sync UI settings to localStorage is now handled by Zustand store actions
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
        }
    }, [volume]);

    // Layout system state
    const layoutData = useStore(state => state.layoutData);
    const setLayoutData = useStore(state => state.setLayoutData);
    const showGroundLight = useStore(state => state.showGroundLight);
    const setShowGroundLight = useStore(state => state.setShowGroundLight);
    const activeModal = useStore(state => state.activeModal);
    const setActiveModal = useStore(state => state.setActiveModal);
    const selectedCars = useStore(state => state.selectedCars);
    const setSelectedCars = useStore(state => state.setSelectedCars);
    const fitTrigger2D = useStore(state => state.fitTrigger2D);
    const setFitTrigger2D = useStore(state => state.setFitTrigger2D);
    const showLayoutEditor = useStore(state => state.showLayoutEditor);
    const setShowLayoutEditor = useStore(state => state.setShowLayoutEditor);
    const gridLayoutData = useStore(state => state.gridLayoutData);
    const setGridLayoutData = useStore(state => state.setGridLayoutData);

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
        history, redoStack,
        saveToHistory, handleUndo, handleRedo
    } = useProjectHistory(project, setProject, rendererRef);

    const {
        fpsDisplay,
        isAnalyzing,
        audioRef,
        audioUrlRef,
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
        const currentMs = useStore.getState().currentTime;

        const pastBookmarks = bookmarks.filter(b => b <= currentMs + 50); // small buffer
        if (pastBookmarks.length > 0) {
            targetTime = pastBookmarks[pastBookmarks.length - 1];
        }

        handleSeek(targetTime);
        if (!isPlayingRef.current) togglePlay();
    };

    const {
        handleClipSelect,
        handleDelete,
        handleClipUpdate,
        handleClipDelete,
        handlePaletteClipSelect,
        handlePasteFromPalette,
        handleAddClip,
        handleDuplicateClip,
        handleRemoveGaps,
        handleAlignToSnap,
        handleAlignClips
    } = useClipOperations({
        project,
        saveToHistory,
        selectedClipIds,
        setSelectedClipIds,
        selectedLayerId,
        selectedPaletteClipId,
        setSelectedPaletteClipId,
        snapMode,
        bpm
    });

    useKeyboardShortcuts({
        project,
        history,
        redoStack,
        selectedClipIds,
        setSelectedClipIds,
        selectedLayerId,
        clipboard,
        setClipboard,
        isPlaying,
        audioFile,
        bookmarks,
        selectedPaletteClipId,
        handleUndo,
        handleRedo,
        handleDuplicateClip,
        handleDelete,
        handleClipDelete,
        handlePasteFromPalette,
        togglePlay,
        handlePlayFromBookmark,
        saveToHistory
    });

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

    // Handle openAssetManagerForClip event from useClipOperations
    useEffect(() => {
        const handleOpenAssetManager = (event) => {
            const { clipId } = event.detail;
            setAssetManagerMode('select');
            setAssetManagerSelectedId(null);

            // Re-fetch project to ensure we modify the latest state
            setAssetManagerCallback(() => (assetId) => {
                const currentProject = useStore.getState().project;
                const newProject = Object.assign(Object.create(Object.getPrototypeOf(currentProject)), currentProject);
                let found = false;

                newProject.layers = newProject.layers.map(layer => {
                    const clonedLayer = { ...layer, clips: [...layer.clips] };
                    const clipIndex = clonedLayer.clips.findIndex(c => c.id === clipId);

                    if (clipIndex !== -1) {
                        found = true;
                        const clip = { ...clonedLayer.clips[clipIndex], assetId: assetId };

                        // Copy FPS if available
                        const asset = newProject.assets[assetId];
                        if (asset && asset.fps) {
                            clip.fps = asset.fps;
                        }

                        clonedLayer.clips[clipIndex] = clip;
                    }
                    return clonedLayer;
                });

                if (found) {
                    setProject(newProject);
                    rendererRef.current.setProject(newProject);
                    saveToHistory(newProject);
                }
            });
            setShowAssetManager(true);
        };

        window.addEventListener('openAssetManagerForClip', handleOpenAssetManager);
        return () => window.removeEventListener('openAssetManagerForClip', handleOpenAssetManager);
    }, [setProject, saveToHistory]);

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

    const onOpenAssetManager = (currentId, callback) => {
        setAssetManagerMode('select');
        setAssetManagerSelectedId(currentId);
        setAssetManagerCallback(() => callback);
        setShowAssetManager(true);
    };

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
                onOpenLibrary={() => {
                    console.log("Opening Asset Manager in manage mode");
                    setAssetManagerMode('manage');
                    setAssetManagerSelectedId(null);
                    setShowAssetManager(true);
                }}
            />

            <EditorWorkspace
                fpsDisplay={fpsDisplay}
                rendererRef={rendererRef}
                matrixConfig={matrixConfig}
                layoutData={layoutData}
                showGroundLight={showGroundLight}
                project={project}
                selectedCars={selectedCars}
                setSelectedCars={setSelectedCars}
                fitTrigger2D={fitTrigger2D}
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
                onOpenAssetManager={onOpenAssetManager}
            />

            <div
                className="timeline-resizer"
                onMouseDown={() => {
                    resizingTimelineRef.current = true;
                    document.body.style.cursor = 'row-resize';
                    document.body.style.userSelect = 'none';
                }}
            />
            <div className="timeline-panel" style={{ height: timelineHeight }}>
                <TimelineControls
                    isPlaying={isPlaying} togglePlay={togglePlay}
                    bookmarks={bookmarks} handlePlayFromBookmark={handlePlayFromBookmark}
                    handleReset={handleReset}
                    volume={volume} setVolume={setVolume}
                    history={history} handleUndo={handleUndo}
                    redoStack={redoStack} handleRedo={handleRedo}
                    selectedClipIds={selectedClipIds} handleRemoveGaps={handleRemoveGaps} handleAlignToSnap={handleAlignToSnap} snapMode={snapMode} handleAlignClips={handleAlignClips}
                    handleImportTimeline={handleImportTimeline} handleAppendTimeline={handleAppendTimeline} handleExportTimeline={handleExportTimeline}
                    zoom={zoom} setZoom={setZoom}
                    setSnapMode={setSnapMode}
                    bpm={bpm} setBpm={setBpm} handleBpmChange={handleBpmChange}
                    project={project} setProject={setProject} rendererRef={rendererRef}
                    selectedLayerId={selectedLayerId}
                    handleAddTrack={handleAddTrack} handleAddMidiTrack={handleAddMidiTrack} handleAddClip={handleAddClip} setShowHelpModal={setShowHelpModal}
                />

                <div className="timeline-tracks-container">
                    <Timeline
                        onZoomChange={setZoom}
                        onClipSelect={handleClipSelect}
                        onLayerSelect={setSelectedLayerId}
                        onLayerDoubleClick={() => setActiveModal('trackProperties')}
                        onSeek={handleSeek}
                        onProjectChange={saveToHistory}
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
        .palette-panel-collapsed { flex: 0 0 32px; background: #1a1a1a; border-left: 1px solid #333; cursor: pointer; display: flex; flex-direction: column; align-items: center; padding-top: 15px; transition: all 0.2s; overflow: hidden; }
        .palette-panel-collapsed:hover { background: #222; border-left-color: #e82020; }
        .palette-collapsed-label { writing-mode: vertical-rl; text-orientation: mixed; color: #666; font-size: 11px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; white-space: nowrap; user-select: none; }
        .palette-panel-collapsed:hover .palette-collapsed-label { color: #e82020; }
        .properties-panel { flex: 0 0 350px; min-width: 280px; max-width: 400px; background: #1a1a1a; border-left: 1px solid #333; overflow-y: auto; padding: 0; margin: 0; }
        .timeline-resizer { height: 6px; cursor: row-resize; background: transparent; transition: background 0.2s; z-index: 100; margin-bottom: -6px; position: relative; }
        .timeline-resizer:hover { background: rgba(232, 32, 32, 0.4); }
        .timeline-panel { background: #151515; border-top: 1px solid #333; display: flex; flex-direction: column; margin: 0; padding: 0; }
        .timeline-controls { padding: 2px; display: flex; align-items: center; gap: 5px; border-bottom: 1px solid #333; }
        .timeline-tracks-container { flex: 1; display: flex; flex-direction: column; position: relative; min-height: 0; }
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
        .time-display { min-width: 50px; display: inline-block; font-size: 13px; }
      `}</style>
            {showAssetManager && (
                <AssetManager
                    isOpen={showAssetManager}
                    project={project}
                    onProjectUpdate={setProject}
                    mode={assetManagerMode}
                    selectedAssetId={assetManagerSelectedId}
                    onClose={() => setShowAssetManager(false)}
                    onSelectAsset={(id) => {
                        if (assetManagerCallback) assetManagerCallback(id);
                        setShowAssetManager(false);
                    }}
                />
            )}
        </div >
    );
}


