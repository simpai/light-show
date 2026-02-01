import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import CarModel3D from './CarModel3D';

/**
 * 3D Scene component that displays a grid of cars
 * Replaces the 2D MatrixPreview component
 */
export default function Scene3D({ matrixData, rows = 16, cols = 63, layoutData = null, colSpacing = 2.5, rowSpacing = 6 }) {
    const [ambientIntensity, setAmbientIntensity] = useState(1.0);

    if (!matrixData || matrixData.length === 0) {
        return (
            <div style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#666',
                fontSize: '14px',
                background: '#0a0a0a'
            }}>
                No preview available
            </div>
        );
    }

    // Use layout data if available, otherwise use simple grid
    const gridWidth = cols * colSpacing;
    const gridDepth = rows * rowSpacing;

    // Generate car positions and light states
    const cars = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (matrixData[r] && matrixData[r][c]) {
                // Get layout info for this position
                let carExists = true;
                let offsetX = 0;
                let offsetY = 0;
                let rotation = 0;

                if (layoutData && layoutData.layout && layoutData.layout[r] && layoutData.layout[r][c]) {
                    const layoutCell = layoutData.layout[r][c];
                    carExists = layoutCell.exists;
                    offsetX = layoutCell.offsetX || 0;
                    offsetY = layoutCell.offsetY || 0;
                    rotation = layoutCell.rotation || 0;
                }

                // Skip if car doesn't exist in layout
                if (!carExists) continue;

                // Calculate base position
                const baseX = (c - cols / 2) * colSpacing;
                const baseZ = (r - rows / 2) * rowSpacing;

                // Apply offsets
                const finalX = baseX + offsetX;
                const finalZ = baseZ + offsetY;

                const lightStates = matrixData[r][c];

                cars.push({
                    key: `car-${r}-${c}`,
                    position: [finalX, 0, finalZ],
                    rotation: rotation,
                    lightStates: lightStates
                });
            }
        }
    }

    return (
        <div style={{ width: '100%', height: '100%', background: '#0a0a0a', margin: 0, padding: 0, display: 'block' }}>
            <Canvas
                style={{ display: 'block', margin: 0, padding: 0 }}
                camera={{
                    position: [gridWidth * 0.4, gridDepth * 0.5, gridDepth * 0.6],
                    fov: 50
                }}
                gl={{ antialias: true, alpha: false }}
            >
                {/* Ambient lighting */}
                <ambientLight intensity={ambientIntensity} />

                {/* Directional light (sun) */}
                <directionalLight
                    position={[10, 20, 10]}
                    intensity={ambientIntensity * 1.5}
                    castShadow
                />

                {/* Ground grid */}
                <Grid
                    args={[gridWidth * 1.2, gridDepth * 1.2]}
                    cellSize={colSpacing}
                    cellThickness={0.5}
                    cellColor="#333"
                    sectionSize={colSpacing * 5}
                    sectionThickness={1}
                    sectionColor="#444"
                    fadeDistance={gridDepth * 2}
                    fadeStrength={1}
                    followCamera={false}
                    infiniteGrid={false}
                />

                {/* Ground plane */}
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
                    <planeGeometry args={[gridWidth * 1.5, gridDepth * 1.5]} />
                    <meshStandardMaterial color="#0a0a0a" roughness={0.8} />
                </mesh>

                {/* Render all cars */}
                {cars.map(car => (
                    <CarModel3D
                        key={car.key}
                        position={car.position}
                        rotation={car.rotation}
                        lightStates={car.lightStates}
                    />
                ))}

                {/* Camera controls */}
                <OrbitControls
                    enableDamping
                    dampingFactor={0.05}
                    minDistance={5}
                    maxDistance={gridDepth * 5}
                    maxPolarAngle={Math.PI / 2.2}
                />

                {/* Environment for reflections */}
                <Environment preset="night" />
            </Canvas>

            {/* Info overlay */}
            <div style={{
                position: 'absolute',
                bottom: '10px',
                left: '10px',
                color: '#888',
                fontSize: '12px',
                background: 'rgba(0,0,0,0.7)',
                padding: '8px 12px',
                borderRadius: '4px',
                fontFamily: 'monospace',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
            }}>
                <div>Grid: {cols} × {rows} ({cars.length} cars) | Use mouse to orbit, zoom, pan</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ minWidth: '80px' }}>Brightness:</span>
                    <input
                        type="range"
                        min="0"
                        max="5"
                        step="0.1"
                        value={ambientIntensity}
                        onChange={(e) => setAmbientIntensity(parseFloat(e.target.value))}
                        style={{ flex: 1, minWidth: '100px' }}
                    />
                    <span style={{ minWidth: '30px', textAlign: 'right' }}>{ambientIntensity.toFixed(1)}</span>
                </div>
            </div>
        </div>
    );
}
