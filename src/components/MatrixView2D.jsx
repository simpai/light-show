import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { Maximize2 } from 'lucide-react';

/**
 * MatrixView2D - Image-based car preview
 * Renders multiple cars using PNG assets with 2-pass rendering (ground then car+lights).
 */

const carW = 40;
const carH = 90;
const cellSizeW = 50; // Base cell width for layout grid
const cellSizeH = 110; // Base cell height for layout grid

// Assets paths
const ASSETS = {
    CAR: '/preview/car_top.png',
    LIGHT_WHITE: '/preview/light_white.png',
    LIGHT_RED: '/preview/light_red.png',
    LIGHT_ORANGE: '/preview/light_orange.png',
    PROJECT_WHITE: '/preview/ground_projection.png',
    PROJECT_RED: '/preview/ground_projection_red.png',
};

// Light mapping based on 40x90 scale (Rescaled from 14x25)
// Relative to center (0,0)
const LIGHT_MAP = {
    // Channels that have both ground and overlay, or multiple elements
    0: [ // Left Outer Main Beam
        { ground: true, sprite: 'PROJECT_WHITE', x: -12, y: -90, scale: 1.2 },
        { sprite: 'LIGHT_WHITE', x: -14, y: -36, scale: 1.5 }
    ],
    1: [ // Right Outer Main Beam
        { ground: true, sprite: 'PROJECT_WHITE', x: 12, y: -90, scale: 1.2 },
        { sprite: 'LIGHT_WHITE', x: 14, y: -36, scale: 1.5 }
    ],
    2: [{ sprite: 'LIGHT_WHITE', x: -9, y: -36, scale: 1.5 }], // Left Inner Main Beam
    3: [{ sprite: 'LIGHT_WHITE', x: 9, y: -36, scale: 1.5 }],  // Right Inner Main Beam
    4: [{ sprite: 'LIGHT_WHITE', x: -16, y: -34, scale: 1.0 }], // Left Signature
    5: [{ sprite: 'LIGHT_WHITE', x: 16, y: -34, scale: 1.0 }],  // Right Signature
    12: [{ sprite: 'LIGHT_ORANGE', x: -17, y: -32, scale: 1.2 }], // Left Front Turn
    13: [{ sprite: 'LIGHT_ORANGE', x: 17, y: -32, scale: 1.2 }],  // Right Front Turn
    14: [{ sprite: 'LIGHT_WHITE', x: -14, y: -43, scale: 1.2 }], // Left fog
    15: [{ sprite: 'LIGHT_WHITE', x: 14, y: -43, scale: 1.2 }],  // right fog
    20: [{ sprite: 'LIGHT_ORANGE', x: -21, y: 7, scale: 0.9 }], // Left side repeater
    21: [{ sprite: 'LIGHT_ORANGE', x: 21, y: 7, scale: 0.9 }],  // Right side repeater
    22: [{ sprite: 'LIGHT_ORANGE', x: -14, y: 40, scale: 1.2 }], // Left Rear Turn
    23: [{ sprite: 'LIGHT_ORANGE', x: 14, y: 40, scale: 1.2 }],  // Right Rear Turn
    24: [ // brake
        { ground: true, sprite: 'PROJECT_RED', x: 0, y: 54, scale: 2.0 },
        { sprite: 'LIGHT_RED', x: -14, y: 43, scale: 1.5 },
        { sprite: 'LIGHT_RED', x: 0, y: 45, scale: 1.5 },
        { sprite: 'LIGHT_RED', x: 14, y: 43, scale: 1.5 }
    ],
    25: [ // Left Tail
        { ground: true, sprite: 'PROJECT_RED', x: -12, y: 54, scale: 2.0 },
        { sprite: 'LIGHT_RED', x: -11, y: 43, scale: 1.5 }
    ],
    26: [ // Right Tail
        { ground: true, sprite: 'PROJECT_RED', x: 12, y: 54, scale: 2.0 },
        { sprite: 'LIGHT_RED', x: 11, y: 43, scale: 1.5 }
    ],
    27: [ // reverse
        { sprite: 'LIGHT_WHITE', x: -14, y: 43, scale: 1.2 },
        { sprite: 'LIGHT_WHITE', x: 14, y: 43, scale: 1.2 }
    ],
    28: [ // rear fog
        { ground: true, sprite: 'PROJECT_RED', x: 0, y: 54, scale: 2.0 },
        { sprite: 'LIGHT_RED', x: -14, y: 43, scale: 1.2 },
        { sprite: 'LIGHT_RED', x: 14, y: 43, scale: 1.2 }
    ],
    29: [{ sprite: 'LIGHT_WHITE', x: 0, y: 47, scale: 0.9 }], // license plate
};

export default function MatrixView2D({
    rendererRef,
    cols = 63,
    rows = 16,
    layoutData = null,
    showGroundLight = true,
    selectedCars = new Set(),
    onSelectionChange,
    fitTrigger = 0
}) {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [images, setImages] = useState({});
    const [viewState, setViewState] = useState({ zoom: 1.0, pan: { x: 0, y: 0 } });
    const [isPanning, setIsPanning] = useState(false);
    const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
    const [dragStart, setDragStart] = useState(null);
    const [dragEnd, setDragEnd] = useState(null);
    const [tempSelection, setTempSelection] = useState(new Set());

    // Load assets
    useEffect(() => {
        const loaded = {};
        let count = 0;
        const total = Object.keys(ASSETS).length;
        Object.entries(ASSETS).forEach(([key, src]) => {
            const img = new Image();
            img.src = src;
            img.onload = () => {
                loaded[key] = img;
                count++;
                if (count === total) setImages(loaded);
            };
        });
    }, []);

    const performFit = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const iWidth = cols * cellSizeW + 2 * cellSizeW;
        const iHeight = rows * cellSizeH + 2 * cellSizeH;

        const padding = 20;
        const availableW = rect.width - padding * 2;
        const availableH = rect.height - padding * 2;

        const zoomW = availableW / iWidth;
        const zoomH = availableH / iHeight;
        const fitZoom = Math.min(zoomW, zoomH);

        const panX = (rect.width - iWidth * fitZoom) / 2;
        const panY = (rect.height - iHeight * fitZoom) / 2;

        setViewState({ zoom: fitZoom, pan: { x: panX, y: panY } });
    }, [cols, rows]);

    useEffect(() => {
        const timer = setTimeout(performFit, 50);
        return () => clearTimeout(timer);
    }, [performFit, fitTrigger]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                const delta = -e.deltaY;
                const factor = Math.pow(1.1, delta / 100);

                setViewState(prev => {
                    const newZoom = Math.min(Math.max(0.1, prev.zoom * factor), 50);
                    const actualFactor = newZoom / prev.zoom;

                    const rect = container.getBoundingClientRect();
                    const mouseX = e.clientX - rect.left;
                    const mouseY = e.clientY - rect.top;

                    return {
                        zoom: newZoom,
                        pan: {
                            x: mouseX - (mouseX - prev.pan.x) * actualFactor,
                            y: mouseY - (mouseY - prev.pan.y) * actualFactor
                        }
                    };
                });
            }
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, []);

    // Render loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || Object.keys(images).length === 0) return;
        let animationFrameId;

        const renderFrame = () => {
            const timeSpan = window.__lightShowTime || useStore.getState().currentTime;
            const matrixData = rendererRef?.current?.getMatrixFrame(timeSpan, { rows, cols });
            if (!matrixData) {
                animationFrameId = requestAnimationFrame(renderFrame);
                return;
            }

            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // PASS 1: Ground Projections
            if (showGroundLight) {
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        const cell = layoutData?.layout?.[r]?.[c];
                        if (cell && !cell.exists) continue;

                        const lights = matrixData[r]?.[c];
                        if (!lights) continue;

                        const centerX = (c + 1) * cellSizeW;
                        const centerY = (r + 1) * cellSizeH;
                        const yaw = (cell?.rotation || 0) * (Math.PI / 180);

                        ctx.save();
                        ctx.translate(centerX, centerY);
                        ctx.rotate(yaw);

                        Object.entries(LIGHT_MAP).forEach(([ch, items]) => {
                            const val = lights[ch];
                            if (val > 0) {
                                items.forEach(item => {
                                    if (item.ground && images[item.sprite]) {
                                        const img = images[item.sprite];
                                        const w = img.width * (item.scale || 1);
                                        const h = img.height * (item.scale || 1);
                                        ctx.globalAlpha = (val / 255) * 0.6;
                                        ctx.drawImage(img, item.x - w / 2, item.y - h / 2, w, h);
                                    }
                                });
                            }
                        });
                        ctx.restore();
                    }
                }
            }

            // PASS 2: Car Body & Lights
            ctx.globalAlpha = 1.0;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const key = `${r},${c}`;
                    const cell = layoutData?.layout?.[r]?.[c];
                    if (cell && !cell.exists) continue;

                    const lights = matrixData[r]?.[c];
                    const centerX = (c + 1) * cellSizeW;
                    const centerY = (r + 1) * cellSizeH;
                    const yaw = (cell?.rotation || 0) * (Math.PI / 180);

                    ctx.save();
                    ctx.translate(centerX, centerY);
                    ctx.rotate(yaw);

                    // Draw Car Body
                    if (images.CAR) {
                        ctx.drawImage(images.CAR, -carW / 2, -carH / 2, carW, carH);
                    }

                    // Draw Selection
                    if (selectedCars.has(key) || tempSelection.has(key)) {
                        ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
                        ctx.fillRect(-carW / 2, -carH / 2, carW, carH);
                        ctx.strokeStyle = '#0f0';
                        ctx.lineWidth = 1;
                        ctx.strokeRect(-carW / 2, -carH / 2, carW, carH);
                    }

                    // Draw Light Overlays
                    if (lights) {
                        Object.entries(LIGHT_MAP).forEach(([ch, items]) => {
                            const val = lights[ch];
                            if (val > 0) {
                                items.forEach(item => {
                                    if (!item.ground && images[item.sprite]) {
                                        const img = images[item.sprite];
                                        const w = img.width * (item.scale || 1);
                                        const h = img.height * (item.scale || 1);
                                        ctx.globalAlpha = (val / 255);
                                        ctx.drawImage(img, item.x - w / 2, item.y - h / 2, w, h);
                                    }
                                });
                            }
                        });
                    }

                    ctx.restore();
                }
            }

            // Marquee
            if (dragStart && dragEnd) {
                ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
                ctx.strokeStyle = '#0f0';
                ctx.lineWidth = 1;
                const x = Math.min(dragStart.x, dragEnd.x);
                const y = Math.min(dragStart.y, dragEnd.y);
                const w = Math.abs(dragStart.x - dragEnd.x);
                const h = Math.abs(dragStart.y - dragEnd.y);
                ctx.fillRect(x, y, w, h);
                ctx.strokeRect(x, y, w, h);
            }

            animationFrameId = requestAnimationFrame(renderFrame);
        };

        canvas.width = (cols + 2) * cellSizeW;
        canvas.height = (rows + 2) * cellSizeH;
        renderFrame();

        return () => cancelAnimationFrame(animationFrameId);
    }, [images, rendererRef, rows, cols, layoutData, showGroundLight, selectedCars, tempSelection, dragStart, dragEnd]);

    // Input handlers (Zoom, Pan, Selection) - similar to MatrixPreview2D
    const getCoord = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const scale = canvas.width / rect.width;
        return {
            x: (e.clientX - rect.left) * scale,
            y: (e.clientY - rect.top) * scale
        };
    };

    const handleMouseDown = (e) => {
        if (e.button === 1 || e.button === 2) {
            setIsPanning(true);
            setLastMousePos({ x: e.clientX, y: e.clientY });
            return;
        }
        const coord = getCoord(e);
        setDragStart(coord);
        setDragEnd(coord);
    };

    const handleMouseMove = (e) => {
        if (isPanning) {
            const dx = e.clientX - lastMousePos.x;
            const dy = e.clientY - lastMousePos.y;
            setViewState(prev => ({
                ...prev,
                pan: { x: prev.pan.x + dx, y: prev.pan.y + dy }
            }));
            setLastMousePos({ x: e.clientX, y: e.clientY });
            return;
        }
        if (!dragStart) return;
        const coord = getCoord(e);
        setDragEnd(coord);

        const x1 = Math.min(dragStart.x, coord.x);
        const y1 = Math.min(dragStart.y, coord.y);
        const x2 = Math.max(dragStart.x, coord.x);
        const y2 = Math.max(dragStart.y, coord.y);

        const newTemp = new Set();
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const centerX = (c + 1) * cellSizeW;
                const centerY = (r + 1) * cellSizeH;
                if (centerX > x1 && centerX < x2 && centerY > y1 && centerY < y2) {
                    if (!layoutData || (layoutData.layout?.[r]?.[c]?.exists !== false)) {
                        newTemp.add(`${r},${c}`);
                    }
                }
            }
        }
        setTempSelection(newTemp);
    };

    const handleMouseUp = (e) => {
        if (isPanning) {
            setIsPanning(false);
            return;
        }
        if (!dragStart) return;

        const mode = e.shiftKey ? 'add' : (e.altKey ? 'subtract' : 'new');
        let newSelection = new Set(selectedCars);

        if (mode === 'add') {
            tempSelection.forEach(k => newSelection.add(k));
        } else if (mode === 'subtract') {
            tempSelection.forEach(k => newSelection.delete(k));
        } else {
            newSelection = new Set(tempSelection);
        }

        if (onSelectionChange) onSelectionChange(newSelection);
        setDragStart(null);
        setDragEnd(null);
        setTempSelection(new Set());
    };

    return (
        <div
            className="matrix-view-2d-container"
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onContextMenu={e => e.preventDefault()}
        >
            <div className="canvas-wrapper" style={{
                position: 'absolute',
                left: 0, top: 0,
                transform: `translate(${viewState.pan.x}px, ${viewState.pan.y}px) scale(${viewState.zoom})`,
                transformOrigin: '0 0'
            }}>
                <canvas ref={canvasRef} style={{ imageRendering: 'pixelated', display: 'block' }} />
            </div>
            <button className="btn-zoom-fit" onClick={performFit} title="Zoom Fit">
                <Maximize2 size={16} />
            </button>
            <style>{`
                .matrix-view-2d-container {
                    width: 100%; height: 100%;
                    background: #111;
                    position: relative;
                    overflow: hidden;
                    cursor: crosshair;
                }
                .btn-zoom-fit {
                    position: absolute; bottom: 10px; right: 10px;
                    background: rgba(40,40,40,0.8); border: 1px solid #444;
                    color: white; border-radius: 4px; width: 30px; height: 30px;
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer; z-index: 10;
                }
                .btn-zoom-fit:hover { background: #e82020; border-color: #e82020; }
            `}</style>
        </div>
    );
}
