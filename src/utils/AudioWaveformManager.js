export class AudioWaveformManager {
    /**
     * Decode audio file and generate waveform peaks.
     * @param {File} file The audio file to process.
     * @param {number} pointsPerSecond Resolution of the waveform.
     * @returns {Promise<{peaks: number[], duration: number}>}
     */
    static async generateWaveform(file, pointsPerSecond = 20) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const arrayBuffer = e.target.result;
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();

                try {
                    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                    const duration = audioBuffer.duration;
                    const sampleRate = audioBuffer.sampleRate;
                    const totalPoints = Math.floor(duration * pointsPerSecond);
                    const samplesPerPoint = Math.floor(sampleRate / pointsPerSecond);

                    const leftChannel = audioBuffer.getChannelData(0);
                    const peaks = new Float32Array(totalPoints);

                    for (let i = 0; i < totalPoints; i++) {
                        const start = i * samplesPerPoint;
                        const end = start + samplesPerPoint;
                        let max = 0;
                        for (let j = start; j < end; j++) {
                            const val = Math.abs(leftChannel[j]);
                            if (val > max) max = val;
                        }
                        peaks[i] = max;
                    }

                    resolve({
                        peaks: Array.from(peaks),
                        duration: duration * 1000 // Convert to ms
                    });
                } catch (err) {
                    reject(err);
                } finally {
                    audioContext.close();
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Detect onsets and infer beats from peaks.
     * @param {number[]} peaks 
     * @param {number} pointsPerSecond 
     * @returns {{beatTimes: number[], referenceBeats: number[], bpm: number}}
     */
    static detectBeats(peaks, pointsPerSecond) {
        const onsets = [];
        const minThreshold = 0.15;
        const debounceInterval = Math.floor(pointsPerSecond * 0.15); // 150ms debounce

        for (let i = 2; i < peaks.length; i++) {
            // Basic peak detection: higher than threshold and previous values
            if (peaks[i] > minThreshold && peaks[i] > peaks[i - 1] && peaks[i] > peaks[i - 2]) {
                // Check local neighborhood
                let isLocalMax = true;
                const window = Math.floor(pointsPerSecond * 0.1);
                for (let j = Math.max(0, i - window); j < Math.min(peaks.length, i + window); j++) {
                    if (peaks[j] > peaks[i]) {
                        isLocalMax = false;
                        break;
                    }
                }

                if (isLocalMax) {
                    onsets.push(i / pointsPerSecond);
                    i += debounceInterval;
                }
            }
        }

        // Identify "Reference Beats" (Strong onsets)
        // We consider an onset a reference beat if it's significantly louder than the local average
        const referenceBeats = [];
        onsets.forEach(time => {
            const idx = Math.floor(time * pointsPerSecond);
            if (peaks[idx] > 0.4) { // Absolute threshold for "strong"
                referenceBeats.push(time);
            }
        });

        return {
            beatTimes: onsets,
            referenceBeats: referenceBeats,
            bpm: 120 // Fallback
        };
    }
}
