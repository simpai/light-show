import React, { useState, useRef } from 'react';
import { ImageProcessor } from '../utils/ImageProcessor';
import { Upload, X, Trash2, Edit2, Check, CheckCircle2 } from 'lucide-react';
import { Modal } from './common/Modal';

export function AssetManager({
    isOpen,
    onClose,
    project,
    onProjectUpdate,
    mode = 'manage', // 'manage' or 'select'
    onSelectAsset = null,
    selectedAssetId = null
}) {
    const [uploading, setUploading] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState("");
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [tagInput, setTagInput] = useState("");
    const [filterTag, setFilterTag] = useState("");
    const [zoomScale, setZoomScale] = useState(2); // 1, 2, 3, 4
    const fileInputRef = useRef(null);

    if (!isOpen) return null;

    const assets = project?.assets || {};
    const usedIds = project?.getUsedAssetIds ? project.getUsedAssetIds() : new Set();

    const calculateHash = async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    };

    const handleUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        setUploading(true);
        try {
            let newAssets = { ...project.assets };
            let lastAssetId = null;

            for (const file of files) {
                try {
                    const hash = await calculateHash(file);

                    // Check for duplicate hash
                    const existingId = Object.keys(newAssets).find(id => newAssets[id].hash === hash);
                    if (existingId) {
                        console.log(`Skipping duplicate file: ${file.name} (matches ${newAssets[existingId].name})`);
                        lastAssetId = existingId;
                        continue;
                    }

                    let asset;
                    if (file.type === 'image/gif') {
                        asset = await ImageProcessor.parseGIF(file);
                    } else {
                        asset = await ImageProcessor.loadImage(file);
                    }

                    // Generate a thumbnail (first frame) for the manager UI
                    const firstFrame = asset.frames[0];
                    const canvas = document.createElement('canvas');
                    canvas.width = firstFrame.width;
                    canvas.height = firstFrame.height;
                    const ctx = canvas.getContext('2d');
                    ctx.putImageData(firstFrame, 0, 0);
                    asset.thumbnail = canvas.toDataURL('image/png');
                    asset.name = file.name;
                    asset.hash = hash;
                    asset.tags = [];

                    const assetId = crypto.randomUUID();
                    newAssets[assetId] = asset;
                    lastAssetId = assetId;
                } catch (err) {
                    console.error(`Failed to upload ${file.name}:`, err);
                }
            }

            const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
            newProject.assets = newAssets;
            onProjectUpdate(newProject);

            if (mode === 'select' && onSelectAsset && lastAssetId && files.length === 1) {
                onSelectAsset(lastAssetId);
            }

        } catch (err) {
            console.error('Failed to upload assets:', err);
            alert('Failed to upload images: ' + err.message);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDelete = (assetId, e) => {
        e.stopPropagation();
        if (usedIds.has(assetId)) {
            if (!window.confirm("This image is currently in use. Deleting it will remove it from all clips. Are you sure?")) {
                return;
            }
        }

        const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
        if (newProject.removeAsset) {
            newProject.removeAsset(assetId);
        } else {
            // Fallback if method not available
            delete newProject.assets[assetId];
        }
        onProjectUpdate(newProject);
    };

    const startEdit = (assetId, currentName, e) => {
        e.stopPropagation();
        setEditingId(assetId);
        setEditName(currentName || 'Unnamed Asset');
    };

    const saveEdit = (assetId, e) => {
        e?.stopPropagation();
        if (editName.trim()) {
            const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
            if (newProject.renameAsset) {
                newProject.renameAsset(assetId, editName.trim());
            } else {
                newProject.assets[assetId].name = editName.trim();
            }
            onProjectUpdate(newProject);
        }
        setEditingId(null);
    };

    const handleAssetClick = (assetId, e) => {
        if (mode === 'select') {
            if (onSelectAsset) onSelectAsset(assetId);
        } else {
            // Multi-selection logic for manage mode
            const newSelected = new Set(selectedIds);
            if (newSelected.has(assetId)) {
                newSelected.delete(assetId);
            } else {
                newSelected.add(assetId);
            }
            setSelectedIds(newSelected);
        }
    };

    const handleApplyTags = () => {
        if (!tagInput.trim() || selectedIds.size === 0) return;

        const newTags = tagInput.split(',').map(t => t.trim()).filter(t => t);
        const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);

        selectedIds.forEach(id => {
            if (newProject.updateAssetTags) {
                const currentTags = assets[id].tags || [];
                const combinedTags = Array.from(new Set([...currentTags, ...newTags]));
                newProject.updateAssetTags(id, combinedTags);
            } else {
                const currentTags = newProject.assets[id].tags || [];
                newProject.assets[id].tags = Array.from(new Set([...currentTags, ...newTags]));
            }
        });

        onProjectUpdate(newProject);
        setTagInput("");
    };

    const handleRemoveTag = (assetId, tag) => {
        const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
        const currentTags = assets[assetId].tags || [];
        const newTags = currentTags.filter(t => t !== tag);

        if (newProject.updateAssetTags) {
            newProject.updateAssetTags(assetId, newTags);
        } else {
            newProject.assets[assetId].tags = newTags;
        }

        onProjectUpdate(newProject);
    };

    return (
        <Modal
            title={mode === 'select' ? "Select Image from Library" : "Asset Manager"}
            onClose={onClose}
            className="asset-manager-modal modal-wide"
        >
            <div className="asset-manager-content" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

                <div className="asset-toolbar" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', padding: '0 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="zoom-controls" style={{ display: 'flex', background: '#222', padding: '2px', borderRadius: '6px', marginRight: '8px' }}>
                            {[1, 2, 3, 4].map(s => (
                                <button
                                    key={s}
                                    onClick={() => setZoomScale(s)}
                                    style={{
                                        padding: '2px 8px',
                                        fontSize: '11px',
                                        background: zoomScale === s ? '#3b82f6' : 'transparent',
                                        color: zoomScale === s ? 'white' : '#888',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontWeight: 'bold'
                                    }}
                                >
                                    {s}x
                                </button>
                            ))}
                        </div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            accept="image/*"
                            onChange={handleUpload}
                            style={{ display: 'none' }}
                            multiple
                        />
                        <button
                            className="btn btn-primary"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', fontSize: '12px' }}
                        >
                            <Upload size={14} />
                            {uploading ? '...' : 'Upload'}
                        </button>
                    </div>
                </div>

                <div className="tag-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px', padding: '0 8px' }}>
                    <button
                        onClick={() => setFilterTag("")}
                        style={{
                            background: filterTag === "" ? '#3b82f6' : '#222',
                            color: 'white',
                            border: '1px solid #444',
                            padding: '4px 12px',
                            borderRadius: '15px',
                            fontSize: '11px',
                            cursor: 'pointer'
                        }}
                    >
                        All
                    </button>
                    {Array.from(new Set(Object.values(assets).flatMap(a => a.tags || []))).map(tag => (
                        <button
                            key={tag}
                            onClick={() => setFilterTag(tag)}
                            style={{
                                background: filterTag === tag ? '#3b82f6' : '#222',
                                color: 'white',
                                border: '1px solid #444',
                                padding: '4px 12px',
                                borderRadius: '15px',
                                fontSize: '11px',
                                cursor: 'pointer'
                            }}
                        >
                            #{tag}
                        </button>
                    ))}
                </div>

                <div className="asset-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(auto-fill, minmax(${80 * zoomScale}px, 1fr))`,
                    gridAutoRows: 'max-content',
                    alignContent: 'start',
                    gap: '4px',
                    overflowY: 'auto',
                    padding: '4px',
                    flex: 1
                }}>
                    {Object.entries(assets)
                        .filter(([_, asset]) => filterTag === "" || (asset.tags || []).includes(filterTag))
                        .length === 0 ? (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#666' }}>
                            {filterTag === "" ? "Library is empty. Upload images to use them in clips." : `No items found with tag #${filterTag}`}
                        </div>
                    ) : (
                        Object.entries(assets)
                            .filter(([_, asset]) => filterTag === "" || (asset.tags || []).includes(filterTag))
                            .map(([id, asset]) => {
                                const isUsed = usedIds.has(id);
                                const isSelected = id === selectedAssetId;

                                // Try to get thumbnail, fallback to converting first frame if string format not ready
                                let thumbSrc = asset.thumbnail;
                                if (!thumbSrc && asset.frames && asset.frames.length > 0) {
                                    try {
                                        const canvas = document.createElement('canvas');
                                        canvas.width = asset.width;
                                        canvas.height = asset.height;
                                        const ctx = canvas.getContext('2d');
                                        ctx.putImageData(asset.frames[0], 0, 0);
                                        thumbSrc = canvas.toDataURL();
                                    } catch (e) { }
                                }

                                return (
                                    <div
                                        key={id}
                                        className={`asset-card ${mode === 'select' ? 'selectable' : ''} ${(isSelected || selectedIds.has(id)) ? 'selected' : ''}`}
                                        onClick={(e) => handleAssetClick(id, e)}
                                        style={{
                                            backgroundColor: '#1a1a1a',
                                            border: `2px solid ${(isSelected || selectedIds.has(id)) ? '#3b82f6' : '#222'}`,
                                            borderRadius: '6px',
                                            overflow: 'hidden',
                                            cursor: 'pointer',
                                            position: 'relative',
                                            transition: 'all 0.1s',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            height: `${80 * zoomScale}px`
                                        }}
                                    >
                                        <div className="asset-thumb-container" style={{
                                            flex: 1,
                                            background: '#2d3844', // Even darker muted blue
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            position: 'relative',
                                            padding: '2px',
                                            minHeight: 0
                                        }}>
                                            {thumbSrc ? (
                                                <img
                                                    src={thumbSrc}
                                                    alt={asset.name}
                                                    style={{ 
                                                        width: '100%', 
                                                        height: '100%', 
                                                        objectFit: 'contain', 
                                                        imageRendering: 'pixelated' 
                                                    }}
                                                />
                                            ) : (
                                                <span style={{ color: '#555', fontSize: '10px' }}>No Preview</span>
                                            )}

                                            {isUsed && (
                                                <div style={{ position: 'absolute', top: '4px', left: '4px', background: 'rgba(16, 185, 129, 0.9)', color: 'white', fontSize: '9px', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold' }}>
                                                    In Use
                                                </div>
                                            )}
                                            {(isSelected || selectedIds.has(id)) && (
                                                <div style={{ position: 'absolute', top: '4px', right: '4px', color: '#3b82f6' }}>
                                                    <CheckCircle2 size={16} fill="currentColor" stroke="#1a1a1a" />
                                                </div>
                                            )}
                                        </div>

                                        {zoomScale > 1 && (
                                            <div className="asset-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', padding: '2px 4px', background: '#2d3844' }}>
                                                {(asset.tags || []).slice(0, 3).map(tag => (
                                                    <span key={tag} style={{ background: 'rgba(0,0,0,0.3)', color: '#ccc', fontSize: '8px', padding: '0px 4px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                        {tag}
                                                        {mode === 'manage' && (
                                                            <X size={8} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); handleRemoveTag(id, tag); }} />
                                                        )}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        <div className="asset-info" style={{ padding: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '32px' }}>
                                            {editingId === id ? (
                                                <div style={{ display: 'flex', width: '100%' }}>
                                                    <input
                                                        autoFocus
                                                        type="text"
                                                        value={editName}
                                                        onChange={e => setEditName(e.target.value)}
                                                        onKeyDown={e => e.key === 'Enter' && saveEdit(id, e)}
                                                        onClick={e => e.stopPropagation()}
                                                        onBlur={e => saveEdit(id, e)}
                                                        style={{ width: '100%', fontSize: '10px', padding: '1px 3px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '2px' }}
                                                    />
                                                </div>
                                            ) : (
                                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                                    <div
                                                        title={asset.name || 'Unnamed'}
                                                        style={{ fontSize: (zoomScale === 1 ? '9px' : '11px'), color: '#ddd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                                    >
                                                        {asset.name || 'Unnamed'}
                                                    </div>
                                                    <div style={{ fontSize: '8px', color: '#666', marginTop: '0px' }}>
                                                        {asset.width}x{asset.height} • {asset.frames?.length || 1}F
                                                    </div>
                                                </div>
                                            )}

                                            {editingId !== id && mode === 'manage' && (
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <button className="btn-icon" onClick={(e) => startEdit(id, asset.name, e)} style={{ padding: '4px', color: '#888' }} title="Rename">
                                                        <Edit2 size={12} />
                                                    </button>
                                                    <button className="btn-icon" onClick={(e) => handleDelete(id, e)} style={{ padding: '4px', color: '#ef4444' }} title="Delete">
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                    )}
                </div>

                {selectedIds.size > 0 && mode === 'manage' && (
                    <div className="batch-actions" style={{
                        marginTop: '16px',
                        padding: '12px',
                        background: '#222',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        border: '1px solid #333'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{selectedIds.size} selected</span>
                            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedIds(new Set())}>Deselect All</button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                                type="text"
                                placeholder="Add tags (comma separated)"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                style={{ background: '#111', border: '1px solid #444', color: 'white', padding: '6px 10px', borderRadius: '4px', fontSize: '12px', width: '200px' }}
                            />
                            <button className="btn btn-primary btn-sm" onClick={handleApplyTags}>Apply Tags</button>
                        </div>
                    </div>
                )}
            </div>
            <style>{`
                .asset-card:hover {
                    border-color: #555 !important;
                }
                .asset-card.selectable:hover {
                    border-color: #3b82f6 !important;
                    background-color: #1e293b !important;
                }
                .asset-card.selected {
                    border-color: #3b82f6 !important;
                    background-color: #1e293b !important;
                }
            `}</style>
        </Modal>
    );
}
