import { useEffect, useRef } from 'react';

export default function MatrixPreview({ matrixData }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!matrixData || matrixData.length === 0) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const rows = matrixData.length;
        const cols = matrixData[0].length;

        // Set canvas size - each pixel is 1 wide, 2 tall
        canvas.width = cols;
        canvas.height = rows * 2; // Double height for 1:2 aspect ratio

        // Clear canvas
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, cols, rows * 2);

        // Draw each cell as a 1x2 pixel
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const frameData = matrixData[r][c];
                const maxBrightness = Math.max(...frameData);

                if (maxBrightness > 2) { // Only draw if brightness > threshold
                    const brightness = maxBrightness / 255;
                    const intensity = Math.floor(brightness * 255);
                    ctx.fillStyle = `rgb(${intensity}, ${Math.floor(intensity * 0.125)}, ${Math.floor(intensity * 0.125)})`;
                    // Draw 1 pixel wide, 2 pixels tall
                    ctx.fillRect(c, r * 2, 1, 2);
                }
            }
        }
    }, [matrixData]);

    if (!matrixData || matrixData.length === 0) {
        return (
            <div style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#666',
                fontSize: '14px'
            }}>
                No preview available
            </div>
        );
    }

    const rows = matrixData.length;
    const cols = matrixData[0].length;

    return (
        <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            background: '#0a0a0a'
        }}>
            <canvas
                ref={canvasRef}
                style={{
                    width: '100%',
                    height: 'auto',
                    maxHeight: '100%',
                    imageRendering: 'pixelated',
                    border: '1px solid #333',
                    objectFit: 'contain'
                }}
            />
        </div>
    );
}
