import React, { useState, useRef, useEffect } from 'react';

export const CustomNumberInput = ({ value, onChange, label, step = 1, min = null, max = null, className = "" }) => {
    const [localValue, setLocalValue] = useState(String(value ?? ''));
    const inputRef = useRef(null);

    useEffect(() => {
        if (document.activeElement !== inputRef.current) {
            setLocalValue(String(value ?? ''));
        } else {
            const parsed = parseFloat(localValue);
            if (!isNaN(parsed) && parsed !== value && String(value) !== '__mixed__') {
                // Prop changed externally while focused (e.g., undo/redo or sync)
                if (Math.abs(parsed - value) > 0.000001) {
                    setLocalValue(String(value ?? ''));
                }
            }
        }
    }, [value, localValue]);

    const handleInput = (e) => {
        const raw = e.target.value;
        setLocalValue(raw);

        // Avoid committing incomplete numbers
        if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;

        const val = parseFloat(raw);
        if (!isNaN(val)) {
            let clamped = val;
            if (min !== null) clamped = Math.max(min, clamped);
            if (max !== null) clamped = Math.min(max, clamped);

            // Only trigger onChange if it actually changed
            if (clamped !== value) {
                onChange(clamped);
            }
        }
    };

    const commit = () => {
        const val = parseFloat(localValue);
        if (!isNaN(val)) {
            let clamped = val;
            if (min !== null) clamped = Math.max(min, clamped);
            if (max !== null) clamped = Math.min(max, clamped);
            if (clamped !== value) {
                onChange(clamped);
            }
            setLocalValue(String(clamped));
        } else {
            setLocalValue(String(value ?? ''));
        }
    };

    return (
        <div className={`custom-number-input-container ${className}`}>
            {label && <label className="compact-label">{label}</label>}
            <input
                ref={inputRef}
                type="text"
                inputMode="decimal"
                className="plain-number-input"
                value={localValue}
                onChange={handleInput}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
                style={{
                    width: '100%', fontSize: '14px', background: '#1e293b', border: '1px solid #334155', borderRadius: '3px', color: '#e2e8f0', height: '24px'
                }}
            />
        </div>
    );
};
