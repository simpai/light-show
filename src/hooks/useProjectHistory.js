import { useState } from 'react';
import { ProjectState } from '../core/ProjectState';

export function useProjectHistory(project, setProject, rendererRef) {
    const [history, setHistory] = useState([]);
    const [redoStack, setRedoStack] = useState([]);
    const [snapshot, setSnapshot] = useState(null);

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

    const handleTakeSnapshot = () => {
        const currentData = project.toJSON(false);
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

    return {
        history,
        redoStack,
        snapshot,
        saveToHistory,
        handleUndo,
        handleRedo,
        handleTakeSnapshot,
        handleRestoreSnapshot
    };
}
