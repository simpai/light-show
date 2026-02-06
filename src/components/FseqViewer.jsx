import React, { useRef, useEffect, useState, useMemo } from 'react';
import { FseqParser } from '../utils/FseqParser';
import { ZoomIn, ZoomOut, Move, Grid3X3, ArrowLeft, Upload } from 'lucide-react';

const FseqViewer = ({ onExit }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [fseqData, setFseqData] = useState(null);
    const [viewState, setViewState] = useState({
        offsetX: 0,
        offsetY: 0,
        zoomX: 2.0, // Pixels per frame
        zoomY: 10.0, // Pixels per channel
    });
    const [showGrid, setShowGrid] = useState({
        s1: true,
        s10: true,
        s60: true
    });
    const [dragStart, setDragStart] = useState(null);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const buffer = await file.arrayBuffer();
        try {
            const parser = new FseqParser(buffer);
            const header = parser.parse();
            setFseqData({ parser, header, buffer });
            // Reset view
            setViewState({ offsetX: 0, offsetY: 0, zoomX: 2.0, zoomY: 10.0 });
        } catch (err) {
            alert("Failed to parse FSEQ: " + err.message);
        }
    };

    useEffect(() => {
        if (!fseqData || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const { header, parser } = fseqData;
        const { zoomX, zoomY, offsetX, offsetY } = viewState;

        // Resize canvas to container
        canvas.width = containerRef.current.clientWidth;
        canvas.height = containerRef.current.clientHeight;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Calculate visible range
        const startFrame = Math.max(0, Math.floor(-offsetX / zoomX));
        const endFrame = Math.min(header.frameCount, Math.ceil((canvas.width - offsetX) / zoomX));

        const startCh = Math.max(0, Math.floor(-offsetY / zoomY));
        const endCh = Math.min(header.channelCount, Math.ceil((canvas.height - offsetY) / zoomY));

        // Draw Data Points
        for (let f = startFrame; f < endFrame; f++) {
            const frame = parser.getFrame(f);
            if (!frame) continue;

            const x = offsetX + f * zoomX;

            for (let ch = startCh; ch < endCh; ch++) {
                const val = frame[ch];
                if (val === 0) continue;

                const y = offsetY + ch * zoomY;

                // Color mapping: Tesla Red for high values
                const opacity = val / 255;
                ctx.fillStyle = `rgba(232, 32, 32, ${opacity})`;

                // Draw as small rects/dots
                ctx.fillRect(x, y, Math.max(1, zoomX - 1), Math.max(1, zoomY - 1));
            }
        }

        // Draw Overlays (Grids)
        const stepTime = header.stepTime || 20;
        const framesPerSec = 1000 / stepTime;

        if (showGrid.s1) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1;
            for (let s = 0; s * framesPerSec < header.frameCount; s++) {
                const x = offsetX + (s * framesPerSec) * zoomX;
                if (x < 0 || x > canvas.width) continue;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvas.height);
                ctx.stroke();
            }
        }

        if (showGrid.s10) {
            ctx.strokeStyle = 'rgba(0, 150, 255, 0.3)';
            ctx.lineWidth = 2;
            for (let s = 0; s * framesPerSec < header.frameCount; s += 10) {
                const x = offsetX + (s * framesPerSec) * zoomX;
                if (x < 0 || x > canvas.width) continue;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvas.height);
                ctx.stroke();
            }
        }

        if (showGrid.s60) {
            ctx.strokeStyle = 'rgba(232, 32, 32, 0.4)';
            ctx.lineWidth = 3;
            for (let s = 0; s * framesPerSec < header.frameCount; s += 60) {
                const x = offsetX + (s * framesPerSec) * zoomX;
                if (x < 0 || x > canvas.width) continue;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvas.height);
                ctx.stroke();
            }
        }

        // Channel Labels (Y-axis)
        ctx.fillStyle = 'white';
        ctx.font = '10px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        for (let ch = startCh; ch < endCh; ch++) {
            if (ch % 5 === 0 || zoomY > 15) {
                const y = offsetY + ch * zoomY + zoomY / 2;
                ctx.fillText(`CH ${ch}`, 5, y);
            }
        }

        // Time labels (X-axis)
        for (let s = 0; s * framesPerSec < header.frameCount; s += 5) {
            const x = offsetX + (s * framesPerSec) * zoomX;
            if (x < 0 || x > canvas.width) continue;
            ctx.fillText(`${s}s`, x + 2, 10);
        }

    }, [fseqData, viewState, showGrid]);

    const handleWheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY;
        const factor = delta > 0 ? 0.9 : 1.1;

        if (e.ctrlKey) {
            // Zoom Y
            setViewState(prev => ({ ...prev, zoomY: Math.min(50, Math.max(1, prev.zoomY * factor)) }));
        } else {
            // Zoom X
            setViewState(prev => ({ ...prev, zoomX: Math.min(100, Math.max(0.1, prev.zoomX * factor)) }));
        }
    };

    const handleMouseDown = (e) => {
        setDragStart({ x: e.clientX, y: e.clientY, ox: viewState.offsetX, oy: viewState.offsetY });
    };

    const handleMouseMove = (e) => {
        if (!dragStart) return;
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        setViewState(prev => ({
            ...prev,
            offsetX: dragStart.ox + dx,
            offsetY: dragStart.oy + dy
        }));
    };

    const handleMouseUp = () => setDragStart(null);

    return (
        <div className="fseq-viewer-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#111', color: 'white' }}>
            <div className="fseq-toolbar" style={{ padding: '10px', display: 'flex', alignItems: 'center', gap: '15px', background: '#1a1a1a', borderBottom: '1px solid #333' }}>
                <button onClick={onExit} className="btn-icon" title="Back"><ArrowLeft size={18} /></button>

                <div className="upload-btn-wrapper">
                    <button className="btn-tesla-small"><Upload size={16} /> Load FSEQ</button>
                    <input type="file" accept=".fseq" onChange={handleFileUpload} />
                </div>

                {fseqData && (
                    <div className="fseq-info" style={{ fontSize: '13px', color: '#aaa', display: 'flex', gap: '15px' }}>
                        <span><strong>Channels:</strong> {fseqData.header.channelCount}</span>
                        <span><strong>Frames:</strong> {fseqData.header.frameCount}</span>
                        <span><strong>Duration:</strong> {fseqData.header.duration.toFixed(2)}s</span>
                        <span><strong>Step:</strong> {fseqData.header.stepTime}ms</span>
                    </div>
                )}

                <div style={{ flex: 1 }} />

                <div className="grid-toggles" style={{ display: 'flex', gap: '8px' }}>
                    <button
                        className={`toggle-btn-small ${showGrid.s1 ? 'active' : ''}`}
                        onClick={() => setShowGrid(p => ({ ...p, s1: !p.s1 }))}
                    >1s</button>
                    <button
                        className={`toggle-btn-small ${showGrid.s10 ? 'active' : ''}`}
                        onClick={() => setShowGrid(p => ({ ...p, s10: !p.s10 }))}
                    >10s</button>
                    <button
                        className={`toggle-btn-small ${showGrid.s60 ? 'active' : ''}`}
                        onClick={() => setShowGrid(p => ({ ...p, s60: !p.s60 }))}
                    >1m</button>
                </div>

                <div className="view-hints" style={{ fontSize: '11px', color: '#777' }}>
                    Wheel: Zoom X | Ctrl+Wheel: Zoom Y | Drag: Pan
                </div>
            </div>

            <div
                ref={containerRef}
                className="fseq-canvas-wrapper"
                style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: dragStart ? 'grabbing' : 'grab' }}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                {!fseqData ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.5 }}>
                        <Upload size={48} />
                        <p>Upload an .fseq file to begin inspection</p>
                    </div>
                ) : (
                    <canvas ref={canvasRef} style={{ display: 'block' }} />
                )}
            </div>

            <style>{`
                .btn-icon { background: none; border: none; color: white; cursor: pointer; padding: 5px; opacity: 0.7; }
                .btn-icon:hover { opacity: 1; color: #e82020; }
                
                .upload-btn-wrapper { position: relative; overflow: hidden; display: inline-block; }
                .upload-btn-wrapper input[type=file] { position: absolute; left: 0; top: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
                
                .btn-tesla-small {
                    background: #e82020; color: white; border: none; border-radius: 4px; padding: 5px 12px;
                    font-size: 13px; cursor: pointer; display: flex; alignItems: center; gap: 6px;
                }

                .toggle-btn-small {
                    background: #333; color: #888; border: 1px solid #444; border-radius: 4px;
                    padding: 3px 8px; font-size: 11px; cursor: pointer;
                }
                .toggle-btn-small.active {
                    background: #444; color: white; border-color: #666;
                }
                .toggle-btn-small.active:nth-child(2) { border-color: #0096ff; color: #0096ff; }
                .toggle-btn-small.active:nth-child(3) { border-color: #e82020; color: #e82020; }
            `}</style>
        </div>
    );
};

export default FseqViewer;
