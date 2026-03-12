import React, { useRef, useEffect } from 'react';
import { Save, FolderOpen, Grid, Car, Plus, Layers, Music, Image as ImageIcon, Eye, Monitor } from 'lucide-react';
import { getSpectrogramColor } from '../utils/colorUtils.js';
import { useStore } from '../store/useStore';

const MiniSpectrogram = ({ project }) => {
    const barsRef = useRef([]);
    const rafRef = useRef(null);

    useEffect(() => {
        const spec = project?.waveform?.spectrogram;
        const duration = project?.waveform?.duration || project?.duration || 1;
        if (!spec || spec.length === 0 || !duration) return;

        const pointsPerSecond = spec.length / (duration / 1000);

        const updateSpectrogram = () => {
            const time = window.__lightShowTime || 0;
            const index = Math.min(spec.length - 1, Math.max(0, Math.floor((time / 1000) * pointsPerSecond)));
            const currentSpec = spec[index];

            if (currentSpec && barsRef.current.length === 32) {
                for (let i = 0; i < 32; i++) {
                    const height = Math.max(5, Math.min(100, (currentSpec[i] / 255.0) * 100));
                    if (barsRef.current[i]) {
                        barsRef.current[i].style.height = `${height}% `;
                    }
                }
            }
            rafRef.current = requestAnimationFrame(updateSpectrogram);
        };

        rafRef.current = requestAnimationFrame(updateSpectrogram);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [project?.waveform?.spectrogram, project?.waveform?.duration, project?.duration]);

    if (!project?.waveform?.spectrogram) return null;

    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', height: '48px', gap: '2px', marginLeft: '10px', background: '#0002', padding: '1px' }}>
            {Array.from({ length: 32 }).map((_, i) => (
                <div
                    key={i}
                    ref={el => barsRef.current[i] = el}
                    title={`Bin ${i} `}
                    style={{
                        width: '8px',
                        height: '5%',
                        background: getSpectrogramColor(i),
                        borderRadius: '2px 2px 0 0',
                        transition: 'height 10ms linear'
                    }}
                />
            ))}
        </div>
    );
};

export function EditorToolbar({
    handleAudioPicker,
    audioFileName,
    handleLoadProject,
    handleSaveProject,
    handleSaveProjectAs,
    fileHandle,
    showLayoutEditor,
    setShowLayoutEditor,
    activeModal,
    setActiveModal,
    selectedCars,
    handleAddCarGroup,
    showGroundLight,
    setShowGroundLight,
    handleExportXsq,
    handleExportMatrix,
    project,
    onOpenLibrary
}) {
    const previewMode = useStore(state => state.previewMode);
    const setPreviewMode = useStore(state => state.setPreviewMode);

    return (
        <header className="editor-header">
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: '18px' }}>KLightshow</h2>
                <MiniSpectrogram project={project} />
            </div>
            <div className="actions" style={{ display: 'flex', gap: '4px', alignItems: 'center', position: 'relative', zIndex: 100 }}>
                <button
                    className="btn-icon"
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                        e.currentTarget.blur();
                        handleAudioPicker();
                    }}
                    title="Upload Audio"
                    style={{ color: audioFileName ? '#3b82f6' : 'inherit' }}
                >
                    <Music size={20} />
                </button>
                <button
                    className="btn-icon"
                    title="Load Project"
                    onClick={() => handleLoadProject()}
                >
                    <FolderOpen size={20} />
                </button>

                <div style={{ display: 'flex', gap: '4px', alignItems: 'center', borderLeft: '1px solid #444', paddingLeft: '10px' }}>
                    {fileHandle && (
                        <span style={{ fontSize: '11px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginLeft: '4px' }}>
                            {fileHandle.name}
                        </span>
                    )}
                    <button
                        className="btn-icon"
                        onClick={handleSaveProject}
                        title={fileHandle ? `Save to ${fileHandle.name}` : "Save Project"}
                    >
                        <Save size={20} />
                    </button>
                    <button
                        className="btn-icon"
                        onClick={handleSaveProjectAs}
                        title="Save Project As..."
                        style={{ flexDirection: 'column', height: 'auto', padding: '4px' }}
                    >
                        <Save size={20} />
                        <span style={{ fontSize: '12px', fontWeight: 'bold', lineHeight: 1 }}>+</span>
                    </button>
                </div>

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
                >
                    <Car size={20} />
                </button>

                {/* Car Group Controls */}
                <div className="car-group-controls" style={{ display: 'flex', gap: '8px', borderLeft: '1px solid #444', paddingLeft: '10px' }}>
                    <button
                        className="btn-icon"
                        title="Add Selected Cars to Group"
                        onClick={handleAddCarGroup}
                        disabled={selectedCars?.size === 0}
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

                <button
                    className="btn-icon"
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                        e.currentTarget.blur();
                        onOpenLibrary();
                    }}
                    title="Asset Manager"
                    style={{ color: '#f44', borderLeft: '1px solid #444', paddingLeft: '10px' }}
                >
                    <ImageIcon size={20} />
                </button>

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
                
                <div className="preview-mode-toggle" style={{ display: 'flex', alignItems: 'center', gap: '4px', borderLeft: '1px solid #444', paddingLeft: '10px' }}>
                    <button
                        className={`btn-icon ${previewMode === 'matrix' ? 'active' : ''}`}
                        onClick={() => setPreviewMode('matrix')}
                        title="Matrix Preview (Pixel)"
                    >
                        <Monitor size={20} />
                    </button>
                    <button
                        className={`btn-icon ${previewMode === 'car' ? 'active' : ''}`}
                        onClick={() => setPreviewMode('car')}
                        title="Car Preview (Image)"
                    >
                        <ImageIcon size={20} />
                    </button>
                </div>

                <div className="toolbar-group" style={{ display: 'flex', gap: '5px', borderLeft: '1px solid #444', paddingLeft: '12px', marginLeft: '12px' }}>
                    <button className="btn-secondary" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.currentTarget.blur(); handleExportXsq(); }} style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '6px 10px', fontSize: '14px' }}>
                        <Save size={18} />
                        .xsq
                    </button>
                    <button className="btn-secondary" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.currentTarget.blur(); handleExportMatrix(); }} style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '6px 10px', fontSize: '14px' }}>
                        <Save size={18} />
                        .fseq
                    </button>
                    <button className="btn-secondary" tabIndex={-1} onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const url = window.location.origin + '/fseq-viewer';
                            window.open(url, '_blank');
                        }} style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '6px 10px', fontSize: '14px' }}>
                        <Eye size={18} />
                        .fseq
                    </button>

                </div>
            </div>
        </header >
    );
}
