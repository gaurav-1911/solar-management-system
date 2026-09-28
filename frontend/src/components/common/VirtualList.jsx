import React, { useState, useRef, useCallback, useMemo } from "react";

/**
 * VirtualList
 * High-performance windowed list rendering component.
 * Only renders visible items in the DOM to keep DOM nodes minimal and scroll speed at 60fps.
 */
const VirtualList = ({
  items = [],
  itemHeight = 38,
  height = 240,
  renderItem,
  overscan = 5,
  className = "",
  style = {},
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef(null);

  const handleScroll = useCallback((e) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const totalHeight = items.length * itemHeight;

  const { startIndex, visibleItems, offsetY } = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const end = Math.min(
      items.length,
      Math.ceil((scrollTop + height) / itemHeight) + overscan
    );
    return {
      startIndex: start,
      visibleItems: items.slice(start, end),
      offsetY: start * itemHeight,
    };
  }, [scrollTop, itemHeight, height, overscan, items]);

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={`virtual-list-container ${className}`}
      style={{
        height: typeof height === "number" ? `${height}px` : height,
        overflowY: "auto",
        position: "relative",
        willChange: "transform",
        ...style,
      }}
    >
      <div style={{ height: `${totalHeight}px`, width: "100%", position: "relative" }}>
        <div
          style={{
            transform: `translateY(${offsetY}px)`,
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
          }}
        >
          {visibleItems.map((item, index) =>
            renderItem(item, startIndex + index)
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(VirtualList);
