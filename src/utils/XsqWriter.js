/**
 * Utility for creating xLights (.xsq) sequence files
 * Based on the Tesla Light Show 2022 mapping
 */
export class XsqWriter {
    constructor(channelCount = 48, stepTimeMs = 20) {
        this.channelCount = channelCount;
        this.stepTimeMs = stepTimeMs;

        // Mapping from 0-based internal index to xLights model names
        this.channelNames = [
            "Left Outer Main Beam",      // 0
            "Right Outer Main Beam",     // 1
            "Left Inner Main Beam",      // 2
            "Right Inner Main Beam",     // 3
            "Left Signature",            // 4
            "Right Signature",           // 5
            "Left Channel 4",            // 6
            "Right Channel 4",           // 7
            "Left Channel 5",            // 8
            "Right Channel 5",           // 9
            "Left Channel 6",            // 10
            "Right Channel 6",           // 11
            "Left Front Turn",           // 12
            "Right Front Turn",          // 13
            "Left Front Fog",            // 14
            "Right Front Fog",           // 15
            "Left Aux Park",             // 16
            "Right Aux Park",            // 17
            "Left Side Marker",          // 18
            "Right Side Marker",         // 19
            "Left Side Repeater",        // 20
            "Right Side Repeater",       // 21
            "Left Rear Turn",            // 22
            "Right Rear Turn",           // 23
            "Brake Lights",              // 24
            "Left Tail",                 // 25
            "Right Tail",                // 26
            "Reverse Lights",            // 27
            "Rear Fog Lights",           // 28
            "License Plate",             // 29
            "Left Falcon Door",          // 30
            "Right Falcon Door",         // 31
            "Left Front Door",           // 32
            "Right Front Door",          // 33
            "Left Mirror",               // 34
            "Right Mirror",              // 35
            "Left Front Window",         // 36
            "Left Rear Window",          // 37
            "Right Front Window",        // 38
            "Right Rear Door Handle",    // 39
            "Liftgate",                  // 40
            "Left Front Door Handle",    // 41
            "Left Rear Door Handle",     // 42
            "Right Front Door Handle",   // 43
            "Right Rear Window",         // 44
            "Charge Port"                // 45
            // 46, 47 are often unused or assigned to other things like trunk/frunk in some variants
        ];
    }

    /**
     * Creates a string representing the .xsq XML
     * @param {Array<Uint8Array>} frames - Array of frame data
     * @param {Object} metadata - Optional metadata (song, artist, etc.)
     * @returns {string}
     */
    createXsq(frames, metadata = {}) {
        const frameCount = frames.length;
        const duration = (frameCount * this.stepTimeMs) / 1000;

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<xsequence BaseChannel="0" ChanCtrlBasic="0" ChanCtrlColor="0" FixedPointTiming="1" ModelBlending="true">\n';

        // Head
        xml += '  <head>\n';
        xml += `    <version>2022.24</version>\n`;
        xml += `    <author>${metadata.author || ''}</author>\n`;
        xml += `    <song>${metadata.song || ''}</song>\n`;
        xml += `    <artist>${metadata.artist || ''}</artist>\n`;
        xml += `    <mediaFile>${metadata.mediaFile || 'lightshow.wav'}</mediaFile>\n`;
        xml += `    <sequenceTiming>${this.stepTimeMs} ms</sequenceTiming>\n`;
        xml += `    <sequenceType>Media</sequenceType>\n`;
        xml += `    <sequenceDuration>${duration.toFixed(3)}</sequenceDuration>\n`;
        xml += '  </head>\n';

        xml += '  <nextid>1</nextid>\n';
        xml += '  <ColorPalettes>\n';
        xml += '    <ColorPalette>C_BUTTON_Palette1=#FFFFFF,C_BUTTON_Palette2=#FF0000,C_BUTTON_Palette3=#00FF00,C_BUTTON_Palette4=#0000FF,C_BUTTON_Palette5=#FFFF00,C_BUTTON_Palette6=#000000,C_BUTTON_Palette7=#00FFFF,C_BUTTON_Palette8=#FF00FF,C_CHECKBOX_Palette1=1,C_CHECKBOX_Palette2=1</ColorPalette>\n';
        xml += '  </ColorPalettes>\n';

        // EffectDB - Just 'On' effect for simplicity
        xml += '  <EffectDB>\n';
        xml += '    <Effect></Effect>\n'; // Index 0
        xml += '  </EffectDB>\n';

        // DisplayElements
        xml += '  <DisplayElements>\n';
        xml += '    <Element collapsed="0" type="timing" name="New Timing" visible="1" active="1"/>\n';
        for (const name of this.channelNames) {
            xml += `    <Element collapsed="0" type="model" name="${name}" visible="1"/>\n`;
        }
        xml += '  </DisplayElements>\n';

        // ElementEffects
        xml += '  <ElementEffects>\n';
        xml += '    <Element type="timing" name="New Timing">\n';
        xml += '      <EffectLayer/>\n';
        xml += '    </Element>\n';

        for (let ch = 0; ch < this.channelNames.length; ch++) {
            const name = this.channelNames[ch];
            xml += `    <Element type="model" name="${name}">\n`;
            xml += '      <EffectLayer>\n';

            // Generate effects for this channel
            // We group consecutive frames with same value to save space
            let currentVal = 0;
            let startTime = 0;
            let effectId = 1;

            for (let f = 0; f <= frameCount; f++) {
                const val = (f < frameCount) ? frames[f][ch] : 0;

                if (val !== currentVal) {
                    if (currentVal > 0) {
                        // Close previous effect
                        const endTime = f * this.stepTimeMs;
                        // Intensity in xLights is handled differently, 
                        // but for 'On' effect it's often 0-100 or defined in EffectDB.
                        // Here we use palette 0 (White) and assume intensity is max.
                        // For more complex conversion, we'd need more EffectDB entries.
                        xml += `        <Effect ref="0" name="On" startTime="${startTime}" endTime="${endTime}" palette="0"/>\n`;
                        effectId++;
                    }

                    currentVal = val;
                    startTime = f * this.stepTimeMs;
                }
            }

            xml += '      </EffectLayer>\n';
            xml += '    </Element>\n';
        }
        xml += '  </ElementEffects>\n';

        xml += '</xsequence>\n';
        return xml;
    }

    /**
     * Download the .xsq file
     */
    download(frames, filename = 'lightshow.xsq', metadata = {}) {
        const xml = this.createXsq(frames, metadata);
        const blob = new Blob([xml], { type: 'application/xml' });
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
