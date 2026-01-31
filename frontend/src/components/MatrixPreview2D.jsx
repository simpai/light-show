import React, { useEffect, useRef } from 'react';

/**
 * 2D Matrix Preview component using Canvas for high-performance rendering.
 * Each car is represented as a 3x6 pixel block.
 */
export default function MatrixPreview2D({ matrixData, rows = 16, cols = 63, layoutData = null }) {
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
                    // Normalize rotation to 0-360
                    const normRot = ((rotation % 360) + 360) % 360;
                    const isFlipped = normRot > 90 && normRot < 270;

                    // Light mapping
                    // Front Headlights (Bottom row in normal, Top row in flipped)
                    const leftBeam = lights[0] || 0;
                    const rightBeam = lights[1] || 0;

                    // Rear Tail/Brake Lights (Top row in normal, Bottom row in flipped)
                    const leftTail = Math.max(lights[25] || 0, lights[24] || 0);
                    const rightTail = Math.max(lights[26] || 0, lights[24] || 0);

                    // Draw Headlights (White)
                    if (leftBeam > 0 || rightBeam > 0) {
                        ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(leftBeam, rightBeam) / 255})`;
                        const headY = isFlipped ? carY : carY + carH - 1;
                        if (leftBeam > 0) {
                            ctx.fillStyle = `rgba(255, 255, 255, ${leftBeam / 255})`;
                            ctx.fillRect(carX, headY, 1, 1);
                        }
                        if (rightBeam > 0) {
                            ctx.fillStyle = `rgba(255, 255, 255, ${rightBeam / 255})`;
                            ctx.fillRect(carX + carW - 1, headY, 1, 1);
                        }
                    }

                    // Draw Tail Lights (Red)
                    if (leftTail > 0 || rightTail > 0) {
                        const tailY = isFlipped ? carY + carH - 1 : carY;
                        if (leftTail > 0) {
                            ctx.fillStyle = `rgba(255, 0, 0, ${leftTail / 255})`;
                            ctx.fillRect(carX, tailY, 1, 1);
                        }
                        if (rightTail > 0) {
                            ctx.fillStyle = `rgba(255, 0, 0, ${rightTail / 255})`;
                            ctx.fillRect(carX + carW - 1, tailY, 1, 1);
                        }
                    }
                }
            }
        }
    }, [matrixData, rows, cols, layoutData]);

    return (
        <div className="matrix-2d-container">
            <canvas
                ref={canvasRef}
                style={{
                    width: '100%',
                    height: '100%',
                    imageRendering: 'pixelated', // Keep it crisp
                    objectFit: 'contain'
                }}
            />
            <style jsx>{`
                .matrix-2d-container {
                    width: 100%;
                    height: 100%;
                    background: #000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                    box-sizing: border-box;
                }
            `}</style>
        </div>
    );
}
