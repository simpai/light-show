import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

/**
 * 3D Car Model with individual light objects
 * Each light can be toggled based on the light show sequence
 */
export default function CarModel3D({ position = [0, 0, 0], lightStates = [] }) {
    const carRef = useRef();

    // Light channel mapping (Tesla light show channels)
    // 0: Left headlight
    // 1: Right headlight
    // 2: Left taillight
    // 3: Right taillight
    // 4: Left turn signal (front)
    // 5: Right turn signal (front)

    // Helper function to get light brightness (0-1)
    const getBrightness = (channelIndex) => {
        if (!lightStates || channelIndex >= lightStates.length) return 0;
        return lightStates[channelIndex] / 255;
    };

    // Helper function to check if light should be visible
    const isLightOn = (channelIndex) => {
        return getBrightness(channelIndex) > 0.01; // Threshold
    };

    return (
        <group ref={carRef} position={position}>
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

            {/* Wheels
            <mesh position={[-0.8, 0.2, 1.2]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.3, 0.3, 0.2, 16]} />
                <meshStandardMaterial color="#222" />
            </mesh>
            <mesh position={[0.8, 0.2, 1.2]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.3, 0.3, 0.2, 16]} />
                <meshStandardMaterial color="#222" />
            </mesh>
            <mesh position={[-0.8, 0.2, -1.2]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.3, 0.3, 0.2, 16]} />
                <meshStandardMaterial color="#222" />
            </mesh>
            <mesh position={[0.8, 0.2, -1.2]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.3, 0.3, 0.2, 16]} />
                <meshStandardMaterial color="#222" />
            </mesh>
 */}
            {/* LEFT HEADLIGHT - Channel 0 */}
            <mesh position={[-0.7, 0.6, 2.1]} visible={isLightOn(0)}>
                <sphereGeometry args={[0.8, 16, 16]} />
                <meshStandardMaterial
                    color="#ffffff"
                    emissive="#ffffff"
                    emissiveIntensity={getBrightness(0) * 9}
                    toneMapped={false}
                />
            </mesh>

            {/* RIGHT HEADLIGHT - Channel 1 */}
            <mesh position={[0.7, 0.6, 2.1]} visible={isLightOn(1)}>
                <sphereGeometry args={[0.8, 16, 16]} />
                <meshStandardMaterial
                    color="#ffffff"
                    emissive="#ffffff"
                    emissiveIntensity={getBrightness(1) * 9}
                    toneMapped={false}
                />
            </mesh>

            {/* LEFT TAILLIGHT - Channel 2 */}
            <mesh position={[-0.7, 0.6, -2.1]} visible={isLightOn(2)}>
                <sphereGeometry args={[0.4, 16, 16]} />
                <meshStandardMaterial
                    color="#ff0000"
                    emissive="#ff0000"
                    emissiveIntensity={getBrightness(2) * 9}
                    toneMapped={false}
                />
            </mesh>

            {/* RIGHT TAILLIGHT - Channel 3 */}
            <mesh position={[0.7, 0.6, -2.1]} visible={isLightOn(3)}>
                <sphereGeometry args={[0.4, 16, 16]} />
                <meshStandardMaterial
                    color="#ff0000"
                    emissive="#ff0000"
                    emissiveIntensity={getBrightness(3) * 9}
                    toneMapped={false}
                />
            </mesh>

            {/* LEFT TURN SIGNAL - Channel 4 */}
            <mesh position={[-0.9, 0.5, 1.5]} visible={isLightOn(4)}>
                <sphereGeometry args={[0.3, 16, 16]} />
                <meshStandardMaterial
                    color="#ffaa00"
                    emissive="#ffaa00"
                    emissiveIntensity={getBrightness(4) * 9}
                    toneMapped={false}
                />
            </mesh>

            {/* RIGHT TURN SIGNAL - Channel 5 */}
            <mesh position={[0.9, 0.5, 1.5]} visible={isLightOn(5)}>
                <sphereGeometry args={[0.3, 16, 16]} />
                <meshStandardMaterial
                    color="#ffaa00"
                    emissive="#ffaa00"
                    emissiveIntensity={getBrightness(5) * 9}
                    toneMapped={false}
                />
            </mesh>
        </group>
    );
}
