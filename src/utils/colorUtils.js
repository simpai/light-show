export const getSpectrogramColor = (binIndex, isActive = true, isEdge = false) => {
    const hue = ((binIndex % 16) / 15) * 280;

    if (!isActive) {
        // Muted/Inactive state for unselected ranges
        return `hsl(${hue}, 30%, 25%)`;
    }

    if (isEdge) {
        // Slightly brighter color for range selector edges
        return `hsl(${hue}, 100%, 65%)`;
    }

    // Standard vibrant rainbow color
    return `hsl(${hue}, 100%, 50%)`;
};
