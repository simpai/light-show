import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Download, Upload, RotateCcw } from 'lucide-react';

/**
 * Generate default column IDs: A, B, C, ... Z, AA, AB, ...
 */
function defaultColIds(count) {
    const ids = [];
    for (let i = 0; i < count; i++) {
        let id = '';
        let n = i;
        do {
            id = String.fromCharCode(65 + (n % 26)) + id;
            n = Math.floor(n / 26) - 1;
        } while (n >= 0);
        ids.push(id);
    }
    return ids;
}

/**
 * Generate default row IDs: 01, 02, 03, ...
 */
function defaultRowIds(count) {
    const ids = [];
    const pad = String(count).length;
    for (let i = 0; i < count; i++) {
        ids.push(String(i + 1).padStart(Math.max(pad, 2), '0'));
    }
    return ids;
}

function createDefaultGridData(cols, rows) {
    const cells = [];
    for (let r = 0; r < rows; r++) {
        cells[r] = [];
        for (let c = 0; c < cols; c++) {
            cells[r][c] = { exists: true, yaw: 0 };
        }
    }
    return {
        cols,
        rows,
        colIds: defaultColIds(cols),
        rowIds: defaultRowIds(rows),
        colFirst: true,
        cells,
    };
}

export { createDefaultGridData };

export default function LayoutGridEditor({ gridData, onApply, onClose }) {
    const [data, setData] = useState(() => {
        if (gridData) return JSON.parse(JSON.stringify(gridData));
        return createDefaultGridData(10, 5);
    });

    const [selectedCells, setSelectedCells] = useState(new Set()); // Set of "r,c"
    const [dragStart, setDragStart] = useState(null);
    const [dragEnd, setDragEnd] = useState(null);
    const [selectionMode, setSelectionMode] = useState('new');
    const [tempSelection, setTempSelection] = useState(new Set());

    const gridRef = useRef(null);
    const fileInputRef = useRef(null);

    // --- Size Change ---
    const handleSizeChange = (newCols, newRows) => {
        setData(prev => {
            const nc = Math.max(1, Math.min(100, newCols));
            const nr = Math.max(1, Math.min(50, newRows));

            // Resize colIds
            const colIds = [...prev.colIds];
            if (nc > colIds.length) {
                const extra = defaultColIds(nc).slice(colIds.length);
                colIds.push(...extra);
            } else {
                colIds.length = nc;
            }

            // Resize rowIds
            const rowIds = [...prev.rowIds];
            if (nr > rowIds.length) {
                const extra = defaultRowIds(nr).slice(rowIds.length);
                rowIds.push(...extra);
            } else {
                rowIds.length = nr;
            }

            // Resize cells
            const cells = [];
            for (let r = 0; r < nr; r++) {
                cells[r] = [];
                for (let c = 0; c < nc; c++) {
                    cells[r][c] = prev.cells[r]?.[c] || { exists: true, yaw: 0 };
                }
            }

            return { ...prev, cols: nc, rows: nr, colIds, rowIds, cells };
        });
        setSelectedCells(new Set());
    };

    // --- Cell Selection ---
    const getCellFromEvent = (e) => {
        const el = e.target.closest('[data-cell]');
        if (!el) return null;
        const [r, c] = el.dataset.cell.split(',').map(Number);
        return { r, c };
    };

    const handleGridMouseDown = (e) => {
        if (e.button !== 0) return;
        const cell = getCellFromEvent(e);
        if (!cell) return;

        const key = `${cell.r},${cell.c}`;
        setDragStart(cell);
        setDragEnd(cell);

        if (e.shiftKey) {
            setSelectionMode('add');
        } else if (e.altKey) {
            e.preventDefault();
            setSelectionMode('subtract');
        } else {
            setSelectionMode('new');
        }
        setTempSelection(new Set([key]));
    };

    const handleGridMouseMove = (e) => {
        if (!dragStart) return;
        const cell = getCellFromEvent(e);
        if (!cell) return;
        setDragEnd(cell);

        if (e.shiftKey) setSelectionMode('add');
        else if (e.altKey) setSelectionMode('subtract');

        const r1 = Math.min(dragStart.r, cell.r);
        const r2 = Math.max(dragStart.r, cell.r);
        const c1 = Math.min(dragStart.c, cell.c);
        const c2 = Math.max(dragStart.c, cell.c);

        const newTemp = new Set();
        for (let rr = r1; rr <= r2; rr++) {
            for (let cc = c1; cc <= c2; cc++) {
                newTemp.add(`${rr},${cc}`);
            }
        }
        setTempSelection(newTemp);
    };

    const handleGridMouseUp = (e) => {
        if (!dragStart) return;
        const mode = e.shiftKey ? 'add' : (e.altKey ? 'subtract' : selectionMode);

        let newSelection;
        if (mode === 'add') {
            newSelection = new Set(selectedCells);
            tempSelection.forEach(k => newSelection.add(k));
        } else if (mode === 'subtract') {
            newSelection = new Set(selectedCells);
            tempSelection.forEach(k => newSelection.delete(k));
        } else {
            newSelection = new Set(tempSelection);
        }
        setSelectedCells(newSelection);
        setDragStart(null);
        setDragEnd(null);
        setTempSelection(new Set());
    };

    // --- Row/Col Header Selection ---
    const handleSelectRow = (r, e) => {
        const keys = [];
        for (let c = 0; c < data.cols; c++) keys.push(`${r},${c}`);
        if (e.shiftKey) {
            setSelectedCells(prev => {
                const next = new Set(prev);
                keys.forEach(k => next.add(k));
                return next;
            });
        } else {
            setSelectedCells(new Set(keys));
        }
    };

    const handleSelectCol = (c, e) => {
        const keys = [];
        for (let r = 0; r < data.rows; r++) keys.push(`${r},${c}`);
        if (e.shiftKey) {
            setSelectedCells(prev => {
                const next = new Set(prev);
                keys.forEach(k => next.add(k));
                return next;
            });
        } else {
            setSelectedCells(new Set(keys));
        }
    };

    // --- Property Editing ---
    const getSelectedInfo = () => {
        if (selectedCells.size === 0) return null;

        const cells = Array.from(selectedCells).map(k => {
            const [r, c] = k.split(',').map(Number);
            return { r, c, cell: data.cells[r]?.[c] };
        }).filter(x => x.cell);

        // Unique rows and cols
        const uniqueRows = [...new Set(cells.map(x => x.r))];
        const uniqueCols = [...new Set(cells.map(x => x.c))];

        // Common col ID (only if all selected cells are in the same column)
        let colId = uniqueCols.length === 1 ? data.colIds[uniqueCols[0]] : null;
        let rowId = uniqueRows.length === 1 ? data.rowIds[uniqueRows[0]] : null;

        // Common exists
        const existsValues = [...new Set(cells.map(x => x.cell.exists))];
        const existsCommon = existsValues.length === 1 ? existsValues[0] : null;

        // Common yaw
        const yawValues = [...new Set(cells.map(x => x.cell.yaw))];
        const yawCommon = yawValues.length === 1 ? yawValues[0] : '';

        // Generated car IDs
        const carIds = cells.map(x => {
            const cid = data.colIds[x.c] || '';
            const rid = data.rowIds[x.r] || '';
            return data.colFirst ? `${cid}${rid}` : `${rid}${cid}`;
        });

        return { cells, uniqueRows, uniqueCols, colId, rowId, existsCommon, yawCommon, carIds };
    };

    const updateSelectedExists = (val) => {
        setData(prev => {
            const next = JSON.parse(JSON.stringify(prev));
            selectedCells.forEach(k => {
                const [r, c] = k.split(',').map(Number);
                if (next.cells[r]?.[c]) next.cells[r][c].exists = val;
            });
            return next;
        });
    };

    const updateSelectedYaw = (val) => {
        const yaw = parseFloat(val);
        if (isNaN(yaw)) return;
        setData(prev => {
            const next = JSON.parse(JSON.stringify(prev));
            selectedCells.forEach(k => {
                const [r, c] = k.split(',').map(Number);
                if (next.cells[r]?.[c]) next.cells[r][c].yaw = ((yaw % 360) + 360) % 360;
            });
            return next;
        });
    };

    const updateColId = (colIndex, newId) => {
        setData(prev => {
            const next = { ...prev, colIds: [...prev.colIds] };
            next.colIds[colIndex] = newId;
            return next;
        });
    };

    const updateRowId = (rowIndex, newId) => {
        setData(prev => {
            const next = { ...prev, rowIds: [...prev.rowIds] };
            next.rowIds[rowIndex] = newId;
            return next;
        });
    };

    const updateSelectedColIds = (newId) => {
        setData(prev => {
            const next = { ...prev, colIds: [...prev.colIds] };
            const cols = new Set();
            selectedCells.forEach(k => cols.add(parseInt(k.split(',')[1])));
            cols.forEach(c => { next.colIds[c] = newId; });
            return next;
        });
    };

    const updateSelectedRowIds = (newId) => {
        setData(prev => {
            const next = { ...prev, rowIds: [...prev.rowIds] };
            const rows = new Set();
            selectedCells.forEach(k => rows.add(parseInt(k.split(',')[0])));
            rows.forEach(r => { next.rowIds[r] = newId; });
            return next;
        });
    };

    const toggleColFirst = () => {
        setData(prev => ({ ...prev, colFirst: !prev.colFirst }));
    };

    // --- JSON Import/Export ---
    const handleExport = () => {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'layout_grid.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const parsed = JSON.parse(ev.target.result);
                if (parsed.cols && parsed.rows && parsed.cells) {
                    setData(parsed);
                    setSelectedCells(new Set());
                } else {
                    alert('Invalid layout JSON');
                }
            } catch (err) {
                alert('Failed to parse JSON: ' + err.message);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    // --- Apply & Close ---
    const handleApply = () => {
        onApply(data);
        onClose();
    };

    // Keyboard shortcut: Escape to close
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const info = getSelectedInfo();

    // Compute visual state for a cell
    const getCellClass = (r, c) => {
        const key = `${r},${c}`;
        const cell = data.cells[r]?.[c];
        const classes = ['le-cell'];
        if (!cell?.exists) classes.push('le-cell-empty');
        if (selectedCells.has(key)) classes.push('le-cell-selected');
        if (dragStart && tempSelection.has(key)) {
            if (selectionMode === 'subtract') classes.push('le-cell-deselecting');
            else classes.push('le-cell-selecting');
        }
        return classes.join(' ');
    };

    return (
        <div className="le-overlay">
            {/* Header */}
            <div className="le-header">
                <div className="le-header-left">
                    <h2 style={{ margin: 0, fontSize: '16px' }}>📐 Layout Grid Editor</h2>

                    <div className="le-size-controls">
                        <span style={{ fontSize: '12px', color: '#888' }}>Size:</span>
                        <input
                            type="number" min={1} max={100}
                            value={data.cols}
                            onChange={e => handleSizeChange(parseInt(e.target.value) || 1, data.rows)}
                            className="le-size-input"
                            title="Columns"
                        />
                        <span style={{ color: '#666' }}>×</span>
                        <input
                            type="number" min={1} max={50}
                            value={data.rows}
                            onChange={e => handleSizeChange(data.cols, parseInt(e.target.value) || 1)}
                            className="le-size-input"
                            title="Rows"
                        />
                    </div>

                    <div className="le-btn-group">
                        <button className="le-btn" onClick={handleExport} title="Export Layout JSON">
                            <Download size={16} /> Export
                        </button>
                        <button className="le-btn" onClick={() => fileInputRef.current?.click()} title="Import Layout JSON">
                            <Upload size={16} /> Import
                        </button>
                        <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
                        <button className="le-btn" onClick={() => {
                            if (confirm('Reset layout to defaults?')) {
                                setData(createDefaultGridData(data.cols, data.rows));
                                setSelectedCells(new Set());
                            }
                        }} title="Reset to Defaults">
                            <RotateCcw size={16} /> Reset
                        </button>
                    </div>
                </div>

                <div className="le-header-right">
                    <button className="le-btn le-btn-primary" onClick={handleApply}>
                        ✓ Apply
                    </button>
                    <button className="le-btn" onClick={onClose} title="Close (Esc)">
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Main Body */}
            <div className="le-body">
                {/* Grid Area */}
                <div className="le-grid-area"
                    onMouseDown={handleGridMouseDown}
                    onMouseMove={handleGridMouseMove}
                    onMouseUp={handleGridMouseUp}
                    onMouseLeave={() => {
                        if (dragStart) handleGridMouseUp({ shiftKey: false, altKey: false });
                    }}
                >
                    <div className="le-grid-scroll">
                        <table className="le-grid-table" ref={gridRef}>
                            <thead>
                                <tr>
                                    <th className="le-corner"></th>
                                    {Array.from({ length: data.cols }, (_, c) => (
                                        <th key={c} className="le-col-header">
                                            <button
                                                className="le-axis-btn"
                                                onClick={(e) => handleSelectCol(c, e)}
                                                title={`Select column ${data.colIds[c]}`}
                                            >
                                                {data.colIds[c]}
                                            </button>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {Array.from({ length: data.rows }, (_, r) => (
                                    <tr key={r}>
                                        <td className="le-row-header">
                                            <button
                                                className="le-axis-btn"
                                                onClick={(e) => handleSelectRow(r, e)}
                                                title={`Select row ${data.rowIds[r]}`}
                                            >
                                                {data.rowIds[r]}
                                            </button>
                                        </td>
                                        {Array.from({ length: data.cols }, (_, c) => {
                                            const cell = data.cells[r]?.[c];
                                            const carId = data.colFirst
                                                ? `${data.colIds[c]}${data.rowIds[r]}`
                                                : `${data.rowIds[r]}${data.colIds[c]}`;
                                            return (
                                                <td
                                                    key={c}
                                                    className={getCellClass(r, c)}
                                                    data-cell={`${r},${c}`}
                                                >
                                                    {cell?.exists && (
                                                        <>
                                                            <div className="le-car-icon"
                                                                style={{ transform: `rotate(${(cell.yaw || 0) + 180}deg)` }}
                                                            >
                                                                ▲
                                                            </div>
                                                            <div className="le-car-label">{carId}</div>
                                                        </>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Properties Panel */}
                <div className="le-props-panel">
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#ccc', borderBottom: '1px solid #444', paddingBottom: '8px' }}>
                        Properties {selectedCells.size > 0 && <span style={{ color: '#888', fontSize: '12px' }}>({selectedCells.size} selected)</span>}
                    </h3>

                    {info ? (
                        <div className="le-props-content">
                            {/* Column ID */}
                            <div className="le-prop-group">
                                <label className="le-prop-label">Column ID {info.uniqueCols.length > 1 && <span style={{ color: '#888', fontWeight: 'normal' }}>({info.uniqueCols.length} cols)</span>}</label>
                                <input
                                    type="text"
                                    className="le-prop-input"
                                    value={info.colId ?? ''}
                                    placeholder={info.uniqueCols.length > 1 ? 'Batch input' : ''}
                                    onChange={e => {
                                        if (info.uniqueCols.length === 1) {
                                            updateColId(info.uniqueCols[0], e.target.value);
                                        } else {
                                            updateSelectedColIds(e.target.value);
                                        }
                                    }}
                                />
                            </div>

                            {/* Row ID */}
                            <div className="le-prop-group">
                                <label className="le-prop-label">Row ID {info.uniqueRows.length > 1 && <span style={{ color: '#888', fontWeight: 'normal' }}>({info.uniqueRows.length} rows)</span>}</label>
                                <input
                                    type="text"
                                    className="le-prop-input"
                                    value={info.rowId ?? ''}
                                    placeholder={info.uniqueRows.length > 1 ? 'Batch input' : ''}
                                    onChange={e => {
                                        if (info.uniqueRows.length === 1) {
                                            updateRowId(info.uniqueRows[0], e.target.value);
                                        } else {
                                            updateSelectedRowIds(e.target.value);
                                        }
                                    }}
                                />
                            </div>

                            {/* Exists Checkbox */}
                            <div className="le-prop-group">
                                <label className="le-prop-label">Car Placed</label>
                                <input
                                    type="checkbox"
                                    checked={info.existsCommon === true}
                                    ref={el => { if (el) el.indeterminate = info.existsCommon === null; }}
                                    onChange={e => updateSelectedExists(e.target.checked)}
                                    className="le-prop-checkbox"
                                />
                            </div>

                            {/* Yaw */}
                            <div className="le-prop-group">
                                <label className="le-prop-label">YAW (°)</label>
                                <input
                                    type="number"
                                    className="le-prop-input"
                                    value={info.yawCommon}
                                    onChange={e => updateSelectedYaw(e.target.value)}
                                    min={0} max={360} step={1}
                                    placeholder="Mixed"
                                />
                                <div className="le-yaw-presets">
                                    {[0, 90, 180, 270].map(v => (
                                        <button key={v} className="le-yaw-btn" onClick={() => updateSelectedYaw(v)}>
                                            {v}°
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* ID Order */}
                            <div className="le-prop-group">
                                <label className="le-prop-label">ID Format</label>
                                <div className="le-id-order">
                                    <label className="le-radio-label">
                                        <input type="radio" name="idOrder" checked={data.colFirst} onChange={toggleColFirst} />
                                        <span>[Col][Row]</span>
                                    </label>
                                    <label className="le-radio-label">
                                        <input type="radio" name="idOrder" checked={!data.colFirst} onChange={toggleColFirst} />
                                        <span>[Row][Col]</span>
                                    </label>
                                </div>
                            </div>

                            {/* Generated Car IDs */}
                            <div className="le-prop-group">
                                <label className="le-prop-label">Car ID(s)</label>
                                <div className="le-car-ids">
                                    {info.carIds.slice(0, 20).map((id, i) => (
                                        <span key={i} className="le-car-id-tag">{id}</span>
                                    ))}
                                    {info.carIds.length > 20 && (
                                        <span className="le-prop-hint">+{info.carIds.length - 20} more</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="le-props-empty">
                            <p>Select cells in the grid to edit properties.</p>
                            <div className="le-help">
                                <div><strong>Click</strong> — Select cell</div>
                                <div><strong>Drag</strong> — Marquee select</div>
                                <div><strong>Shift + Click</strong> — Add to selection</div>
                                <div><strong>Alt + Click</strong> — Remove from selection</div>
                                <div><strong>Header button</strong> — Select entire row/column</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                .le-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 10000;
                    background: #1a1a1a;
                    display: flex;
                    flex-direction: column;
                    color: #eee;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }

                .le-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 8px 16px;
                    background: #222;
                    border-bottom: 1px solid #444;
                    gap: 12px;
                    flex-shrink: 0;
                }
                .le-header-left {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }
                .le-header-right {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .le-size-controls {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .le-size-input {
                    width: 50px;
                    background: #333;
                    border: 1px solid #555;
                    color: #fff;
                    padding: 4px 6px;
                    border-radius: 4px;
                    text-align: center;
                    font-size: 13px;
                }

                .le-btn-group {
                    display: flex;
                    gap: 4px;
                    border-left: 1px solid #444;
                    padding-left: 12px;
                    margin-left: 4px;
                }

                .le-btn {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    padding: 5px 10px;
                    background: #333;
                    border: 1px solid #555;
                    color: #ccc;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    transition: all 0.15s;
                    white-space: nowrap;
                }
                .le-btn:hover {
                    background: #444;
                    color: #fff;
                }
                .le-btn-primary {
                    background: #2a6e2a;
                    border-color: #3a8a3a;
                    color: #fff;
                    font-weight: bold;
                }
                .le-btn-primary:hover {
                    background: #3a8a3a;
                }

                .le-body {
                    display: flex;
                    flex: 1;
                    overflow: hidden;
                }

                .le-grid-area {
                    flex: 1;
                    overflow: auto;
                    padding: 4px;
                    user-select: none;
                    cursor: crosshair;
                }
                .le-grid-scroll {
                    display: inline-block;
                    min-width: 100%;
                    min-height: 100%;
                }

                .le-grid-table {
                    border-collapse: collapse;
                    border-spacing: 0;
                }

                .le-corner {
                    width: 28px;
                    height: 20px;
                    background: #222;
                    position: sticky;
                    left: 0;
                    top: 0;
                    z-index: 3;
                }

                .le-col-header {
                    background: #282828;
                    position: sticky;
                    top: 0;
                    z-index: 2;
                    padding: 0;
                }
                .le-row-header {
                    background: #282828;
                    position: sticky;
                    left: 0;
                    z-index: 2;
                    padding: 0;
                }

                .le-axis-btn {
                    display: block;
                    width: 100%;
                    padding: 2px 4px;
                    background: transparent;
                    border: none;
                    color: #aaa;
                    font-size: 9px;
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.15s;
                    white-space: nowrap;
                }
                .le-axis-btn:hover {
                    background: #3a6ea5;
                    color: #fff;
                }

                .le-cell {
                    width: 32px;
                    height: 32px;
                    border: 1px solid #333;
                    background: #1e1e1e;
                    text-align: center;
                    vertical-align: middle;
                    padding: 1px;
                    transition: background 0.1s;
                    cursor: pointer;
                    position: relative;
                }
                .le-cell:hover {
                    border-color: #666;
                }
                .le-cell-empty {
                    background: #111;
                }
                .le-cell-selected {
                    background: #1a3a1a !important;
                    border-color: #4caf50 !important;
                    box-shadow: inset 0 0 0 1px #4caf50;
                }
                .le-cell-selecting {
                    background: #1a3a1a88 !important;
                    border-color: #4caf5088 !important;
                }
                .le-cell-deselecting {
                    background: #3a1a1a88 !important;
                    border-color: #f4433688 !important;
                }

                .le-car-icon {
                    font-size: 10px;
                    color: #6ecf6e;
                    line-height: 1;
                    transition: transform 0.2s;
                }
                .le-car-empty {
                    font-size: 10px;
                    color: #555;
                }
                .le-car-label {
                    font-size: 12px;
                    color: #777;
                    margin-top: 0px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    max-width: 50px;
                }

                /* Properties Panel */
                .le-props-panel {
                    width: 260px;
                    flex-shrink: 0;
                    background: #222;
                    border-left: 1px solid #444;
                    padding: 12px;
                    overflow-y: auto;
                }
                .le-props-content {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .le-props-empty {
                    color: #666;
                    font-size: 13px;
                }
                .le-props-empty p {
                    margin: 0 0 16px 0;
                }
                .le-help {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    font-size: 12px;
                    color: #555;
                }
                .le-help strong {
                    color: #888;
                }

                .le-prop-group {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .le-prop-label {
                    font-size: 11px;
                    color: #999;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .le-prop-input {
                    background: #333;
                    border: 1px solid #555;
                    color: #fff;
                    padding: 5px 8px;
                    border-radius: 4px;
                    font-size: 13px;
                    width: 100%;
                    box-sizing: border-box;
                }
                .le-prop-input:focus {
                    outline: none;
                    border-color: #6ecf6e;
                }
                .le-prop-checkbox {
                    width: 18px;
                    height: 18px;
                    cursor: pointer;
                    accent-color: #4caf50;
                }
                .le-prop-hint {
                    font-size: 11px;
                    color: #666;
                    font-style: italic;
                }

                .le-yaw-presets {
                    display: flex;
                    gap: 4px;
                    margin-top: 4px;
                }
                .le-yaw-btn {
                    flex: 1;
                    padding: 3px;
                    background: #333;
                    border: 1px solid #555;
                    color: #aaa;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 11px;
                    transition: all 0.15s;
                }
                .le-yaw-btn:hover {
                    background: #444;
                    color: #fff;
                }

                .le-id-order {
                    display: flex;
                    gap: 12px;
                }
                .le-radio-label {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 12px;
                    color: #ccc;
                    cursor: pointer;
                }
                .le-radio-label input[type="radio"] {
                    accent-color: #4caf50;
                }

                .le-car-ids {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 4px;
                }
                .le-car-id-tag {
                    background: #333;
                    border: 1px solid #555;
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-size: 11px;
                    color: #ccc;
                    font-family: monospace;
                }

                .le-multi-id-list {
                    display: flex;
                    flex-direction: column;
                    gap: 3px;
                    max-height: 160px;
                    overflow-y: auto;
                }
                .le-multi-id-row {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .le-multi-id-label {
                    font-size: 10px;
                    color: #666;
                    font-family: monospace;
                    min-width: 28px;
                    text-align: right;
                }
                .le-prop-input-sm {
                    flex: 1;
                    padding: 3px 6px;
                    font-size: 12px;
                }
            `}</style>
        </div>
    );
}
