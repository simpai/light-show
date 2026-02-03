import React, { useEffect, useRef } from 'react';

/**
 * 2D Matrix Preview component using Canvas for high-performance rendering.
 * Each car is represented as a 3x6 pixel block.
 */
export default function MatrixPreview2D({ matrixData, cols = 63, rows = 16, layoutData = null, showGroundLight = true, lightGroups = {} }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !matrixData) return;

        const ctx = canvas.getContext('2d');
        const carW = 3;
        const carH = 6;
        const gap = 1;

        // Set canvas internal dimensions
        canvas.width = cols * (carW + gap);
        canvas.height = rows * (carH + gap);

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
                const carY = r * (carH + gap);
                const carX = c * (carW + gap);

                let carExists = true;
                let rotation = 0;

                if (layoutData && layoutData.layout && layoutData.layout[r]?.[c]) {
                    const cell = layoutData.layout[r][c];
                    carExists = cell.exists;
                    rotation = cell.rotation || 0;
                }

                if (!carExists) continue;

                // Base car body (Gray)
                ctx.fillStyle = '#666';
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
            }
        }
    }, [matrixData, rows, cols, layoutData, showGroundLight, lightGroups]);

    return (
        <div className="matrix-2d-container">
            <canvas
                ref={canvasRef}
                style={{
                    width: '100%',
                    height: '100%',
                    imageRendering: 'pixelated',
                    objectFit: 'contain'
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
                    padding: 0;
                    box-sizing: border-box;
                }
            `}</style>
        </div>
    );
}
