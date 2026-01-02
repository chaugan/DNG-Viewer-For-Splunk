import React, { useEffect, useRef, useCallback, useMemo } from "react";
import { Graphviz } from "graphviz-react";
import { graphviz } from "d3-graphviz";

export default ({ dot, width, height, zoomEnabled = true }) => {
  // gen css from props
  const style = {
    width: width || "100%",
    height: height || "100%"
  };
  
  // Ref for the container div (not the Graphviz component)
  const containerRef = useRef(null);

  // Generate a unique key based on the DOT content and zoom setting to force re-render
  // This fixes the caching issue where changing rankdir or zoomEnabled doesn't update
  const graphKey = useMemo(() => {
    if (!dot) return 'empty';
    // Simple hash function for the DOT string
    let hash = 0;
    for (let i = 0; i < dot.length; i++) {
      const char = dot.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return 'graph-' + hash + '-zoom-' + zoomEnabled;
  }, [dot, zoomEnabled]);

  // Update style in Graphviz div after render
  useEffect(() => {
    if (containerRef.current) {
      const graphvizDiv = containerRef.current.querySelector('.graphviz-container > div');
      if (graphvizDiv) {
        for (let [k, v] of Object.entries(style)) {
          graphvizDiv.style[k] = v;
        }
      }
    }
  }, [containerRef, style.width, style.height, graphKey]);
  
  // Reset zoom function - finds the SVG and calls resetZoom
  const reset = useCallback(() => {
    if (containerRef.current) {
      // Find the SVG element inside the container
      const svg = containerRef.current.querySelector('svg');
      if (svg) {
        // d3-graphviz stores its instance on the SVG's parent element
        // We need to find the graphviz container and reset its zoom
        const graphvizContainer = svg.parentElement;
        if (graphvizContainer) {
          try {
            // Try to get the graphviz instance and reset zoom
            const gv = graphviz(graphvizContainer);
            if (gv && typeof gv.resetZoom === 'function') {
              gv.resetZoom();
            } else {
              // Fallback: reset the transform on the SVG's first g element
              const gElement = svg.querySelector('g');
              if (gElement) {
                gElement.setAttribute('transform', '');
              }
            }
          } catch (e) {
            // Fallback: reset the transform on the SVG's first g element
            const gElement = svg.querySelector('g');
            if (gElement) {
              gElement.setAttribute('transform', '');
            }
          }
        }
      }
    }
  }, []);
  
  return (
    <div
      ref={containerRef}
      style={{
        ...style,
        position: "relative"
      }}
    >
      {dot && dot !== ""
        ? [
            <div key="graphviz-wrapper" className="graphviz-container" style={{ width: '100%', height: '100%' }}>
              <Graphviz
                key={graphKey}
                dot={dot}
                options={{
                  useWorker: false,
                  width: style.width,
                  height: style.height,
                  zoom: zoomEnabled,
                  fit: true
                }}
              />
            </div>,
            zoomEnabled && (
              <button
                key="reset"
                onClick={reset}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "10px",
                  zIndex: 1000,
                  padding: "5px 10px",
                  cursor: "pointer",
                  backgroundColor: "#f0f0f0",
                  border: "1px solid #ccc",
                  borderRadius: "3px",
                  fontSize: "12px"
                }}
              >
                Reset View
              </button>
            )
          ].filter(Boolean)
        : <div style={{ padding: "20px", textAlign: "center" }}>No graph data available</div>}
    </div>
  );
};
