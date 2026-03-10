import { useState } from 'react';
import { ProjectState } from '../core/ProjectState';

export function useProjectHistory(project, setProject, rendererRef) {
    const [history, setHistory] = useState([]);
    const [redoStack, setRedoStack] = useState([]);

    const saveToHistory = (newState) => {
        // toJSON(false) skips expensive asset serialization (base64 PNG encoding)
        const snap = project.toJSON(false);
        setHistory(prev => [...prev.slice(-19), snap]);
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

    return {
        history,
        redoStack,
        saveToHistory,
        handleUndo,
        handleRedo
    };
}
