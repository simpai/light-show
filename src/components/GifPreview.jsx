import React, { useRef, useEffect, useMemo } from 'react';

export const GifPreview = ({ asset, fps = 15 }) => {
    const canvasRef = useRef(null);
    const requestRef = useRef();
    const frameIndexRef = useRef(0);
    const lastTimeRef = useRef(0);

    // Reset on asset change
    useEffect(() => {
        frameIndexRef.current = 0;
        if (asset && canvasRef.current && asset.frames && asset.frames.length > 0) {
            const ctx = canvasRef.current.getContext('2d');
            canvasRef.current.width = asset.width;
            canvasRef.current.height = asset.height;
            ctx.putImageData(asset.frames[0], 0, 0);
        }
    }, [asset]);

    // Animation loop
    useEffect(() => {
        if (!asset || !asset.frames || asset.frames.length <= 1) return;

        const animate = (time) => {
            if (time - lastTimeRef.current > (1000 / (fps || 15))) { // Default fallback
                if (canvasRef.current) {
                    const ctx = canvasRef.current.getContext('2d');
                    frameIndexRef.current = (frameIndexRef.current + 1) % asset.frames.length;
                    ctx.putImageData(asset.frames[frameIndexRef.current], 0, 0);
                    lastTimeRef.current = time;
                }
            }
            requestRef.current = requestAnimationFrame(animate);
        };

        requestRef.current = requestAnimationFrame(animate);

        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [asset, fps]);

    // Calculate integer scale based on max height of 200px, capped at 4x
    const scale = useMemo(() => {
        if (!asset || !asset.height) return 1;
        const MAX_HEIGHT = 200;
        const s = Math.floor(MAX_HEIGHT / asset.height);
        return Math.min(Math.max(1, s), 4); // Min 1x, Max 4x
    }, [asset]);

    if (!asset) return null;

    return (
        <div className="gif-preview">
            <canvas
                ref={canvasRef}
                style={{
                    width: asset.width * scale,
                    height: asset.height * scale,
                    imageRendering: 'pixelated'
                }}
            />
            <div className="gif-info">
                {asset.width}x{asset.height} • {asset.frames.length} frames • {fps || '?'} FPS • {scale}x Zoom
            </div>
            <style>{`
                .gif-preview {
                    margin-top: 10px;
                    border: 1px solid #333;
                    background: #111;
                    border-radius: 4px;
                    overflow: hidden;
                    display: inline-flex;
                    flex-direction: column;
                    align-items: center; /* Center the canvas if it's smaller than info */
                }
                .gif-preview canvas {
                    max-width: 100%;
                    max-height: 200px;
                    display: block;
                    background-image: linear-gradient(45deg, #222 25%, transparent 25%), 
                                      linear-gradient(-45deg, #222 25%, transparent 25%), 
                                      linear-gradient(45deg, transparent 75%, #222 75%), 
                                      linear-gradient(-45deg, transparent 75%, #222 75%);
                    background-size: 20px 20px;
                    background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
                }
                .gif-info {
                    width: 100%;
                    padding: 4px 8px;
                    background: #222;
                    font-size: 11px;
                    color: #999;
                    border-top: 1px solid #333;
                    text-align: center;
                    box-sizing: border-box;
                }
            `}</style>
        </div>
    );
};
