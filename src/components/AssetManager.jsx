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
    const fileInputRef = useRef(null);

    if (!isOpen) return null;

    const assets = project?.assets || {};
    const usedIds = project?.getUsedAssetIds ? project.getUsedAssetIds() : new Set();

    const handleUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        setUploading(true);
        try {
            let newAssets = { ...project.assets };
            let lastAssetId = null;

            for (const file of files) {
                try {
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

    const handleAssetClick = (assetId) => {
        if (mode === 'select' && onSelectAsset) {
            onSelectAsset(assetId);
        }
    };

    return (
        <Modal
            title={mode === 'select' ? "Select Image from Library" : "Asset Manager"}
            onClose={onClose}
            className="asset-manager-modal modal-wide"
        >
            <div className="asset-manager-content" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

                <div className="asset-toolbar" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', padding: '0 8px' }}>
                    <div className="asset-stats" style={{ color: '#888', fontSize: '12px' }}>
                        {Object.keys(assets).length} items in library. {usedIds.size} in use.
                    </div>
                    <div>
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
                            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <Upload size={14} />
                            {uploading ? 'Uploading...' : 'Upload New'}
                        </button>
                    </div>
                </div>

                <div className="asset-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                    gap: '16px',
                    overflowY: 'auto',
                    padding: '8px',
                    flex: 1
                }}>
                    {Object.entries(assets).length === 0 ? (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#666' }}>
                            Library is empty. Upload images to use them in clips.
                        </div>
                    ) : (
                        Object.entries(assets).map(([id, asset]) => {
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
                                    className={`asset-card ${mode === 'select' ? 'selectable' : ''} ${isSelected ? 'selected' : ''}`}
                                    onClick={() => handleAssetClick(id)}
                                    style={{
                                        backgroundColor: '#1a1a1a',
                                        border: `2px solid ${isSelected ? '#3b82f6' : '#333'}`,
                                        borderRadius: '8px',
                                        overflow: 'hidden',
                                        cursor: mode === 'select' ? 'pointer' : 'default',
                                        position: 'relative',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <div className="asset-thumb-container" style={{
                                        height: '100px',
                                        background: '#000 url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAHElEQVQYV2NkYGAwZmBgOMuAACA+CWCVMBqSGgA38w8IEU+rYQAAAABJRU5ErkJggg==") repeat',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        position: 'relative'
                                    }}>
                                        {thumbSrc ? (
                                            <img
                                                src={thumbSrc}
                                                alt={asset.name}
                                                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                            />
                                        ) : (
                                            <span style={{ color: '#555', fontSize: '10px' }}>No Preview</span>
                                        )}

                                        {isUsed && (
                                            <div style={{ position: 'absolute', top: '4px', left: '4px', background: 'rgba(16, 185, 129, 0.9)', color: 'white', fontSize: '9px', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold' }}>
                                                In Use
                                            </div>
                                        )}
                                        {isSelected && (
                                            <div style={{ position: 'absolute', top: '4px', right: '4px', color: '#3b82f6' }}>
                                                <CheckCircle2 size={16} fill="currentColor" stroke="#1a1a1a" />
                                            </div>
                                        )}
                                    </div>

                                    <div className="asset-info" style={{ padding: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                                                    style={{ width: '100%', fontSize: '11px', padding: '2px 4px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '2px' }}
                                                />
                                            </div>
                                        ) : (
                                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                                <div
                                                    title={asset.name || 'Unnamed'}
                                                    style={{ fontSize: '12px', color: '#ddd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                                >
                                                    {asset.name || 'Unnamed Asset'}
                                                </div>
                                                <div style={{ fontSize: '9px', color: '#666', marginTop: '2px' }}>
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
