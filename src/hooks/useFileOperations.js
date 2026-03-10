import JSZip from 'jszip';
import { ProjectState } from '../core/ProjectState';
import { FseqWriter } from '../utils/FseqWriter';
import { XsqWriter } from '../utils/XsqWriter';
import { AudioWaveformManager } from '../utils/AudioWaveformManager';

export function useFileOperations({
    project,
    setProject,
    rendererRef,
    matrixConfig,
    setMatrixConfig,
    audioFile,
    setAudioFile,
    audioFileName,
    setAudioFileName,
    audioUrlRef,
    audioRef,
    layoutData,
    setLayoutData,
    gridLayoutData,
    setGridLayoutData,
    bookmarks,
    setBookmarks,
    saveToHistory,
    setBpm,
    setFitTrigger2D,
    getCarFileName
}) {
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

            // 2. Add spectrogram binary data if available
            if (project.waveform && project.waveform.spectrogram) {
                const specArray = project.waveform.spectrogram;
                const totalPoints = specArray.length;
                if (totalPoints > 0) {
                    const binsPerPoint = specArray[0].length;
                    // Compression: Arrays are already normalized to Uint8 (0-255)
                    const flatSpec8 = new Uint8Array(totalPoints * binsPerPoint);
                    for (let i = 0; i < totalPoints; i++) {
                        flatSpec8.set(specArray[i], i * binsPerPoint);
                    }
                    // Save as compressed 8-bit binary buffer
                    zip.file("spectrogram.bin", flatSpec8.buffer);
                }
            }

            // 3. Add audio file if exists
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

                    // 4. Load Spectrogram binary data
                    const specFile = zip.file("spectrogram.bin");
                    if (specFile && loadedProject.waveform) {
                        try {
                            const specBuffer = await specFile.async("arraybuffer");

                            // Load directly as an 8-bit unsigned integer array
                            const flatSpec8 = new Uint8Array(specBuffer);

                            const totalPoints = loadedProject.waveform.peaks.length;
                            const binsPerPoint = flatSpec8.length / totalPoints;

                            const spectrogram = [];
                            for (let i = 0; i < totalPoints; i++) {
                                spectrogram[i] = new Uint8Array(flatSpec8.buffer, flatSpec8.byteOffset + i * binsPerPoint, binsPerPoint);
                            }

                            loadedProject.waveform.spectrogram = spectrogram;
                            console.log('Restored spectrogram from binary file');
                        } catch (err) {
                            console.error('Failed to restore spectrogram binary:', err);
                        }
                    }

                    // 5. Automatic Re-analysis if missing
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
        }
    };

    return {
        handleExportXsq,
        handleExportMatrix,
        handleExportTimeline,
        handleImportTimeline,
        handleAppendTimeline,
        handleSaveProject,
        handleLoadProject
    };
}
