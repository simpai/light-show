import React, { useRef } from 'react';
import { Download, Upload, Trash2 } from 'lucide-react';

export function CarGroupManager({ carGroups = [], onUpdate, onSelect }) {
    const appendInputRef = useRef(null);
    const replaceInputRef = useRef(null);

    const handleDelete = (id) => {
        if (window.confirm('Delete this car group?')) {
            onUpdate(carGroups.filter(g => g.id !== id));
        }
    };

    const handleExport = () => {
        const data = JSON.stringify(carGroups, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `car_groups_${new Date().getTime()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = (e, mode) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const imported = JSON.parse(event.target.result);
                if (Array.isArray(imported)) {
                    const validGroups = imported.filter(g => g.name && g.selection).map(g => ({
                        ...g,
                        id: crypto.randomUUID()
                    }));

                    if (mode === 'replace') {
                        onUpdate(validGroups);
                        alert(`Replaced with ${validGroups.length} groups`);
                    } else {
                        onUpdate([...carGroups, ...validGroups]);
                        alert(`Appended ${validGroups.length} groups`);
                    }
                }
            } catch (err) {
                alert('Failed to parse car groups file');
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="car-group-manager">
            <div className="manager-toolbar mb-4">
                <button className="btn-tesla-sm" onClick={handleExport}>
                    <Download size={18} style={{ marginRight: 6 }} /> Export
                </button>
                <button className="btn-secondary" onClick={() => appendInputRef.current?.click()} style={{ marginLeft: 8 }}>
                    <Upload size={18} style={{ marginRight: 6 }} /> Import (Append)
                </button>
                <button className="btn-secondary" onClick={() => replaceInputRef.current?.click()} style={{ marginLeft: 4, color: '#fbbf24', borderColor: '#fbbf24' }}>
                    <Upload size={18} style={{ marginRight: 6 }} /> Import (Replace)
                </button>
                <input
                    ref={appendInputRef}
                    type="file"
                    accept=".json"
                    style={{ display: 'none' }}
                    onChange={(e) => { handleImport(e, 'append'); e.target.value = ''; }}
                />
                <input
                    ref={replaceInputRef}
                    type="file"
                    accept=".json"
                    style={{ display: 'none' }}
                    onChange={(e) => { handleImport(e, 'replace'); e.target.value = ''; }}
                />
            </div>

            <div className="groups-grid">
                {carGroups.length === 0 && (
                    <div className="text-muted text-center p-8">No groups saved yet. Select cars and click the + button in the toolbar.</div>
                )}
                {carGroups.map(group => (
                    <div key={group.id} className="group-item-card">
                        <div className="group-thumbnail" onClick={() => onSelect(group.selection)}>
                            <img src={group.thumbnail} alt={group.name} />
                            <div className="hover-overlay">Apply Selection</div>
                        </div>
                        <div className="group-info">
                            <span className="group-name">{group.name}</span>
                            <span className="car-count">{group.selection.length} cars</span>
                            <button className="btn-delete-plain" onClick={() => handleDelete(group.id)}>
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <style>{`
                .car-group-manager { color: white; }
                .manager-toolbar { display: flex; align-items: center; margin-bottom: 20px; }
                .groups-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
                    gap: 16px;
                }
                .group-item-card {
                    background: #252525;
                    border: 1px solid #333;
                    border-radius: 8px;
                    overflow: hidden;
                    transition: transform 0.2s;
                }
                .group-item-card:hover { transform: translateY(-2px); border-color: #444; }
                .group-thumbnail {
                    aspect-ratio: 16/9;
                    background: #000;
                    position: relative;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .group-thumbnail img {
                    max-width: 100%;
                    max-height: 100%;
                    image-rendering: pixelated;
                }
                .hover-overlay {
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(232, 32, 32, 0.7);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    font-weight: 600;
                    opacity: 0;
                    transition: opacity 0.2s;
                }
                .group-thumbnail:hover .hover-overlay { opacity: 1; }
                .group-info {
                    padding: 8px 10px;
                    display: flex;
                    flex-direction: column;
                    position: relative;
                }
                .group-name { font-size: 13px; font-weight: 600; color: #eee; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 20px; }
                .car-count { font-size: 11px; color: #888; }
                .group-info .btn-delete-plain {
                    position: absolute;
                    top: 8px; right: 6px;
                    color: #444;
                    background: transparent;
                    border: none;
                    padding: 4px;
                    cursor: pointer;
                }
                .group-info .btn-delete-plain:hover { color: #ef4444; }
            `}</style>
        </div>
    );
}
