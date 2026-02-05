/**
 * Utility for creating FSEQ V2 binary files (Tesla-compatible)
 */
export class FseqWriter {
    /**
     * @param {number} channelCount - Number of channels (usually 48 for Tesla)
     * @param {number} stepTimeMs - Time per frame in milliseconds (usually 20ms)
     */
    constructor(channelCount = 48, stepTimeMs = 20) {
        this.channelCount = channelCount;
        this.stepTimeMs = stepTimeMs;
    }

    /**
     * Creates a Blob representing the .fseq file
     * @param {Array<Uint8Array>} frames - Array of frame data
     * @returns {Blob}
     */
    createFseq(frames) {
        const frameCount = frames.length;
        const headerSize = 24;
        const dataSize = frameCount * this.channelCount;
        const buffer = new ArrayBuffer(headerSize + dataSize);
        const view = new DataView(buffer);
        const dataUint8 = new Uint8Array(buffer);

        // 1. Magic: PSEQ
        dataUint8.set([0x50, 0x53, 0x45, 0x51], 0);

        // 2. Data Offset (offset to start of channel data)
        view.setUint16(4, headerSize, true);

        // 3. Version
        view.setUint8(6, 0); // Minor
        view.setUint8(7, 2); // Major (FSEQ V2)

        // 4. Variable Header Offset (0 if none)
        view.setUint16(8, 0, true);

        // 5. Channel Count per Frame
        view.setUint32(10, this.channelCount, true);

        // 6. Number of Frames
        view.setUint32(14, frameCount, true);

        // 7. Step Time (ms)
        view.setUint8(18, this.stepTimeMs);

        // 8. Flags (0)
        view.setUint8(19, 0);

        // 9. Compression (0 = none)
        // High 4 bits: Compression type (0=None), Low 12 bits: Block count (0)
        view.setUint16(20, 0, true);

        // 10. Sparse Ranges (0)
        view.setUint8(22, 0);

        // 11. Reserved (0)
        view.setUint8(23, 0);

        // 12. Frame Data
        for (let i = 0; i < frameCount; i++) {
            const offset = headerSize + (i * this.channelCount);
            dataUint8.set(frames[i], offset);
        }

        return new Blob([buffer], { type: 'application/octet-stream' });
    }

    /**
     * Download the .fseq file
     */
    download(frames, filename = 'lightshow.fseq') {
        const blob = this.createFseq(frames);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
