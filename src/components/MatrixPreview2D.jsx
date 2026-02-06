import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Maximize2 } from 'lucide-react';

/**
 * 2D Matrix Preview component using Canvas for high-performance rendering.
 * Each car is represented as a 5x9 pixel block for detailed visualization.
 */

// Car dimensions for detailed view (including 1px gap)
const carW = 5;
const carH = 9;
const gap = 1;
const cellW = 6; // carW + gap
const cellH = 10; // carH + gap

// Relative coordinates (x: 0-4, y: 0-8) for each of the 48 channels.
// x=0 is left, x=4 is right. y=0 is back, y=8 is front.
const LIGHT_COORDINATES = {
    0: [{ x: 4, y: 8, color: '#fff9' }], // Left Outer Main Beam
    1: [{ x: 0, y: 8, color: '#fff9' }], // Right Outer Main Beam
    2: [{ x: 3, y: 8, color: '#fff9' }], // Left Inner Main Beam
    3: [{ x: 1, y: 8, color: '#fff9' }], // Right Inner Main Beam
    4: [{ x: 4, y: 7, color: '#fff5' }], // Left Signature
    5: [{ x: 0, y: 7, color: '#fff5' }], // Right Signature
    6: [{ x: 3, y: 9, color: '#fff7' }], // Left channel 4
    7: [{ x: 1, y: 9, color: '#fff7' }], // right channel 4
    8: [{ x: 3, y: 9, color: '#fff7' }], // Left channel 5
    9: [{ x: 1, y: 9, color: '#fff7' }], // right channel 5
    10: [{ x: 3, y: 9, color: '#fff7' }], // Left channel 6
    11: [{ x: 1, y: 9, color: '#fff7' }], // right channel 6
    12: [{ x: 4, y: 7, color: '#fa0f' }], // Left Front Turn
    13: [{ x: 0, y: 7, color: '#fa0f' }], // Right Front Turn
    14: [{ x: 4, y: 9, color: '#fff' }], // Left fog
    15: [{ x: 0, y: 9, color: '#fff' }], // right fog
    16: [{ x: 3, y: 9, color: '#fff' }], // Left aux park
    17: [{ x: 1, y: 9, color: '#fff' }], // right aux park
    18: [{ x: 4, y: 9, color: '#fff' }], // Left side marker
    19: [{ x: 0, y: 9, color: '#fff' }], // right side marker
    20: [{ x: 4, y: 6, color: '#fa0f' }], // Left side repeater
    21: [{ x: 0, y: 6, color: '#fa0f' }], // Right side repeater
    22: [{ x: 4, y: 1, color: '#fa0f' }], // Left Rear Turn
    23: [{ x: 0, y: 1, color: '#fa0f' }], // Right Rear Turn
    24: [{ x: 2, y: 0, color: '#f00' }, { x: 0, y: 0, color: '#f00' }, { x: 4, y: 0, color: '#f00' }], // brake
    25: [{ x: 3, y: 0, color: '#f00' }], // Left Tail
    26: [{ x: 1, y: 0, color: '#f00' }], // Right Tail

    27: [{ x: 0, y: -1, color: '#fffa' }, { x: 4, y: -1, color: '#fffa' }], // reverse
    28: [{ x: 0, y: -1, color: '#f008' }, { x: 4, y: -1, color: '#f008' }], // rear fog
    29: [{ x: 2, y: 0, color: '#fff5' }], // license plate
};

// Fill missing coordinates with defaults so the loop doesn't break
for (let i = 0; i < 200; i++) {
    if (!LIGHT_COORDINATES[i]) {
        // Default to a visible front position for lightbars if within range
        if (i >= 46 && i <= 75) {
            LIGHT_COORDINATES[i] = [{ x: 4, y: 9, color: '#fff' }]; // Left Front (stacked)
        } else if (i >= 76 && i <= 105) {
            LIGHT_COORDINATES[i] = [{ x: 0, y: 9, color: '#fff' }]; // Right Front (stacked)
        } else {
            LIGHT_COORDINATES[i] = [{ x: 2, y: 4, color: '#fff' }]; // Center default
        }
    } else {
        // Ensure all points have a color
        LIGHT_COORDINATES[i].forEach(p => {
            if (!p.color) p.color = '#fff';
        });
    }
}

export default function MatrixPreview2D({
    matrixData,
    cols = 63,
    rows = 16,
    layoutData = null,
    showGroundLight = true,
    lightGroups = {},
    selectedCars = new Set(), // Set of "r,c" strings
    onSelectionChange,
    fitTrigger = 0
}) {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [dragStart, setDragStart] = useState(null);
    const [dragEnd, setDragEnd] = useState(null);
    const [tempSelection, setTempSelection] = useState(new Set());
    // selectionMode: 'new' | 'add' (ctrl) | 'subtract' (shift)
    const [selectionMode, setSelectionMode] = useState('new');

    const [viewState, setViewState] = useState({ zoom: 1.0, pan: { x: 0, y: 0 } });
    const [isPanning, setIsPanning] = useState(false);
    const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

    const performFit = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        // Expected canvas internal size
        const iWidth = cols * cellW + 2;
        const iHeight = rows * cellH + 2;

        const padding = 20;
        const availableW = rect.width - padding * 2;
        const availableH = rect.height - padding * 2;

        const zoomW = availableW / iWidth;
        const zoomH = availableH / iHeight;
        const fitZoom = Math.min(zoomW, zoomH); // Fit matrix to available space (removed 1.0 cap)

        const panX = (rect.width - iWidth * fitZoom) / 2;
        const panY = (rect.height - iHeight * fitZoom) / 2;

        setViewState({ zoom: fitZoom, pan: { x: panX, y: panY } });
    }, [cols, rows]);

    // Initial Fit logic & Trigger Fit
    useEffect(() => {
        // Delay slightly to ensure layout is ready
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

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !matrixData) return;

        const ctx = canvas.getContext('2d');

        // Set canvas internal dimensions (with 1px margin on all sides)
        canvas.width = cols * cellW + 2;
        canvas.height = rows * cellH + 2;

        // Clear background
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const carY = r * cellH + 1; // 1px margin
                const carX = c * cellW + 1; // 1px margin

                let carExists = true;
                let rotation = 0;

                if (layoutData && layoutData.layout && layoutData.layout[r]?.[c]) {
                    const cell = layoutData.layout[r][c];
                    carExists = cell.exists;
                    rotation = cell.rotation || 0;
                }

                if (!carExists) continue;

                // Determine if car is flipped (near 180 degrees)
                const normRot = ((rotation % 360) + 360) % 360;
                const isFlipped = normRot > 90 && normRot < 270;

                // Base car body (Dark Gray)
                ctx.fillStyle = '#111';
                ctx.fillRect(carX, carY, carW, carH);

                if (matrixData[r]?.[c]) {
                    const lights = matrixData[r][c];

                    // 1. Ground Light Logic
                    if (showGroundLight) {
                        // Left Headlight Ground (Ch 0)
                        if (lights[0] > 0) {
                            ctx.fillStyle = hexToRgba('#ffffff', (lights[0] / 255) * 0.5);
                            const groundY = isFlipped ? carY - carH : carY + carH;
                            if (isFlipped)
                                ctx.fillRect(carX - 1, groundY - 2, 4, carH + 2);
                            else
                                ctx.fillRect(carX + carW - 3, groundY, 4, carH + 2);

                            ctx.fillStyle = hexToRgba('#000', 0.5);
                            if (isFlipped) {
                                ctx.fillRect(carX + 2, groundY + carH, 1, -carH * 0.4);
                                ctx.fillRect(carX + 2, groundY + carH, 1, -carH);
                                ctx.fillRect(carX - 1, groundY + carH, 1, -carH * 0.4);
                                ctx.fillRect(carX - 1, groundY + carH, 1, -carH);
                            }
                            else {
                                ctx.fillRect(carX + 2, groundY, 1, carH * 0.4);
                                ctx.fillRect(carX + 2, groundY, 1, carH);
                                ctx.fillRect(carX + 5, groundY, 1, carH * 0.4);
                                ctx.fillRect(carX + 5, groundY, 1, carH);
                            }
                        }
                        // Right Headlight Ground (Ch 1)
                        if (lights[1] > 0) {
                            ctx.fillStyle = hexToRgba('#ffffff', (lights[1] / 255) * 0.5);
                            const groundY = isFlipped ? carY - carH : carY + carH;
                            if (isFlipped)
                                ctx.fillRect(carX + carW - 3, groundY - 2, 4, carH + 2);
                            else
                                ctx.fillRect(carX - 1, groundY, 4, carH + 2);
                            ctx.fillStyle = hexToRgba('#000', 0.5);
                            if (isFlipped) {
                                ctx.fillRect(carX + 2, groundY + carH, 1, -carH * 0.4);
                                ctx.fillRect(carX + 2, groundY + carH, 1, -carH);
                                ctx.fillRect(carX + 5, groundY + carH, 1, -carH * 0.4);
                                ctx.fillRect(carX + 5, groundY + carH, 1, -carH);
                            }
                            else {
                                ctx.fillRect(carX + 2, groundY, 1, carH * 0.4);
                                ctx.fillRect(carX + 2, groundY, 1, carH);
                                ctx.fillRect(carX - 1, groundY, 1, carH * 0.4);
                                ctx.fillRect(carX - 1, groundY, 1, carH);
                            }
                        }
                        // 2. Brake Lights (Ch 24) - 2x2 red at rear corners
                        if (lights[24] > 0) {
                            ctx.fillStyle = hexToRgba('#ff0000', (lights[24] / 255) * 0.5);
                            if (isFlipped) {
                                // Rear is at bottom
                                ctx.fillRect(carX - 1, carY + carH - 1, 7, 2);
                            } else {
                                // Rear is at top
                                ctx.fillRect(carX - 1, carY - 1, 7, 2);
                            }
                        }
                    }

                    // 3. Individual Light Points
                    for (let ch = 0; ch < 48; ch++) {
                        const val = lights[ch];
                        if (val > 0) {
                            const coords = LIGHT_COORDINATES[ch];
                            const points = Array.isArray(coords) ? coords : [coords];

                            points.forEach(coord => {
                                let dx = coord.x;
                                let dy = coord.y;

                                if (isFlipped) {
                                    dx = (carW - 1) - dx;
                                    dy = (carH - 1) - dy;
                                }

                                ctx.fillStyle = hexToRgba(coord.color, val / 255);
                                ctx.fillRect(carX + dx, carY + dy, 1, 1);
                            });
                        }
                    }
                }

                // Selection Overlay
                const key = `${r},${c}`;
                let isActuallySelected = selectedCars.has(key);
                let visualOverlay = null;

                if (dragStart && dragEnd) {
                    const isMarked = tempSelection.has(key);
                    if (selectionMode === 'add') {
                        if (isActuallySelected || isMarked) visualOverlay = 'green';
                    } else if (selectionMode === 'subtract') {
                        if (isActuallySelected) {
                            visualOverlay = isMarked ? 'red' : 'green';
                        }
                    } else {
                        if (isMarked) visualOverlay = 'green';
                    }
                } else if (isActuallySelected) {
                    visualOverlay = 'green';
                }

                if (visualOverlay === 'green') {
                    ctx.fillStyle = 'rgba(0, 255, 0, 0.6)';
                    ctx.fillRect(carX, carY, carW, carH);
                } else if (visualOverlay === 'red') {
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
                    ctx.fillRect(carX, carY, carW, carH);
                }
            }
        }

        // Marquee Draw
        if (dragStart && dragEnd) {
            const isSub = selectionMode === 'subtract';
            ctx.fillStyle = isSub ? 'rgba(255, 0, 0, 0.1)' : 'rgba(0, 255, 0, 0.1)';
            ctx.strokeStyle = isSub ? '#f00' : '#0f0';
            ctx.lineWidth = 1;
            const x = Math.min(dragStart.x, dragEnd.x);
            const y = Math.min(dragStart.y, dragEnd.y);
            const w = Math.abs(dragStart.x - dragEnd.x);
            const h = Math.abs(dragStart.y - dragEnd.y);
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
        }
    }, [matrixData, rows, cols, layoutData, showGroundLight, lightGroups, selectedCars, dragStart, dragEnd, tempSelection, selectionMode]);

    const getCoord = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();

        const x_rect = e.clientX - rect.left;
        const y_rect = e.clientY - rect.top;

        // Scale between visual width and internal pixels
        const scale = canvas.width / rect.width;

        return {
            x: x_rect * scale,
            y: y_rect * scale
        };
    };

    const handleMouseDown = (e) => {
        // Right click (2) or Middle click (1) for panning
        if (e.button === 1 || e.button === 2) {
            setIsPanning(true);
            setLastMousePos({ x: e.clientX, y: e.clientY });
            return;
        }

        const coord = getCoord(e);
        setDragStart(coord);
        setDragEnd(coord);
        setTempSelection(new Set());
        if (e.shiftKey) setSelectionMode('add');
        else if (e.altKey) {
            e.preventDefault();
            setSelectionMode('subtract');
        } else setSelectionMode('new');
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
        if (e.shiftKey) setSelectionMode('add');
        else if (e.altKey) setSelectionMode('subtract');
        else setSelectionMode('new');

        const x1 = Math.min(dragStart.x, coord.x);
        const y1 = Math.min(dragStart.y, coord.y);
        const x2 = Math.max(dragStart.x, coord.x);
        const y2 = Math.max(dragStart.y, coord.y);

        const newTemp = new Set();
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const carX = c * cellW + 1;
                const carY = r * cellH + 1;
                if (carX + carW > x1 && carX < x2 && carY + carH > y1 && carY < y2) {
                    const carExists = !layoutData || (layoutData.layout[r]?.[c]?.exists);
                    if (carExists) newTemp.add(`${r},${c}`);
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

        if (!dragStart || !dragEnd) return;
        const dist = Math.sqrt(Math.pow(dragEnd.x - dragStart.x, 2) + Math.pow(dragEnd.y - dragStart.y, 2));
        const mode = e.shiftKey ? 'add' : (e.altKey ? 'subtract' : 'new');

        if (dist <= 5) {
            const col = Math.floor((dragEnd.x - 1) / cellW);
            const row = Math.floor((dragEnd.y - 1) / cellH);
            if (row >= 0 && row < rows && col >= 0 && col < cols) {
                const carExists = !layoutData || (layoutData.layout[row]?.[col]?.exists);
                if (carExists) {
                    const key = `${row},${col}`;
                    const newSelection = new Set(selectedCars);
                    if (mode === 'add') newSelection.add(key);
                    else if (mode === 'subtract') newSelection.delete(key);
                    else {
                        if (newSelection.has(key)) newSelection.delete(key);
                        else {
                            newSelection.clear();
                            newSelection.add(key);
                        }
                    }
                    if (onSelectionChange) onSelectionChange(newSelection);
                }
            } else if (mode === 'new') {
                if (onSelectionChange) onSelectionChange(new Set());
            }
        } else {
            let newSelection;
            if (mode === 'add') {
                newSelection = new Set(selectedCars);
                tempSelection.forEach(key => newSelection.add(key));
            } else if (mode === 'subtract') {
                newSelection = new Set(selectedCars);
                tempSelection.forEach(key => newSelection.delete(key));
            } else {
                newSelection = new Set(tempSelection);
            }
            if (onSelectionChange) onSelectionChange(newSelection);
        }
        setDragStart(null);
        setDragEnd(null);
        setTempSelection(new Set());
        setSelectionMode('new');
    };

    const handleDoubleClick = () => {
        performFit();
    };

    return (
        <div
            className="matrix-2d-container"
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onContextMenu={(e) => e.preventDefault()}
            onDoubleClick={handleDoubleClick}
        >
            <div
                className="canvas-wrapper"
                style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    transform: `translate(${viewState.pan.x}px, ${viewState.pan.y}px) scale(${viewState.zoom})`,
                    transformOrigin: '0 0',
                }}
            >
                <canvas
                    ref={canvasRef}
                    style={{
                        imageRendering: 'pixelated',
                        cursor: isPanning ? 'grabbing' : 'crosshair',
                        display: 'block',
                        pointerEvents: 'none'
                    }}
                />
            </div>

            <button
                className="btn-zoom-fit"
                onClick={(e) => {
                    e.stopPropagation();
                    performFit();
                }}
                title="Zoom Fit"
            >
                <Maximize2 size={16} />
            </button>
            <style>{`
                .matrix-2d-container {
                    width: 100%;
                    height: 100%;
                    background: #111;
                    position: relative;
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                    overflow: hidden;
                    cursor: crosshair;
                }
                .canvas-wrapper {
                   transition: transform 0.05s ease-out;
                   will-change: transform;
                }
                .btn-zoom-fit {
                    position: absolute;
                    bottom: 10px;
                    right: 10px;
                    background: rgba(40, 40, 40, 0.8);
                    border: 1px solid #444;
                    color: white;
                    border-radius: 4px;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    z-index: 10;
                    transition: all 0.2s;
                }
                .btn-zoom-fit:hover {
                    background: #e82020;
                    border-color: #e82020;
                }
            `}</style>
        </div>
    );
}

function hexToRgba(hex, alpha = 1.0) {
    let r = 255, g = 255, b = 255, a = 1.0;
    if (hex.startsWith('#')) {
        const hexVal = hex.substring(1);
        if (hexVal.length === 3) {
            r = parseInt(hexVal[0] + hexVal[0], 16);
            g = parseInt(hexVal[1] + hexVal[1], 16);
            b = parseInt(hexVal[2] + hexVal[2], 16);
        } else if (hexVal.length === 4) {
            r = parseInt(hexVal[0] + hexVal[0], 16);
            g = parseInt(hexVal[1] + hexVal[1], 16);
            b = parseInt(hexVal[2] + hexVal[2], 16);
            a = parseInt(hexVal[3] + hexVal[3], 16) / 255;
        } else if (hexVal.length === 6) {
            r = parseInt(hexVal.substring(0, 2), 16);
            g = parseInt(hexVal.substring(2, 4), 16);
            b = parseInt(hexVal.substring(4, 6), 16);
        } else if (hexVal.length === 8) {
            r = parseInt(hexVal.substring(0, 2), 16);
            g = parseInt(hexVal.substring(2, 4), 16);
            b = parseInt(hexVal.substring(4, 6), 16);
            a = parseInt(hexVal.substring(6, 8), 16) / 255;
        }
    }
    return `rgba(${r}, ${g}, ${b}, ${a * alpha})`;
}
