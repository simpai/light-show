import { useEffect } from 'react';
import { ProjectState } from '../core/ProjectState';
import { useStore } from '../store/useStore';

export function useKeyboardShortcuts({
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
}) {
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
                        if (selectedClipIds.length > 0) {
                            const foundClips = project.layers.flatMap(l => l.clips).filter(c => selectedClipIds.includes(c.id));
                            if (foundClips.length > 0) {
                                setClipboard(foundClips.map(c => ({ ...c })));
                                handleDelete(selectedClipIds);
                            }
                        }
                        break;
                    case 'c':
                        if (selectedClipIds.length > 0) {
                            const foundClips = project.layers.flatMap(l => l.clips).filter(c => selectedClipIds.includes(c.id));
                            if (foundClips.length > 0) {
                                setClipboard(foundClips.map(c => ({ ...c })));
                            }
                        }
                        break;
                    case 'v':
                        if (clipboard && Array.isArray(clipboard) && clipboard.length > 0) {
                            const json = project.toJSON(false);
                            const newProject = ProjectState.fromJSONSync(json);
                            newProject.assets = project.assets;

                            const earliestStart = Math.min(...clipboard.map(c => c.startTime));
                            const offset = useStore.getState().currentTime - earliestStart;

                            const newPastedIds = [];
                            clipboard.forEach(clip => {
                                let targetLayerId = selectedLayerId || newProject.layers[0].id;
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
                const key = e.key.toLowerCase();
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
    }, [
        project, history, redoStack, selectedClipIds, selectedLayerId,
        clipboard, isPlaying, audioFile, bookmarks, selectedPaletteClipId,
        handleUndo, handleRedo, handleDuplicateClip, handleDelete,
        handleClipDelete, handlePasteFromPalette, togglePlay,
        handlePlayFromBookmark, saveToHistory, setClipboard, setSelectedClipIds
    ]);
}
