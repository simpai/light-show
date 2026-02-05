// Custom icon combining Play triangle and Bookmark shape
export const PlayFromBookmarkIcon = ({ size = 20, className, style }) => {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            style={style}
        >
            {/* Play triangle (main, larger) */}
            <path
                d="M 5 3 L 5 21 L 19 12 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
            />

            {/* Bookmark shape overlapping bottom-right */}
            <path
                d="M 14 14 L 14 23 L 18 20 L 22 23 L 22 14 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
            />
        </svg>
    );
};
