import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Save, Plus, Layers, Upload, Wand2, Zap, Image as ImageIcon } from 'lucide-react';
import { ProjectState } from '../core/ProjectState';
import { ShowRenderer } from '../core/ShowRenderer';
import { Timeline } from './Timeline';
import Scene3D from './Scene3D';
import ClipEditor from './ClipEditor';
import { LayoutParser } from '../utils/LayoutParser';
import { FseqWriter } from '../utils/FseqWriter';
import { XsqWriter } from '../utils/XsqWriter';
import JSZip from 'jszip';
import MatrixPreview2D from './MatrixPreview2D';
import axios from 'axios';

export default function EditorApp({ audioFile: initialAudioFile, analysis: initialAnalysis, bundledData, onExit }) {
    const [project, setProject] = useState(new ProjectState());
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [selectedClipId, setSelectedClipId] = useState(null);
    const [selectedLayerId, setSelectedLayerId] = useState(null);
    const [matrixConfig, setMatrixConfig] = useState({ rows: 16, cols: 63 });
    const [audioFile, setAudioFile] = useState(null);
    const [audioFileName, setAudioFileName] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [zoom, setZoom] = useState(50); // pixels per second
    const [snapMode, setSnapMode] = useState('1/4'); // '1', '1/2', '1/4', '1/8', 'off'
    const [bpm, setBpm] = useState(120);
    const [clipboard, setClipboard] = useState(null);
    const [history, setHistory] = useState([]);
    const [redoStack, setRedoStack] = useState([]);

    // Layout system state
    const [layoutData, setLayoutData] = useState(null);
    const [layoutFileName, setLayoutFileName] = useState('');
    const [colSpacing, setColSpacing] = useState(2.5);
    const [rowSpacing, setRowSpacing] = useState(6);
    const [viewMode, setViewMode] = useState('2d'); // '2d' or '3d'

    const audioRef = useRef(null);
    const rendererRef = useRef(new ShowRenderer());
    const requestRef = useRef();
    const fileInputRef = useRef(null);
    const layoutInputRef = useRef(null);
    const audioUrlRef = useRef(null); // Cache audio URL

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
        const json = project.toJSON();
        const newProject = ProjectState.fromJSONSync(json);
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
                if (bundledData.colSpacing !== undefined) setColSpacing(bundledData.colSpacing);
                if (bundledData.rowSpacing !== undefined) setRowSpacing(bundledData.rowSpacing);

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
        if (audioRef.current && !audioRef.current.paused) {
            const time = audioRef.current.currentTime * 1000;
            setCurrentTime(time);
        }
        requestRef.current = requestAnimationFrame(animate);
    };

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
                    case 'c':
                        // Copy logic
                        if (selectedClipId) {
                            const foundClip = project.layers.flatMap(l => l.clips).find(c => c.id === selectedClipId);
                            if (foundClip) setClipboard({ ...foundClip });
                        }
                        break;
                    case 'v':
                        // Paste logic
                        if (clipboard) {
                            const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
                            const targetLayerId = selectedLayerId || newProject.layers[0].id;
                            const layer = newProject.layers.find(l => l.id === targetLayerId);
                            if (layer) {
                                const newClip = {
                                    ...clipboard,
                                    id: crypto.randomUUID(),
                                    startTime: currentTime
                                };
                                layer.clips.push(newClip);
                                saveToHistory(newProject);
                                setSelectedClipId(newClip.id);
                            }
                        }
                        break;
                }
            } else {
                // Non-ctrl shortcuts
                switch (e.key.toLowerCase()) {
                    case 'e':
                        handleAddClip('effect');
                        break;
                    case 'g':
                        handleAddClip('image');
                        break;
                    case ' ':
                        e.preventDefault();
                        togglePlay();
                        break;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [project, history, redoStack, selectedClipId, selectedLayerId, clipboard, currentTime]);

    useEffect(() => {
        requestRef.current = requestAnimationFrame(animate);
        return () => {
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
        };
    }, []);

    const togglePlay = () => {
        if (!audioFile) {
            alert('Please upload an audio file first');
            return;
        }

        console.log('Toggle play:', { isPlaying, hasAudioRef: !!audioRef.current, audioFile: audioFile?.name });

        if (isPlaying) {
            audioRef.current?.pause();
            setIsPlaying(false);
        } else {
            if (audioRef.current) {
                audioRef.current.play()
                    .then(() => {
                        console.log('Audio playing successfully');
                        setIsPlaying(true);
                    })
                    .catch(err => {
                        console.error('Play failed:', err);
                        alert('Failed to play audio: ' + err.message);
                    });
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

            // Get duration from audio file
            const audio = new Audio(audioUrlRef.current);
            audio.addEventListener('loadedmetadata', () => {
                const duration = audio.duration * 1000;
                project.duration = duration;
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
        const formData = new FormData();
        formData.append('audio', audioFile);

        try {
            const response = await axios.post('/analyze', formData);
            if (response.data.success) {
                project.loadAnalysis(response.data.analysis);
                setProject(Object.assign(Object.create(Object.getPrototypeOf(project)), project));
                alert('Audio analysis complete! Beat markers added to timeline.');
            }
        } catch (err) {
            alert('Analysis failed: ' + (err.response?.data?.error || err.message));
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleLayoutUpload = async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                const parsed = await LayoutParser.parseLayoutImage(file, colSpacing, rowSpacing);
                setLayoutData(parsed);
                setLayoutFileName(file.name);

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

    const handleSpacingChange = async () => {
        if (layoutData && layoutFileName) {
            // Re-parse with new spacing values
            // We need to reload the file, but we don't have it anymore
            // So just update the layout data offsets
            const updatedLayout = { ...layoutData };
            for (let r = 0; r < updatedLayout.height; r++) {
                for (let c = 0; c < updatedLayout.width; c++) {
                    const cell = updatedLayout.layout[r][c];
                    const raw = cell.raw;
                    cell.offsetX = ((raw.r - 127) / 127) * colSpacing;
                    cell.offsetY = ((raw.g - 127) / 127) * rowSpacing;
                }
            }
            setLayoutData(updatedLayout);
        }
    };

    const handleSeek = (timeMs) => {
        if (audioRef.current) {
            audioRef.current.currentTime = timeMs / 1000;
            setCurrentTime(timeMs);
        }
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

    const handleReset = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            setCurrentTime(0);
            setIsPlaying(false);
        }
    };

    const handleAddTrack = () => {
        project.addLayer(`Track ${project.layers.length + 1}`);
        const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
        setProject(newProject);
        setSelectedLayerId(newProject.layers[newProject.layers.length - 1].id);
    };

    const handleClipUpdate = (updatedClip) => {
        const json = project.toJSON();
        const newProject = ProjectState.fromJSONSync(json);
        newProject.layers.forEach(layer => {
            const idx = layer.clips.findIndex(c => c.id === updatedClip.id);
            if (idx !== -1) {
                layer.clips[idx] = updatedClip;
            }
        });
        saveToHistory(newProject);
        setSelectedClipId(updatedClip.id);
    };

    const handleClipDelete = (clipId) => {
        const json = project.toJSON();
        const newProject = ProjectState.fromJSONSync(json);
        newProject.layers.forEach(layer => {
            layer.clips = layer.clips.filter(c => c.id !== clipId);
        });
        saveToHistory(newProject);
        setSelectedClipId(null);
    };

    const handleAddClip = (type = 'effect') => {
        if (project.layers.length > 0) {
            const json = project.toJSON();
            const newProject = ProjectState.fromJSONSync(json);
            const targetLayerId = selectedLayerId || newProject.layers[0].id;
            const layer = newProject.layers.find(l => l.id === targetLayerId);

            if (layer) {
                // Smart placement logic: check for overlaps at currentTime
                let startTime = currentTime;

                // Sort clips by startTime to find the right gap
                const sortedClips = [...layer.clips].sort((a, b) => a.startTime - b.startTime);

                // Find if currentTime is inside any clip
                const overlappingClip = sortedClips.find(c =>
                    currentTime >= c.startTime && currentTime < (c.startTime + c.duration)
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
                    type: type,
                    effectType: type === 'effect' ? 'flash' : 'image',
                    channels: [0, 1, 2, 3],
                    fadeIn: 0,
                    fadeOut: 0,
                    pattern: 'uniform',
                    patternDirection: 'horizontal',
                    patternSpeed: 1.0
                };

                if (type === 'image') {
                    // Trigger image upload
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
                    };
                    input.click();
                }

                layer.clips.push(newClip);
                saveToHistory(newProject);
                setSelectedClipId(newClip.id);
            }
        }
    };

    const handleDuplicateClip = () => {
        if (!selectedClipId) return;

        const json = project.toJSON();
        const newProject = ProjectState.fromJSONSync(json);
        let sourceClip = null;
        let targetLayer = null;

        for (const layer of newProject.layers) {
            const found = layer.clips.find(c => c.id === selectedClipId);
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

            // Check for overlap at the new position and shift if necessary (simple version)
            // In a real editor, we might want to shift everything or just find the next gap

            targetLayer.clips.push(newClip);
            saveToHistory(newProject);
            setSelectedClipId(newClip.id);
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

                const content = await zip.generateAsync({ type: 'blob' });
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
                    zip.file(`${rowLetter}${colId}.fseq`, blob);
                    hasFiles = true;
                }
            }

            if (!hasFiles) {
                alert("No cars found in layout to export.");
                return;
            }

            const content = await zip.generateAsync({ type: 'blob' });
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
            alert('Failed to export light show.');
        }
    };

    let selectedClip = null;
    if (selectedClipId) {
        for (const layer of project.layers) {
            const found = layer.clips.find(c => c.id === selectedClipId);
            if (found) {
                selectedClip = found;
                break;
            }
        }
    }

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
                colSpacing,
                rowSpacing
            };

            // 1. Add project metadata
            zip.file("project.json", JSON.stringify(projectData, null, 2));

            // 2. Add audio file if exists
            if (audioFile) {
                zip.file(audioFileName || "audio.mp3", audioFile);
            }

            const content = await zip.generateAsync({ type: 'blob' });
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
            if (data.colSpacing !== undefined) setColSpacing(data.colSpacing);
            if (data.rowSpacing !== undefined) setRowSpacing(data.rowSpacing);

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
                }
            }

            console.log('Project bundle loaded');
            alert('Project bundle loaded successfully!');

        } catch (err) {
            console.error('Failed to load project bundle:', err);
            alert('Failed to load project bundle: ' + err.message);
        }
    };

    return (
        <div className="editor-container">
            <header className="editor-header">
                <h2>🎵 Light Show Editor</h2>
                <div className="actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="audio/*"
                        onChange={handleAudioUpload}
                        style={{ display: 'none' }}
                    />
                    <button
                        className="btn-icon"
                        onClick={() => fileInputRef.current?.click()}
                        title="Upload Audio"
                    >
                        <Upload size={20} />
                    </button>
                    {audioFileName && (
                        <span style={{ fontSize: '12px', color: '#888', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {audioFileName}
                        </span>
                    )}

                    <button
                        className="btn-icon"
                        onClick={handleAnalyzeAudio}
                        disabled={!audioFile || isAnalyzing}
                        title="Analyze Audio (Add Beat Markers)"
                    >
                        <Wand2 size={20} />
                    </button>

                    <button
                        className="btn-icon"
                        onClick={handleSaveProject}
                        title="Save Project"
                        style={{ borderLeft: '1px solid #444', paddingLeft: '10px' }}
                    >
                        <Save size={20} />
                    </button>

                    <label
                        className="btn-icon"
                        title="Load Project"
                        style={{ cursor: 'pointer' }}
                    >
                        <Upload size={20} />
                        <input
                            type="file"
                            accept=".ls,.json,.zip"
                            onChange={(e) => e.target.files[0] && handleLoadProject(e.target.files[0])}
                            style={{ display: 'none' }}
                        />
                    </label>

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
                        onClick={() => layoutInputRef.current?.click()}
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

                    {/* Matrix Size Controls */}
                    <div className="matrix-config" style={{ display: 'flex', alignItems: 'center', gap: '5px', borderLeft: '1px solid #444', paddingLeft: '10px' }}>
                        <span style={{ fontSize: '12px', color: '#666' }}>Grid:</span>
                        <input
                            type="number"
                            value={matrixConfig.rows}
                            onChange={e => setMatrixConfig(prev => ({ ...prev, rows: parseInt(e.target.value) || 1 }))}
                            style={{ width: '45px', background: '#333', border: '1px solid #444', color: 'white', padding: '2px 5px', borderRadius: '3px' }}
                            min="1"
                            max="50"
                            title="Rows"
                        />
                        <span style={{ color: '#666' }}>×</span>
                        <input
                            type="number"
                            value={matrixConfig.cols}
                            onChange={e => setMatrixConfig(prev => ({ ...prev, cols: parseInt(e.target.value) || 1 }))}
                            style={{ width: '45px', background: '#333', border: '1px solid #444', color: 'white', padding: '2px 5px', borderRadius: '3px' }}
                            min="1"
                            max="100"
                            title="Columns"
                        />
                    </div>

                    {/* Spacing Controls */}
                    <div className="spacing-config" style={{ display: 'flex', alignItems: 'center', gap: '5px', borderLeft: '1px solid #444', paddingLeft: '10px' }}>
                        <span style={{ fontSize: '12px', color: '#666' }}>Spacing:</span>
                        <input
                            type="number"
                            value={colSpacing}
                            onChange={e => setColSpacing(parseFloat(e.target.value) || 2.5)}
                            onBlur={handleSpacingChange}
                            style={{ width: '50px', background: '#333', border: '1px solid #444', color: 'white', padding: '2px 5px', borderRadius: '3px' }}
                            min="1"
                            max="50"
                            step="0.5"
                            title="Column Spacing (X)"
                        />
                        <span style={{ color: '#666' }}>×</span>
                        <input
                            type="number"
                            value={rowSpacing}
                            onChange={e => setRowSpacing(parseFloat(e.target.value) || 6)}
                            onBlur={handleSpacingChange}
                            style={{ width: '50px', background: '#333', border: '1px solid #444', color: 'white', padding: '2px 5px', borderRadius: '3px' }}
                            min="1"
                            max="50"
                            step="0.5"
                            title="Row Spacing (Y)"
                        />
                    </div>

                    {/* View mode toggle */}
                    <div className="view-mode-toggle" style={{ display: 'flex', background: '#333', borderRadius: '4px', padding: '2px', marginLeft: '10px' }}>
                        <button
                            className={`toggle-btn ${viewMode === '2d' ? 'active' : ''}`}
                            onClick={() => setViewMode('2d')}
                            style={{
                                padding: '4px 8px',
                                border: 'none',
                                background: viewMode === '2d' ? '#e82020' : 'transparent',
                                color: 'white',
                                borderRadius: '4px',
                                fontSize: '12px',
                                cursor: 'pointer'
                            }}
                        >2D</button>
                        <button
                            className={`toggle-btn ${viewMode === '3d' ? 'active' : ''}`}
                            onClick={() => setViewMode('3d')}
                            style={{
                                padding: '4px 8px',
                                border: 'none',
                                background: viewMode === '3d' ? '#e82020' : 'transparent',
                                color: 'white',
                                borderRadius: '4px',
                                fontSize: '12px',
                                cursor: 'pointer'
                            }}
                        >3D</button>
                    </div>
                    <div className="toolbar-group">
                        <button className="btn-secondary" onClick={handleExportXsq}>
                            <Zap size={16} style={{ marginRight: '6px' }} />
                            xLights (.xsq)
                        </button>
                        <button className="btn-primary" onClick={handleExportMatrix}>
                            <Save size={16} /> Export
                        </button>
                    </div>
                </div>
            </header>

            <div className="editor-main">
                <div className="preview-panel">
                    {viewMode === '3d' ? (
                        <Scene3D
                            key={`${matrixConfig.rows}-${matrixConfig.cols}`}
                            matrixData={rendererRef.current.getMatrixFrame(currentTime, matrixConfig)}
                            rows={matrixConfig.rows}
                            cols={matrixConfig.cols}
                            layoutData={layoutData}
                            colSpacing={colSpacing}
                            rowSpacing={rowSpacing}
                        />
                    ) : (
                        <MatrixPreview2D
                            matrixData={rendererRef.current.getMatrixFrame(currentTime, matrixConfig)}
                            rows={matrixConfig.rows}
                            cols={matrixConfig.cols}
                            layoutData={layoutData}
                        />
                    )}
                </div>

                <div className="properties-panel">
                    {selectedClipId ? (
                        <ClipEditor
                            clip={selectedClip}
                            onChange={handleClipUpdate}
                            onDelete={handleClipDelete}
                            assets={project.assets}
                        />
                    ) : (
                        <div className="text-muted p-4">Select a clip to edit</div>
                    )}
                </div>
            </div>

            <div className="timeline-panel">
                <div className="timeline-controls">
                    <button onClick={togglePlay} className="btn-icon">
                        {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                    </button>
                    <button onClick={handleReset} className="btn-icon" title="Reset to Start">
                        ⏮
                    </button>
                    <div className="history-controls" style={{ display: 'flex', gap: '5px', marginLeft: '10px' }}>
                        <button onClick={handleUndo} disabled={history.length === 0} className="btn-icon" title="Undo (Ctrl+Z)">
                            <Zap size={18} style={{ transform: 'rotate(180deg)' }} />
                        </button>
                        <button onClick={handleRedo} disabled={redoStack.length === 0} className="btn-icon" title="Redo (Ctrl+Y)">
                            <Zap size={18} />
                        </button>
                    </div>
                    <span className="time-display" style={{ marginLeft: '10px' }}>{(currentTime / 1000).toFixed(2)}s</span>

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
                    <div className="control-group" style={{ marginLeft: '20px', display: 'flex', gap: '5px' }}>
                        <button onClick={handleAddTrack} className="btn-icon" title="Add Track">
                            <Layers size={20} /> <Plus size={10} style={{ marginLeft: -8, marginBottom: 8 }} />
                        </button>
                        <button onClick={() => handleAddClip('effect')} className="btn-icon" title="Add Effect at Cursor (E)" style={{ color: '#e82020' }}>
                            <Zap size={20} /> Effect
                        </button>
                        <button onClick={() => handleAddClip('image')} className="btn-icon" title="Add GIF at Cursor (G)" style={{ color: '#4a90e2' }}>
                            <ImageIcon size={20} /> GIF
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
                        onClipSelect={setSelectedClipId}
                        selectedLayerId={selectedLayerId}
                        onLayerSelect={setSelectedLayerId}
                        onSeek={handleSeek}
                        onProjectChange={saveToHistory}
                    />
                </div>
            </div>

            <audio
                ref={audioRef}
                src={audioUrlRef.current || ''}
                onEnded={() => setIsPlaying(false)}
                onError={(e) => console.error('Audio error:', e)}
                onLoadedData={() => console.log('Audio loaded successfully')}
            />

            <style jsx>{`
        .editor-container { display: flex; flex-direction: column; height: 100vh; background: #111; color: white; }
        .editor-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 20px; background: #222; border-bottom: 1px solid #333; }
        .editor-main { flex: 1; display: flex; overflow: hidden; }
        .preview-panel { flex: 2; background: #000; display: flex; align-items: center; justify-content: center; position: relative; }
        .properties-panel { flex: 1; min-width: 300px; background: #1a1a1a; border-left: 1px solid #333; overflow-y: auto; }
        .timeline-panel { height: 300px; background: #151515; border-top: 1px solid #333; display: flex; flex-direction: column; }
        .timeline-controls { padding: 10px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #333; }
        .timeline-tracks-container { flex: 1; overflow-y: auto; position: relative; }
        .btn-tesla-sm { background: #e82020; color: white; border: none; padding: 5px 15px; border-radius: 4px; display: flex; align-items: center; gap: 5px; cursor: pointer; }
        .btn-icon { background: transparent; border: none; color: white; cursor: pointer; padding: 5px; }
        .btn-icon:hover { color: #e82020; }
        .btn-icon.active { color: #e82020; }
        .btn-icon:disabled { opacity: 0.3; cursor: not-allowed; }
        .text-muted { color: #888; }
      `}</style>
        </div>
    );
}
