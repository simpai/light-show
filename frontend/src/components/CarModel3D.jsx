import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

/**
 * 3D Car Model with individual light objects
 * Each light can be toggled based on the light show sequence
 */
export default function CarModel3D({ position = [0, 0, 0], rotation = 0, frameData = [], lightGroups = {} }) {
    const carRef = useRef();

    // Convert rotation from degrees to radians
    const rotationRadians = (rotation * Math.PI) / 180;

    // Helper function to get light brightness (0-1) for a group
    const getGroupBrightness = (groupName) => {
        const channels = lightGroups[groupName] || [];
        if (channels.length === 0) return 0;

        let maxVal = 0;
        channels.forEach(ch => {
            if (frameData[ch] > maxVal) maxVal = frameData[ch];
        });
        return maxVal / 255;
    };

    const whiteBrightness = getGroupBrightness('MainWhite');
    const redBrightness = getGroupBrightness('Red');
    const yellowBrightness = getGroupBrightness('Yellow');

    return (
        <group ref={carRef} position={position} rotation={[0, rotationRadians, 0]}>
            {/* Car Body */}
            <mesh position={[0, 0.5, 0]}>
                <boxGeometry args={[2, 0.8, 4]} />
                <meshStandardMaterial color="#1a1a1a" metalness={0.8} roughness={0.2} />
            </mesh>

            {/* Car Roof/Cabin */}
            <mesh position={[0, 1.2, -0.3]}>
                <boxGeometry args={[1.8, 0.6, 2]} />
                <meshStandardMaterial color="#0a0a0a" metalness={0.7} roughness={0.3} />
            </mesh>

            {/* HEADLIGHTS (White) */}
            <mesh position={[-0.8, 0.1, 5]} visible={whiteBrightness > 0.01}>
                <boxGeometry args={[1.6, 0.1, 5]} />
                <meshStandardMaterial
                    color="#ffffff"
                    emissive="#ffffff"
                    emissiveIntensity={whiteBrightness * 9}
                    toneMapped={false}
                />
            </mesh>
            <mesh position={[0.8, 0.1, 5]} visible={whiteBrightness > 0.01}>
                <boxGeometry args={[1.6, 0.1, 5]} />
                <meshStandardMaterial
                    color="#ffffff"
                    emissive="#ffffff"
                    emissiveIntensity={whiteBrightness * 9}
                    toneMapped={false}
                />
            </mesh>

            {/* TAILLIGHTS (Red) */}
            <mesh position={[-0.7, 0.6, -2.1]} visible={redBrightness > 0.01}>
                <sphereGeometry args={[1, 16, 16]} />
                <meshStandardMaterial
                    color="#ff0000"
                    emissive="#ff0000"
                    emissiveIntensity={redBrightness * 9}
                    toneMapped={false}
                />
            </mesh>
            <mesh position={[0.7, 0.6, -2.1]} visible={redBrightness > 0.01}>
                <sphereGeometry args={[1, 16, 16]} />
                <meshStandardMaterial
                    color="#ff0000"
                    emissive="#ff0000"
                    emissiveIntensity={redBrightness * 9}
                    toneMapped={false}
                />
            </mesh>

            {/* YELLOW LIGHTS (Signals/Repeaters) */}
            {/* Front Signals */}
            <mesh position={[-0.9, 0.5, 1.5]} visible={yellowBrightness > 0.01}>
                <sphereGeometry args={[0.3, 16, 16]} />
                <meshStandardMaterial
                    color="#ffaa00"
                    emissive="#ffaa00"
                    emissiveIntensity={yellowBrightness * 9}
                    toneMapped={false}
                />
            </mesh>
            <mesh position={[0.9, 0.5, 1.5]} visible={yellowBrightness > 0.01}>
                <sphereGeometry args={[0.3, 16, 16]} />
                <meshStandardMaterial
                    color="#ffaa00"
                    emissive="#ffaa00"
                    emissiveIntensity={yellowBrightness * 9}
                    toneMapped={false}
                />
            </mesh>
            {/* Side Repeaters */}
            <mesh position={[-1.05, 0.7, 0.5]} visible={yellowBrightness > 0.01}>
                <boxGeometry args={[0.1, 0.2, 0.4]} />
                <meshStandardMaterial
                    color="#ffaa00"
                    emissive="#ffaa00"
                    emissiveIntensity={yellowBrightness * 9}
                    toneMapped={false}
                />
            </mesh>
            <mesh position={[1.05, 0.7, 0.5]} visible={yellowBrightness > 0.01}>
                <boxGeometry args={[0.1, 0.2, 0.4]} />
                <meshStandardMaterial
                    color="#ffaa00"
                    emissive="#ffaa00"
                    emissiveIntensity={yellowBrightness * 9}
                    toneMapped={false}
                />
            </mesh>
        </group>
    );
}
