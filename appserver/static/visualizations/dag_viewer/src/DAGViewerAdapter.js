import React from "react";
import DAGViewer from "./DAGViewer";

/**
 * Adapter component that wraps DAGViewer for Splunk visualization container
 * Handles sizing and container constraints specific to Splunk dashboards
 */
export default function DAGViewerAdapter({ dot, containerWidth, containerHeight, zoomEnabled = true }) {
  // Use container dimensions if provided, otherwise use percentage-based sizing
  const width = containerWidth ? `${containerWidth}px` : "100%";
  const height = containerHeight ? `${containerHeight}px` : "100%";

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <DAGViewer 
        dot={dot || ""} 
        width={width} 
        height={height}
        zoomEnabled={zoomEnabled}
      />
    </div>
  );
}

