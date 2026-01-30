import React, { useMemo } from 'react';

const MatrixVisualizer = ({ matrixData, frameIndex, rows, cols }) => {
    // Generate grid cells
    const gridCells = useMemo(() => {
        const cells = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                cells.push({ r, c });
            }
        }
        return cells;
    }, [rows, cols]);

    if (!matrixData) return <div className="matrix-placeholder">Load Matrix Zip</div>;

    return (
        <div className="matrix-wrapper" style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
            <div className="matrix-container" style={{
                display: 'grid',
                gridTemplateRows: `repeat(${rows}, 40px)`,
                gridTemplateColumns: `repeat(${cols}, 20px)`,
                gap: '8px',
                width: 'fit-content',
                backgroundColor: '#111',
                padding: '20px',
                borderRadius: '12px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
            }}>
                {gridCells.map((cell) => {
                    const key = `${cell.r}_${cell.c}`;
                    const parserData = matrixData[key];

                    let color = '#222';
                    let brightness = 0.3;
                    let inputVal = 0;

                    if (parserData && parserData.parser) {
                        const frame = parserData.parser.getFrame(frameIndex);
                        if (frame) {
                            // Blend channels to get a single "pixel" color
                            // Priority: Beams (0-4) -> Fog (14-15) -> Sig (4-5) -> Turn (12-13)

                            // Simple max intensity check for demo
                            const beam = Math.max(frame[0], frame[1], frame[2], frame[3]);
                            const red = Math.max(frame[25], frame[26], frame[4], frame[5]); // Tail + Sig
                            const amber = Math.max(frame[12], frame[13]); // Turn

                            if (beam > 50) {
                                inputVal = beam;
                                color = '#fff'; // White
                            } else if (red > 50) {
                                inputVal = red;
                                color = '#e82127'; // Tesla Red
                            } else if (amber > 50) {
                                inputVal = amber;
                                color = '#ffaa00'; // Amber
                            }

                            brightness = Math.max(0.1, inputVal / 255);
                        }
                    }

                    return (
                        <div
                            key={key}
                            style={{
                                backgroundColor: color,
                                opacity: brightness,
                                borderRadius: '4px',
                                boxShadow: brightness > 0.5 ? `0 0 10px ${color}` : 'none',
                                transition: 'opacity 0.05s linear',
                                width: '100%',
                                height: '100%'
                            }}
                        />
                    );
                })}
            </div>
        </div>
    );
};

export default MatrixVisualizer;
