import React from 'react';
import { useStore } from '../store/useStore';
import MatrixPreview2D from './MatrixPreview2D';
import MatrixView2D from './MatrixView2D';
import ClipPalette from './ClipPalette';
import ClipEditor from './ClipEditor';
import { ConsoleOverlay } from './ConsoleOverlay';

export function EditorWorkspace({
    fpsDisplay,
    rendererRef,
    matrixConfig,
    layoutData,
    showGroundLight,
    project,
    selectedCars,
    setSelectedCars,
    fitTrigger2D,
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
    selectedLayerId,
    onOpenAssetManager
}) {
    const paletteCollapsed = useStore(state => state.paletteCollapsed);
    const setPaletteCollapsed = useStore(state => state.setPaletteCollapsed);
    const hasConsoleMessages = useStore(state => state.consoleMessages.length > 0);
    const previewMode = useStore(state => state.previewMode);

    return (
        <div className="editor-main">
            <div className="preview-panel" style={{ position: 'relative' }}>
                <div style={{ 
                    position: 'absolute', 
                    top: 4, 
                    right: 8, 
                    background: 'rgba(0,0,0,0.7)', 
                    color: '#0f0', 
                    fontSize: '11px', 
                    fontFamily: 'monospace', 
                    padding: '2px 6px', 
                    borderRadius: '3px', 
                    zIndex: 20, 
                    pointerEvents: 'none' 
                }}>
                    {fpsDisplay} FPS
                </div>
                <ConsoleOverlay />
                {previewMode === 'car' ? (
                    <MatrixView2D
                        rendererRef={rendererRef}
                        rows={matrixConfig.rows}
                        cols={matrixConfig.cols}
                        layoutData={layoutData}
                        showGroundLight={showGroundLight}
                        selectedCars={selectedCars}
                        onSelectionChange={setSelectedCars}
                        fitTrigger={fitTrigger2D}
                    />
                ) : (
                    <MatrixPreview2D
                        rendererRef={rendererRef}
                        rows={matrixConfig.rows}
                        cols={matrixConfig.cols}
                        layoutData={layoutData}
                        showGroundLight={showGroundLight}
                        lightGroups={project.lightGroups}
                        selectedCars={selectedCars}
                        onSelectionChange={setSelectedCars}
                        fitTrigger={fitTrigger2D}
                    />
                )}
            </div>

            {paletteCollapsed ? (
                <div
                    className="palette-panel-collapsed"
                    onClick={() => setPaletteCollapsed(false)}
                    title="Expand Clip Palette"
                >
                    <span className="palette-collapsed-label">CLIP PALETTE</span>
                </div>
            ) : (
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
                        onCollapse={() => setPaletteCollapsed(true)}
                    />
                </div>
            )}

            <div className="properties-panel">
                {(selectedClips.length > 0 || selectedPaletteClip) ? (
                    <ClipEditor
                        key={selectedPaletteClip ? selectedPaletteClipId : selectedClipIds.join(',')}
                        clips={selectedPaletteClip ? [selectedPaletteClip] : selectedClips}
                        onChange={handleClipUpdate}
                        onDelete={handleDelete}
                        allCarsThumbnail={allCarsThumbnail}
                        onOpenAssetManager={onOpenAssetManager}
                        assets={project.assets}
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
