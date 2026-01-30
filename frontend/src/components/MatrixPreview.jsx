import React from 'react';

export default function MatrixPreview({ matrixData, rows, cols }) {
    if (!matrixData || !matrixData.length) {
        return (
            <div className="matrix-preview-empty">
                <p>Matrix Preview ({rows}×{cols})</p>
            </div>
        );
    }

    return (
        <div className="matrix-preview">
            <div className="matrix-grid" style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gridTemplateRows: `repeat(${rows}, 1fr)`,
                gap: '2px',
                width: '100%',
                height: '100%',
                padding: '10px'
            }}>
                {matrixData.map((row, r) =>
                    row.map((frameData, c) => {
                        // Calculate maximum brightness across all channels
                        const maxBrightness = Math.max(...frameData);
                        const brightness = maxBrightness / 255;

                        return (
                            <div
                                key={`${r}-${c}`}
                                className="matrix-cell"
                                style={{
                                    background: brightness > 0.01
                                        ? `rgba(232, 32, 32, ${brightness})`
                                        : '#1a1a1a',
                                    border: '1px solid #333',
                                    borderRadius: '2px',
                                    transition: 'background 0.1s'
                                }}
                            />
                        );
                    })
                )}
            </div>

            <style jsx>{`
                .matrix-preview {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #000;
                }
                .matrix-preview-empty {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #666;
                }
                .matrix-grid {
                    max-width: 600px;
                    max-height: 600px;
                    aspect-ratio: 1;
                }
                .matrix-cell {
                    min-height: 10px;
                }
            `}</style>
        </div>
    );
}
