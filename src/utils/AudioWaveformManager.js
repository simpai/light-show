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
                    const targetBins = 32;

                    // Pre-compute Logarithmic (Mel-like) Bin Mapping
                    // Focus on 20Hz to 12,000Hz where musical energy lives
                    const minFreq = 20;
                    const maxFreq = 12000;
                    const nyquist = sampleRate / 2;
                    const freqsPerBin = nyquist / (fftSize / 2);

                    // Calculate the log range
                    const minLog = Math.log10(minFreq);
                    const maxLog = Math.log10(maxFreq);
                    const logRange = maxLog - minLog;

                    // Pre-calculate which FFT bins belong to which of the 128 target bins
                    const binMappings = Array.from({ length: targetBins }, () => []);

                    for (let i = 0; i < (fftSize / 2); i++) {
                        const freq = i * freqsPerBin;
                        if (freq < minFreq || freq > maxFreq) continue;

                        // Map frequency to a 0-1 range on log scale
                        const normalizedLog = (Math.log10(freq) - minLog) / logRange;

                        // Map to target bin (0 to 127)
                        let targetBinIdx = Math.floor(normalizedLog * targetBins);
                        targetBinIdx = Math.max(0, Math.min(targetBins - 1, targetBinIdx));

                        binMappings[targetBinIdx].push(i);
                    }

                    // Some lower bins might be empty because FFT resolution (e.g. 10.7Hz) 
                    // is not fine enough for the lowest log bins. Fill gaps from the nearest available.
                    let lastValidBin = [0]; // fallback
                    for (let b = 0; b < targetBins; b++) {
                        if (binMappings[b].length === 0) {
                            binMappings[b] = [...lastValidBin];
                        } else {
                            lastValidBin = binMappings[b];
                        }
                    }

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

                            // Downsample using the pre-computed logarithmic bin mapping
                            const downsampled = new Float32Array(targetBins);

                            for (let b = 0; b < targetBins; b++) {
                                const sourceBins = binMappings[b];
                                let sumMag = 0;
                                for (let k = 0; k < sourceBins.length; k++) {
                                    sumMag += magnitudes[sourceBins[k]];
                                }
                                downsampled[b] = sumMag / sourceBins.length;
                            }

                            // Keep in memory
                            spectrogram[i] = downsampled;
                        } else {
                            spectrogram[i] = new Float32Array(targetBins);
                        }
                    }

                    // 1. Find the maximum peak for each individual bin across the whole song
                    const maxVals = new Array(targetBins).fill(0.1); // Avoid division by zero and noise floors
                    for (let i = 0; i < totalPoints; i++) {
                        for (let b = 0; b < targetBins; b++) {
                            if (spectrogram[i][b] > maxVals[b]) {
                                maxVals[b] = spectrogram[i][b];
                            }
                        }
                    }

                    // 2. Normalize every bin to a 0-255 scale (Uint8Array)
                    // This ensures even quiet high-frequency bins will peak at 255.
                    for (let i = 0; i < totalPoints; i++) {
                        const original = spectrogram[i];
                        const normalized8 = new Uint8Array(targetBins);
                        for (let b = 0; b < targetBins; b++) {
                            const val = original[b];
                            const normalizedFloat = (val / maxVals[b]) * 255.0;
                            normalized8[b] = Math.min(255, Math.max(0, Math.round(normalizedFloat)));
                        }
                        spectrogram[i] = normalized8;
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
