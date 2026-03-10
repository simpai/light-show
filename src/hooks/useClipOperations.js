import { ProjectState } from '../core/ProjectState';
import { useStore } from '../store/useStore';

export function useClipOperations({
    project,
    saveToHistory,
    selectedClipIds,
    setSelectedClipIds,
    selectedLayerId,
    selectedPaletteClipId,
    setSelectedPaletteClipId,
    snapMode,
    bpm
}) {
    const handleClipSelect = (idOrIds, e) => {
        setSelectedPaletteClipId(null);
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

    const handleClipUpdate = (updatedData, field = null) => {
        const json = project.toJSON(false);
        const newProject = ProjectState.fromJSONSync(json);
        newProject.assets = project.assets;

        let found = false;

        if (selectedPaletteClipId) {
            newProject.palette.forEach(slot => {
                slot.clips = slot.clips.map(c => {
                    if (c.id === selectedPaletteClipId) {
                        found = true;
                        return updatedData;
                    }
                    return c;
                });
            });
        } else if (selectedClipIds.length > 0) {
            newProject.layers.forEach(layer => {
                layer.clips = layer.clips.map(c => {
                    if (selectedClipIds.includes(c.id)) {
                        found = true;
                        if (field) {
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
        newProject.layers.forEach(layer => {
            const initialLen = layer.clips.length;
            layer.clips = layer.clips.filter(c => !clipIdSet.has(c.id));
            if (layer.clips.length !== initialLen) changed = true;
        });

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
        setSelectedClipIds([]);
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
            }

            const earliestClip = clipsToPaste.reduce((earliest, current) =>
                current.startTime < earliest.startTime ? current : earliest, clipsToPaste[0]
            );

            const newPastedIds = [];
            clipsToPaste.forEach(clip => {
                const relativeOffset = clip.startTime - earliestClip.startTime;
                const newClip = {
                    ...clip,
                    id: crypto.randomUUID(),
                    startTime: useStore.getState().currentTime + relativeOffset
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

    const handleAddClip = (type = 'effect') => {
        if (project.layers.length > 0) {
            const json = project.toJSON(false);
            const newProject = ProjectState.fromJSONSync(json);
            newProject.assets = project.assets;
            const targetLayerId = selectedLayerId || newProject.layers[0].id;
            const layer = newProject.layers.find(l => l.id === targetLayerId);

            if (layer) {
                let startTime = useStore.getState().currentTime;
                const sortedClips = [...layer.clips].sort((a, b) => a.startTime - b.startTime);

                const overlappingClip = sortedClips.find(c =>
                    useStore.getState().currentTime >= c.startTime && useStore.getState().currentTime < (c.startTime + c.duration)
                );

                if (overlappingClip) {
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
                    channels: [],
                    targetLightGroups: [],
                    fadeIn: 0,
                    fadeOut: 0,
                    pattern: 'uniform',
                    patternDirection: 'horizontal',
                    patternSpeed: 1.0,
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
                        e.target.value = '';
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

    return {
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
    };
}
