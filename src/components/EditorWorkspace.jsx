import React from 'react';
import MatrixPreview2D from './MatrixPreview2D';
import ClipPalette from './ClipPalette';
import ClipEditor from './ClipEditor';

export function EditorWorkspace({
    fpsDisplay,
    matrixData,
    matrixConfig,
    layoutData,
    showGroundLight,
    project,
    selectedCars,
    setSelectedCars,
    fitTrigger2D,
    currentTime,
    clipboard,
    selectedPaletteClipId,
    handlePaletteClipSelect,
    setProject,
    selectedClips,
    selectedClipIds,
    selectedPaletteClip,
    handleClipUpdate,
    handleDelete,
    allCarsThumbnail,
    selectedLayerId
}) {
    return (
        <div className="editor-main">
            <div className="preview-panel" style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', top: 4, left: 8, background: 'rgba(0,0,0,0.7)', color: '#0f0', fontSize: '11px', fontFamily: 'monospace', padding: '2px 6px', borderRadius: '3px', zIndex: 20, pointerEvents: 'none' }}>
                    {fpsDisplay} FPS
                </div>
                <MatrixPreview2D
                    matrixData={matrixData}
                    rows={matrixConfig.rows}
                    cols={matrixConfig.cols}
                    layoutData={layoutData}
                    showGroundLight={showGroundLight}
                    lightGroups={project.lightGroups}
                    selectedCars={selectedCars}
                    onSelectionChange={setSelectedCars}
                    fitTrigger={fitTrigger2D}
                    updateTrigger={currentTime}
                />
            </div>

            <div className="palette-panel">
                <ClipPalette
                    palette={project.palette}
                    clipboard={clipboard}
                    assets={project.assets}
                    selectedClipId={selectedPaletteClipId}
                    onClipSelect={handlePaletteClipSelect}
                    onPaletteChange={(newPalette) => {
                        const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
                        newProject.palette = newPalette;
                        setProject(newProject);
                    }}
                />
            </div>

            <div className="properties-panel">
                {(selectedClips.length > 0 || selectedPaletteClip) ? (
                    <ClipEditor
                        key={selectedPaletteClip ? selectedPaletteClipId : selectedClipIds.join(',')}
                        clips={selectedPaletteClip ? [selectedPaletteClip] : selectedClips}
                        onChange={handleClipUpdate}
                        onDelete={handleDelete}
                        assets={project.assets}
                        lightGroups={project.lightGroups}
                        carGroups={project.carGroups}
                        allCarsThumbnail={allCarsThumbnail}
                    />
                ) : selectedLayerId ? (
                    <div className="p-4">
                        <h3 className="text-lg font-bold mb-4">Track: {project.layers.find(l => l.id === selectedLayerId)?.name}</h3>
                        <div className="text-sm text-gray-500 italic">Settings window is open</div>
                    </div>
                ) : (
                    <div className="text-muted p-4">Select a track or clip to edit</div>
                )}
            </div>
        </div>
    );
}
