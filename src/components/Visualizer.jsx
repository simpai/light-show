import React from 'react';
import { motion } from 'framer-motion';

const LightRow = ({ label, channels, frameData }) => {
    return (
        <div className="light-row">
            <span className="light-label">{label}</span>
            <div className="light-indicators">
                {channels.map((ch, idx) => {
                    const value = frameData ? frameData[ch] : 0;
                    const opacity = value / 255;
                    return (
                        <div
                            key={idx}
                            className="light-node"
                            style={{
                                background: value > 0 ? '#e82127' : '#333',
                                boxShadow: value > 0 ? `0 0 10px rgba(232, 33, 39, ${opacity})` : 'none',
                                opacity: value > 0 ? opacity : 0.3
                            }}
                        />
                    );
                })}
            </div>
        </div>
    );
};

const Visualizer = ({ frameData }) => {
    if (!frameData) return null;

    // Standard Mapping (48-channel base)
    const mapping = [
        { label: "Main Beams (Outer)", channels: [0, 1] },
        { label: "Main Beams (Inner)", channels: [2, 3] },
        { label: "Signature Beams", channels: [4, 5] },
        { label: "Front Turn", channels: [12, 13] },
        { label: "Front Fog", channels: [14, 15] },
        { label: "Tail Lights", channels: [25, 26] },
        { label: "Rear Turn", channels: [22, 23] },
        { label: "Brake Lights", channels: [24] },
    ];

    return (
        <div className="visualizer-container">
            <div className="car-svg-placeholder">
                <div className="car-top-view">
                    {/* Front Lights */}
                    <div className="front-lights">
                        <div className="lamp left" style={{ opacity: frameData[0] / 255 }}></div>
                        <div className="lamp right" style={{ opacity: frameData[1] / 255 }}></div>
                    </div>
                    {/* Rear Lights */}
                    <div className="rear-lights">
                        <div className="lamp left" style={{ opacity: frameData[25] / 255 }}></div>
                        <div className="lamp right" style={{ opacity: frameData[26] / 255 }}></div>
                    </div>
                </div>
            </div>

            <div className="channels-grid">
                {mapping.map((group, idx) => (
                    <LightRow key={idx} {...group} frameData={frameData} />
                ))}
            </div>
        </div>
    );
};

export default Visualizer;
