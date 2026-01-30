export class FseqParser {
    constructor(arrayBuffer) {
        this.data = new DataView(arrayBuffer);
        this.pos = 0;
        this.header = {};
        this.frames = [];
    }

    parse() {
        const magic = String.fromCharCode(
            this.data.getUint8(0),
            this.data.getUint8(1),
            this.data.getUint8(2),
            this.data.getUint8(3)
        );

        if (magic !== 'PSEQ') {
            throw new Error('Not a valid FSEQ file (PSEQ magic missing)');
        }

        // Offset to start of data (2 bytes)
        const startOffset = this.data.getUint16(4, true);
        const minor = this.data.getUint8(6);
        const major = this.data.getUint8(7);

        // Standard FSEQ V2 header parsing
        // Offset 10: channel count (4 bytes)
        const channelCount = this.data.getUint32(10, true);
        const frameCount = this.data.getUint32(14, true);
        const stepTime = this.data.getUint8(18); // ms
        const compression = this.data.getUint8(20);

        if (compression !== 0) {
            throw new Error('Compressed FSEQ files are not supported by the vehicle parser yet.');
        }

        this.header = {
            magic,
            startOffset,
            version: `${major}.${minor}`,
            channelCount,
            frameCount,
            stepTime: stepTime || 20, // Default to 20ms if zero
            duration: (frameCount * (stepTime || 20)) / 1000
        };

        // Parse frames
        const frameDataOffset = startOffset;
        this.frameData = new Uint8Array(this.data.buffer, frameDataOffset);

        return this.header;
    }

    getFrame(frameIndex) {
        if (frameIndex < 0 || frameIndex >= this.header.frameCount) return null;

        const offset = frameIndex * this.header.channelCount;
        return this.frameData.slice(offset, offset + this.header.channelCount);
    }
}
