import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import CarModel3D from './CarModel3D';

/**
 * 3D Scene component that displays a grid of cars
 * Replaces the 2D MatrixPreview component
 */
export default function Scene3D({ matrixData, rows = 16, cols = 63 }) {
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

    // Calculate grid spacing
    const carSpacing = 6; // Units between cars
    const gridWidth = cols * carSpacing;
    const gridDepth = rows * carSpacing;

    // Generate car positions and light states
    const cars = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (matrixData[r] && matrixData[r][c]) {
                const x = (c - cols / 2) * carSpacing;
                const z = (r - rows / 2) * carSpacing;
                const lightStates = matrixData[r][c];

                cars.push({
                    key: `car-${r}-${c}`,
                    position: [x, 0, z],
                    lightStates: lightStates
                });
            }
        }
    }

    return (
        <div style={{ width: '100%', height: '100%', background: '#0a0a0a' }}>
            <Canvas
                camera={{
                    position: [gridWidth * 0.4, gridDepth * 0.5, gridDepth * 0.6],
                    fov: 50
                }}
                gl={{ antialias: true, alpha: false }}
            >
                {/* Ambient lighting */}
                <ambientLight intensity={0.3} />

                {/* Directional light (sun) */}
                <directionalLight
                    position={[10, 20, 10]}
                    intensity={0.5}
                    castShadow
                />

                {/* Ground grid */}
                <Grid
                    args={[gridWidth * 1.2, gridDepth * 1.2]}
                    cellSize={carSpacing}
                    cellThickness={0.5}
                    cellColor="#333"
                    sectionSize={carSpacing * 5}
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
                background: 'rgba(0,0,0,0.5)',
                padding: '5px 10px',
                borderRadius: '4px',
                fontFamily: 'monospace'
            }}>
                Grid: {cols} × {rows} cars | Use mouse to orbit, zoom, pan
            </div>
        </div>
    );
}
