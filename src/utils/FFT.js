export class FFT {
    /**
     * Compute the Fast Fourier Transform of a given array.
     * @param {Float32Array|Array} real Input real values (length must be a power of 2)
     * @param {Float32Array|Array} imag Input imaginary values (usually zeros)
     */
    static transform(real, imag) {
        const n = real.length;
        if (n <= 1) return;

        // Bit-reverse permutation
        const shift = 32 - Math.log2(n);
        for (let i = 0; i < n; i++) {
            const j = FFT._reverseBits(i, shift);
            if (j > i) {
                let temp = real[i];
                real[i] = real[j];
                real[j] = temp;
                temp = imag[i];
                imag[i] = imag[j];
                imag[j] = temp;
            }
        }

        // Cooley-Tukey iterative
        for (let size = 2; size <= n; size *= 2) {
            const halfSize = size / 2;
            const angleStep = -2 * Math.PI / size;
            for (let i = 0; i < n; i += size) {
                let wReal = 1;
                let wImag = 0;
                const wpReal = Math.cos(angleStep);
                const wpImag = Math.sin(angleStep);

                for (let j = 0; j < halfSize; j++) {
                    const u = i + j;
                    const v = i + j + halfSize;
                    const tReal = wReal * real[v] - wImag * imag[v];
                    const tImag = wReal * imag[v] + wImag * real[v];

                    real[v] = real[u] - tReal;
                    imag[v] = imag[u] - tImag;
                    real[u] += tReal;
                    imag[u] += tImag;

                    const nextWReal = wReal * wpReal - wImag * wpImag;
                    const nextWImag = wReal * wpImag + wImag * wpReal;
                    wReal = nextWReal;
                    wImag = nextWImag;
                }
            }
        }
    }

    /**
     * Reverse bits of a 32-bit integer, shifted right
     */
    static _reverseBits(x, shift) {
        x = ((x & 0x55555555) << 1) | ((x & 0xAAAAAAAA) >>> 1);
        x = ((x & 0x33333333) << 2) | ((x & 0xCCCCCCCC) >>> 2);
        x = ((x & 0x0F0F0F0F) << 4) | ((x & 0xF0F0F0F0) >>> 4);
        x = ((x & 0x00FF00FF) << 8) | ((x & 0xFF00FF00) >>> 8);
        x = ((x & 0x0000FFFF) << 16) | ((x & 0xFFFF0000) >>> 16);
        return x >>> shift;
    }

    /**
     * Get magnitudes from real and expected parts
     */
    static getMagnitudes(real, imag) {
        const n = real.length;
        const magnitudes = new Float32Array(n / 2);
        for (let i = 0; i < n / 2; i++) {
            magnitudes[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / (n / 2);
        }
        return magnitudes;
    }

    /**
     * Apply Hann windowing function to smooth signal ends
     */
    static applyWindow(buffer) {
        const windowed = new Float32Array(buffer.length);
        const n = buffer.length;
        for (let i = 0; i < n; i++) {
            // Hann window: 0.5 * (1 - cos(2*pi*n/(N-1)))
            windowed[i] = buffer[i] * 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
        }
        return windowed;
    }
}
