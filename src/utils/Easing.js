/**
 * Easing functions library
 * All functions take t ∈ [0, 1] and return eased value ∈ [0, 1]
 * Reference: https://easings.net/
 */

const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;
const c4 = (2 * Math.PI) / 3;
const c5 = (2 * Math.PI) / 4.5;

const EASINGS = {
    linear: t => t,

    // Sine
    easeInSine: t => 1 - Math.cos((t * Math.PI) / 2),
    easeOutSine: t => Math.sin((t * Math.PI) / 2),
    easeInOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,

    // Quad
    easeInQuad: t => t * t,
    easeOutQuad: t => 1 - (1 - t) * (1 - t),
    easeInOutQuad: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,

    // Cubic
    easeInCubic: t => t * t * t,
    easeOutCubic: t => 1 - Math.pow(1 - t, 3),
    easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,

    // Quart
    easeInQuart: t => t * t * t * t,
    easeOutQuart: t => 1 - Math.pow(1 - t, 4),
    easeInOutQuart: t => t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2,

    // Quint
    easeInQuint: t => t * t * t * t * t,
    easeOutQuint: t => 1 - Math.pow(1 - t, 5),
    easeInOutQuint: t => t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2,

    // Expo
    easeInExpo: t => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
    easeOutExpo: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
    easeInOutExpo: t => t === 0 ? 0 : t === 1 ? 1 : t < 0.5
        ? Math.pow(2, 20 * t - 10) / 2
        : (2 - Math.pow(2, -20 * t + 10)) / 2,

    // Circ
    easeInCirc: t => 1 - Math.sqrt(1 - Math.pow(t, 2)),
    easeOutCirc: t => Math.sqrt(1 - Math.pow(t - 1, 2)),
    easeInOutCirc: t => t < 0.5
        ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2
        : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2,

    // Back
    easeInBack: t => c3 * t * t * t - c1 * t * t,
    easeOutBack: t => 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2),
    easeInOutBack: t => t < 0.5
        ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
        : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2,

    // Elastic
    easeInElastic: t => t === 0 ? 0 : t === 1 ? 1
        : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4),
    easeOutElastic: t => t === 0 ? 0 : t === 1 ? 1
        : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1,
    easeInOutElastic: t => t === 0 ? 0 : t === 1 ? 1 : t < 0.5
        ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
        : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1,

    // Bounce
    easeOutBounce: t => {
        const n1 = 7.5625;
        const d1 = 2.75;
        if (t < 1 / d1) return n1 * t * t;
        if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
        if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
        return n1 * (t -= 2.625 / d1) * t + 0.984375;
    },
    easeInBounce: t => 1 - EASINGS.easeOutBounce(1 - t),
    easeInOutBounce: t => t < 0.5
        ? (1 - EASINGS.easeOutBounce(1 - 2 * t)) / 2
        : (1 + EASINGS.easeOutBounce(2 * t - 1)) / 2,
};

/**
 * Apply easing function to a progress value
 * @param {number} t Progress value 0-1
 * @param {string} type Easing type name (e.g. 'easeInOutCubic')
 * @returns {number} Eased value 0-1
 */
export function applyEasing(t, type = 'linear') {
    const fn = EASINGS[type];
    if (!fn) return t;
    return fn(Math.max(0, Math.min(1, t)));
}

/** Get all available easing type names */
export const EASING_TYPES = Object.keys(EASINGS);
