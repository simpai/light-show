import { useState } from 'react';
import App from './App';
import EditorApp from './components/EditorApp';

export default function Router() {
    const path = window.location.pathname;

    if (path === '/generator') {
        return <App />;
    } else if (path === '/viewer') {
        // Redirect to old viewer or show message
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                background: '#111',
                color: 'white',
                flexDirection: 'column',
                gap: '20px'
            }}>
                <h1>Viewer Mode</h1>
                <p>Please use the Generator page to create and view shows.</p>
                <a href="/generator" style={{ color: '#e82020' }}>Go to Generator</a>
            </div>
        );
    } else {
        // Default to Editor
        return <EditorApp />;
    }
}
