import { FFT } from './FFT.js';

export class AudioWaveformManager {
    /**
     * Decode audio file and generate waveform peaks.
     * @param {File} file The audio file to process.
     * @param {number} pointsPerSecond Resolution of the waveform.
     * @returns {Promise<{peaks: number[], duration: number, spectrogram: Float32Array[], fftSampleRate: number, fftSize: number}>}
     */
    static async generateWaveform(file, pointsPerSecond = 50) {
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
                    // Create spectrogram storage. 
                    // Let's use an FFT size of 4096 samples 
                    const fftSize = 4096;
                    const spectrogram = [];

                    for (let i = 0; i < totalPoints; i++) {
                        const start = i * samplesPerPoint;
                        const end = start + samplesPerPoint;

                        // Waveform Peak
                        let max = 0;
                        for (let j = start; j < end; j++) {
                            const val = Math.abs(leftChannel[j]);
                            if (val > max) max = val;
                        }
                        peaks[i] = max;

                        // Spectrogram Data (STFT)
                        // Take fftSize chunk centered on this point (or starting from this point)
                        const stftStart = Math.min(Math.max(0, start + Math.floor(samplesPerPoint / 2) - fftSize / 2), leftChannel.length - fftSize);
                        let cChunk;
                        if (stftStart >= 0) {
                            cChunk = leftChannel.slice(stftStart, stftStart + fftSize);
                        } else {
                            cChunk = new Float32Array(fftSize);
                            cChunk.set(leftChannel.slice(0, fftSize));
                        }

                        if (cChunk.length === fftSize) {
                            const windowed = FFT.applyWindow(cChunk);
                            const imag = new Float32Array(fftSize);
                            FFT.transform(windowed, imag);
                            const magnitudes = FFT.getMagnitudes(windowed, imag);

                            // Downsample magnitudes to save memory (e.g., from 2048 to 64 bins)
                            // This prevents Out-Of-Memory (OOM) crashes on large audio files
                            const targetBins = 128;
                            const downsampled = new Float32Array(targetBins);
                            const binsPerGroup = Math.floor(magnitudes.length / targetBins);

                            for (let b = 0; b < targetBins; b++) {
                                let sumMag = 0;
                                for (let k = 0; k < binsPerGroup; k++) {
                                    sumMag += magnitudes[b * binsPerGroup + k];
                                }
                                downsampled[b] = sumMag / binsPerGroup;
                            }

                            // Keep in memory
                            spectrogram[i] = downsampled;
                        } else {
                            spectrogram[i] = new Float32Array(128); // match targetBins
                        }
                    }

                    resolve({
                        peaks: Array.from(peaks),
                        duration: duration * 1000, // Convert to ms
                        spectrogram: spectrogram,
                        fftSampleRate: sampleRate,
                        fftSize: fftSize
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
            bpm: 120,
            offset: 0
        };

        // 1. Calculate Intervals (IOI)
        const intervals = [];
        for (let i = 1; i < onsets.length; i++) {
            const interval = onsets[i] - onsets[i - 1];
            // Filter out super short/long intervals (e.g. < 0.2s = >300bpm, > 2.0s = <30bpm)
            if (interval > 0.2 && interval < 2.0) {
                intervals.push(interval);
            }
        }

        if (intervals.length < 10) {
            return { beatTimes: onsets, referenceBeats, bpm: 120, offset: 0 };
        }

        // 2. Histogram of intervals
        const histogram = {};
        const binSize = 0.01; // 10ms bins
        let maxCount = 0;
        let bestInterval = 0.5; // Default 120bpm

        intervals.forEach(val => {
            const bin = Math.round(val / binSize) * binSize;
            histogram[bin] = (histogram[bin] || 0) + 1;
            if (histogram[bin] > maxCount) {
                maxCount = histogram[bin];
                bestInterval = parseFloat(bin);
            }
        });

        // 3. Convert to BPM
        let bpm = 60 / bestInterval;
        // Clamp to reasonable range (e.g. 70-180)
        // If > 180, halve it. If < 70, double it (simple heuristic)
        while (bpm > 180) bpm /= 2;
        while (bpm < 70) bpm *= 2;

        bpm = Math.round(bpm * 10) / 10; // Round to 1 decimal

        // 4. Find Offset (First Beat)
        // Find the onset that best aligns with the grid generated by this BPM
        const beatDur = 60 / bpm;
        let bestOffset = 0;
        let maxCorrelation = -1;

        // Check the first few onsets as potential start points
        const candidates = onsets.slice(0, 10);

        candidates.forEach(candidateOffset => {
            let hits = 0;
            const tolerance = 0.05; // 50ms tolerance

            // Check how many projected beats match actual onsets
            for (let i = 0; i < 20; i++) { // Check next 20 beats
                const targetTime = candidateOffset + (i * beatDur);
                const hasMatch = onsets.some(t => Math.abs(t - targetTime) < tolerance);
                if (hasMatch) hits++;
            }

            if (hits > maxCorrelation) {
                maxCorrelation = hits;
                bestOffset = candidateOffset;
            }
        });

        return {
            beatTimes: onsets,
            referenceBeats: referenceBeats,
            bpm,
            offset: bestOffset
        };
    }
}
