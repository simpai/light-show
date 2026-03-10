import React, { useRef, useEffect } from 'react';
import { Save, FolderOpen, Grid, Car, Plus, Layers, Music } from 'lucide-react';
import { getSpectrogramColor } from '../utils/colorUtils.js';

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
        <div style={{ display: 'flex', alignItems: 'flex-end', height: '48px', gap: '2px', marginLeft: '16px', background: '#111', padding: '4px 6px', borderRadius: '6px', border: '1px solid #333' }}>
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
    fileInputRef,
    handleAudioUpload,
    audioFileName,
    handleLoadProject,
    handleSaveProject,
    showLayoutEditor,
    setShowLayoutEditor,
    activeModal,
    setActiveModal,
    selectedCars,
    handleAddCarGroup,
    matrixConfig,
    setMatrixConfig,
    showGroundLight,
    setShowGroundLight,
    handleExportXsq,
    handleExportMatrix,
    project
}) {
    return (
        <header className="editor-header">
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: '18px' }}>🎵 Light Show Editor</h2>
                <MiniSpectrogram project={project} />
            </div>
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
    );
}
