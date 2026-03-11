import React, { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';

export function ConsoleOverlay() {
    const messages = useStore(state => state.consoleMessages);
    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    if (messages.length === 0) return null;

    return (
        <div
            className="console-overlay"
            style={{
                position: 'absolute',
                top: '4px',
                left: '8px',
                width: '600px',
                maxHeight: '100px',
                backgroundColor: 'rgba(20, 20, 25, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                color: '#e0e0e0',
                fontFamily: '"Fira Code", "Courier New", monospace',
                fontSize: '11px',
                padding: '8px',
                overflowY: 'auto',
                pointerEvents: 'none',
                zIndex: 100,
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                scrollbarWidth: 'none', // Hide scrollbar for cleaner look
                msOverflowStyle: 'none'
            }}
            ref={scrollRef}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {messages.map((msg) => (
                    <div key={msg.id} style={{ display: 'flex', gap: '8px', opacity: msg.isProgress ? 1 : 0.9 }}>
                        <span style={{ color: '#666', flexShrink: 0 }}>[{msg.timestamp}]</span>
                        <span style={{
                            color: msg.type === 'error' ? '#ff5555' :
                                msg.type === 'success' ? '#50fa7b' :
                                    msg.type === 'warning' ? '#ffb86c' :
                                        msg.isProgress ? '#8be9fd' : '#f8f8f2',
                            wordBreak: 'break-all'
                        }}>
                            {msg.text}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
