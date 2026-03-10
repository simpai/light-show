import React, { useRef } from 'react';
import { getSpectrogramColor } from '../utils/colorUtils.js';

export const BinRangeSelector = ({ minBin = 0, maxBin = 31, onChange }) => {
    const isDragging = useRef(false);
    const startIndex = useRef(null);

    const handleInput = (index) => {
        if (!isDragging.current) return;
        const newMin = Math.min(startIndex.current, index);
        const newMax = Math.max(startIndex.current, index);
        onChange(newMin, newMax);
    };

    const handlePointerDown = (index, e) => {
        e.preventDefault();
        isDragging.current = true;
        startIndex.current = index;
        onChange(index, index);
        document.addEventListener('pointerup', handlePointerUp);
    };

    const handlePointerUp = () => {
        isDragging.current = false;
        document.removeEventListener('pointerup', handlePointerUp);
    };

    const bins = Array.from({ length: 32 }, (_, i) => i);

    return (
        <div style={{ marginTop: '8px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '10px', color: '#888' }}>Bin Selector</span>
                <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 'bold' }}>
                    [{minBin} - {maxBin}]
                </span>
            </div>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: '1px',
                    height: '32px',
                    width: '100%',
                    background: '#1a1a1a',
                    padding: '4px',
                    borderRadius: '6px',
                    border: '1px solid #333',
                    touchAction: 'none'
                }}
                onPointerLeave={() => isDragging.current = false}
            >
                {bins.map(i => {
                    const isActive = i >= minBin && i <= maxBin;
                    const isEdge = i === minBin || i === maxBin;
                    // Make it look like a logarithmic curve roughly
                    const heightPct = 20 + Math.pow(i / 31, 0.5) * 80;

                    return (
                        <div
                            key={i}
                            onPointerDown={(e) => handlePointerDown(i, e)}
                            onPointerEnter={() => handleInput(i)}
                            style={{
                                flex: 1,
                                height: '100%',
                                display: 'flex',
                                alignItems: 'flex-end',
                                cursor: 'crosshair',
                                padding: '0 0.5px' // Tiny gap between bars visually but full width hitbox
                            }}
                            title={`Bin ${i}`}
                        >
                            <div
                                style={{
                                    width: '100%',
                                    height: `${heightPct}%`,
                                    background: getSpectrogramColor(i, isActive, isEdge),
                                    borderRadius: '1px',
                                    transition: 'background-color 0.1s',
                                    opacity: isActive ? 1 : 0.5
                                }}
                            />
                        </div>
                    );
                })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '9px', color: '#666' }}>
                <span>Low (20Hz)</span>
                <span>Mid</span>
                <span>High (12kHz)</span>
            </div>
        </div>
    );
};
