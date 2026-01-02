/*
 * DAG Viewer Bundle
 * 
 * This bundles React, ReactDOM, and the DAGViewerAdapter component
 * and exposes them as window.DAGViewerBundle for the AMD wrapper.
 */

var React = require('react');
var ReactDOM = require('react-dom');
// ES module default export requires .default
var DAGViewerAdapterModule = require('./DAGViewerAdapter');
var DAGViewerAdapter = DAGViewerAdapterModule.default || DAGViewerAdapterModule;

// Expose as global for AMD wrapper to use
window.DAGViewerBundle = {
    React: React,
    ReactDOM: ReactDOM,
    DAGViewerAdapter: DAGViewerAdapter
};
