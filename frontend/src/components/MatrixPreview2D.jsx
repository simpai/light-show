import React, { useEffect, useRef, useState } from 'react';

/**
 * 2D Matrix Preview component using Canvas for high-performance rendering.
 * Each car is represented as a 4x8 pixel block (including gaps) for 1:2 ratio.
 */
export default function MatrixPreview2D({
    matrixData,
    cols = 63,
    rows = 16,
    layoutData = null,
    showGroundLight = true,
    lightGroups = {},
    selectedCars = new Set(), // Set of "r,c" strings
    onSelectionChange
}) {
    const canvasRef = useRef(null);
    const [dragStart, setDragStart] = useState(null);
    const [dragEnd, setDragEnd] = useState(null);
    const [tempSelection, setTempSelection] = useState(new Set());
    // selectionMode: 'new' | 'add' (ctrl) | 'subtract' (shift)
    const [selectionMode, setSelectionMode] = useState('new');

    // Car dimensions for 1:2 ratio (including 1px gap)
    const carW = 3;
    const carH = 7;
    const gap = 1;
    const cellW = 4; // carW + gap
    const cellH = 8; // carH + gap

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !matrixData) return;

        const ctx = canvas.getContext('2d');

        // Set canvas internal dimensions
        canvas.width = cols * cellW;
        canvas.height = rows * cellH;

        // Clear background
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const getGroupBrightness = (lights, groupName) => {
            const channels = lightGroups[groupName] || [];
            if (channels.length === 0) return 0;
            let maxVal = 0;
            channels.forEach(ch => {
                if (lights[ch] > maxVal) maxVal = lights[ch];
            });
            return maxVal;
        };

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const carY = r * cellH;
                const carX = c * cellW;

                let carExists = true;
                let rotation = 0;

                if (layoutData && layoutData.layout && layoutData.layout[r]?.[c]) {
                    const cell = layoutData.layout[r][c];
                    carExists = cell.exists;
                    rotation = cell.rotation || 0;
                }

                if (!carExists) continue;

                // Base car body (Gray)
                ctx.fillStyle = '#333';
                ctx.fillRect(carX, carY, carW, carH);

                if (matrixData[r]?.[c]) {
                    const lights = matrixData[r][c];

                    // Determine if car is flipped (near 180 degrees)
                    const normRot = ((rotation % 360) + 360) % 360;
                    const isFlipped = normRot > 90 && normRot < 270;

                    // Light mapping using groups
                    const whiteVal = getGroupBrightness(lights, 'MainWhite');
                    const redVal = getGroupBrightness(lights, 'Red');
                    const yellowVal = getGroupBrightness(lights, 'Yellow');

                    if (showGroundLight) {
                        // Draw Headlight Ground (White)
                        if (whiteVal > 0) {
                            ctx.fillStyle = `rgba(255, 255, 255, ${whiteVal / 355})`;
                            const headY = isFlipped ? carY - carH - 2 : carY + carH;
                            ctx.fillRect(carX, headY, 3, carH + 2);
                        }

                        // Draw Tail Light Ground (Red)
                        if (redVal > 0) {
                            ctx.fillStyle = `rgba(255, 0, 0, ${redVal / 355})`;
                            const tailY = isFlipped ? carY + carH - 1 : carY - 2;
                            ctx.fillRect(carX, tailY, 3, 3);
                        }
                    }

                    // Draw Lights on car body
                    // Headlights
                    if (whiteVal > 0) {
                        ctx.fillStyle = `rgba(255, 255, 255, ${whiteVal / 255})`;
                        const headY = isFlipped ? carY : carY + carH - 1;
                        ctx.fillRect(carX, headY, 1, 1);
                        ctx.fillRect(carX + carW - 1, headY, 1, 1);
                    }

                    // Tail Lights
                    if (redVal > 0) {
                        ctx.fillStyle = `rgba(255, 0, 0, ${redVal / 255})`;
                        const tailY = isFlipped ? carY + carH - 1 : carY;
                        ctx.fillRect(carX, tailY, 1, 1);
                        ctx.fillRect(carX + carW - 1, tailY, 1, 1);
                    }

                    // Yellow Lights (Side Repeaters)
                    if (yellowVal > 0) {
                        ctx.fillStyle = `rgba(255, 170, 0, ${yellowVal / 255})`;
                        const yellowY = carY + Math.floor(carH / 2);
                        ctx.fillRect(carX, yellowY, 1, 1);
                        ctx.fillRect(carX + carW - 1, yellowY, 1, 1);
                    }
                }

                // Selection Overlay
                const key = `${r},${c}`;
                let isActuallySelected = selectedCars.has(key);
                let visualOverlay = null; // 'green' | 'red' | null

                if (dragStart && dragEnd) {
                    const isMarked = tempSelection.has(key);
                    if (selectionMode === 'add') {
                        if (isActuallySelected || isMarked) visualOverlay = 'green';
                    } else if (selectionMode === 'subtract') {
                        if (isActuallySelected) {
                            visualOverlay = isMarked ? 'red' : 'green';
                        }
                    } else {
                        // 'new' mode
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

        // Accurate mapping for object-fit: contain
        const canvasAspect = canvas.width / canvas.height;
        const rectAspect = rect.width / rect.height;

        let visualWidth, visualHeight, offsetX, offsetY;

        if (rectAspect > canvasAspect) {
            // Letterboxed on sides
            visualHeight = rect.height;
            visualWidth = visualHeight * canvasAspect;
            offsetX = (rect.width - visualWidth) / 2;
            offsetY = 0;
        } else {
            // Letterboxed on top/bottom
            visualWidth = rect.width;
            visualHeight = visualWidth / canvasAspect;
            offsetX = 0;
            offsetY = (rect.height - visualHeight) / 2;
        }

        const scale = canvas.width / visualWidth;

        return {
            x: (e.clientX - rect.left - offsetX) * scale,
            y: (e.clientY - rect.top - offsetY) * scale
        };
    };

    const handleMouseDown = (e) => {
        const coord = getCoord(e);
        setDragStart(coord);
        setDragEnd(coord);
        setTempSelection(new Set());

        if (e.shiftKey) {
            setSelectionMode('add');
        } else if (e.altKey) {
            e.preventDefault(); // Prevent Windows Alt menu
            setSelectionMode('subtract');
        } else {
            setSelectionMode('new');
        }
    };

    const handleMouseMove = (e) => {
        if (!dragStart) return;
        const coord = getCoord(e);
        setDragEnd(coord);

        // Update mode in case key was pressed/released during move
        if (e.shiftKey) setSelectionMode('add');
        else if (e.altKey) setSelectionMode('subtract');
        else setSelectionMode('new');

        const dist = Math.sqrt(Math.pow(coord.x - dragStart.x, 2) + Math.pow(coord.y - dragStart.y, 2));
        if (dist > 5) {
            const x1 = Math.min(dragStart.x, coord.x);
            const y1 = Math.min(dragStart.y, coord.y);
            const x2 = Math.max(dragStart.x, coord.x);
            const y2 = Math.max(dragStart.y, coord.y);

            const newTemp = new Set();
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const carX = c * cellW;
                    const carY = r * cellH;
                    if (carX + carW > x1 && carX < x2 && carY + carH > y1 && carY < y2) {
                        const carExists = !layoutData || (layoutData.layout[r]?.[c]?.exists);
                        if (carExists) {
                            newTemp.add(`${r},${c}`);
                        }
                    }
                }
            }
            setTempSelection(newTemp);
        }
    };

    const handleMouseUp = (e) => {
        if (!dragStart || !dragEnd) {
            setDragStart(null);
            setDragEnd(null);
            setTempSelection(new Set());
            return;
        }

        const dist = Math.sqrt(Math.pow(dragEnd.x - dragStart.x, 2) + Math.pow(dragEnd.y - dragStart.y, 2));
        const mode = e.shiftKey ? 'add' : (e.altKey ? 'subtract' : 'new');

        if (dist <= 5) {
            // Individual click
            const col = Math.floor(dragEnd.x / cellW);
            const row = Math.floor(dragEnd.y / cellH);
            if (row >= 0 && row < rows && col >= 0 && col < cols) {
                const carExists = !layoutData || (layoutData.layout[row]?.[col]?.exists);
                if (carExists) {
                    const key = `${row},${col}`;
                    const newSelection = new Set(selectedCars);
                    if (mode === 'add') {
                        newSelection.add(key);
                    } else if (mode === 'subtract') {
                        newSelection.delete(key);
                    } else {
                        // Toggle logic for 'new' mode click
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
            // Marquee selection
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

    return (
        <div
            className="matrix-2d-container"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            <canvas
                ref={canvasRef}
                style={{
                    width: '100%',
                    height: '100%',
                    imageRendering: 'pixelated',
                    objectFit: 'contain',
                    cursor: 'crosshair',
                    display: 'block',
                    pointerEvents: 'none' // Let container handle events
                }}
            />
            <style>{`
                .matrix-2d-container {
                    width: 100%;
                    height: 100%;
                    background: #000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0;
                    padding: 40px;
                    box-sizing: border-box;
                    user-select: none;
                    overflow: hidden;
                    cursor: crosshair;
                }
            `}</style>
        </div>
    );
}
