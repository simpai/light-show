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
}
