/*
 * DAG Viewer Visualization for Splunk
 * 
 * Pure AMD module - React/ReactDOM come from window.DAGViewerBundle
 * which is set by the bundled code that runs first.
 */

define([
    'jquery',
    'underscore',
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function($, _, SplunkVisualizationBase, vizUtils) {
    
    // Get bundled React from global
    var bundle = window.DAGViewerBundle || {};
    var React = bundle.React;
    var ReactDOM = bundle.ReactDOM;
    var DAGViewerAdapter = bundle.DAGViewerAdapter;

    // Return the visualization class
    return SplunkVisualizationBase.extend({
      
        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.$el = $(this.el);
            this.$el.addClass('dag-viewer-viz');
            
            this.$el.html('<div class="dag-viewer-container"></div>');
            this.reactContainer = this.$el.find('.dag-viewer-container')[0];
            this.reactRoot = null;
            this.currentDot = "";
            this.currentConfig = {};
        },

        /**
         * Get a config value from Splunk's config object
         * Config keys are like: display.visualizations.custom.viz_dag_viewer.dag_viewer.rankdir
         */
        _getConfigValue: function(config, key, defaultValue) {
            if (!config) return defaultValue;
            var fullKey = 'display.visualizations.custom.viz_dag_viewer.dag_viewer.' + key;
            var value = config[fullKey];
            if (value === undefined || value === null || value === '') {
                return defaultValue;
            }
            return value;
        },

        /**
         * Check if a DOT attribute already exists in the string
         */
        _hasAttribute: function(dotString, attrName) {
            // Match attribute with various formats: rankdir=, rankdir =, rankdir="
            var regex = new RegExp('\\b' + attrName + '\\s*=', 'i');
            return regex.test(dotString);
        },

        /**
         * Inject layout options into the DOT string
         * Only adds attributes that are NOT already present in the DOT string
         * DOT string values take precedence over formatter options
         */
        _injectLayoutOptions: function(dotString, options) {
            if (!dotString || dotString.trim() === '') {
                return dotString;
            }
            
            var self = this;
            
            // Build the layout attributes string, only for attributes not in DOT
            var attrs = [];
            if (options.rankdir && !self._hasAttribute(dotString, 'rankdir')) {
                attrs.push('rankdir="' + options.rankdir + '"');
            }
            if (options.splines !== undefined && !self._hasAttribute(dotString, 'splines')) {
                attrs.push('splines=' + options.splines);
            }
            if (options.overlap !== undefined && !self._hasAttribute(dotString, 'overlap')) {
                attrs.push('overlap=' + options.overlap);
            }
            if (options.nodesep && !self._hasAttribute(dotString, 'nodesep')) {
                attrs.push('nodesep="' + options.nodesep + '"');
            }
            if (options.ranksep && !self._hasAttribute(dotString, 'ranksep')) {
                attrs.push('ranksep="' + options.ranksep + '"');
            }
            
            if (attrs.length === 0) {
                return dotString;
            }
            
            var attrsString = '\n    ' + attrs.join(';\n    ') + ';';
            
            // Find the opening brace and insert attributes after it
            // Handle both "digraph {" and "digraph name {"
            var match = dotString.match(/^(\s*(?:di)?graph\s*(?:\w+)?\s*\{)/i);
            if (match) {
                var insertPos = match[0].length;
                return dotString.substring(0, insertPos) + attrsString + dotString.substring(insertPos);
            }
            
            return dotString;
        },

        /**
         * Get field index by name from fieldNames array
         */
        _getFieldIndex: function(fieldNames, name) {
            return _.indexOf(fieldNames, name);
        },

        /**
         * Build node attributes string from available fields
         */
        _buildNodeAttrs: function(row, fieldIndices, nodeId, isSource) {
            var attrs = [];
            var prefix = isSource ? 'source_' : 'target_';
            
            // Check for node-specific or generic attributes
            var colorIdx = fieldIndices[prefix + 'color'] !== -1 ? fieldIndices[prefix + 'color'] : fieldIndices['node_color'];
            var fontcolorIdx = fieldIndices[prefix + 'fontcolor'] !== -1 ? fieldIndices[prefix + 'fontcolor'] : fieldIndices['node_fontcolor'];
            var shapeIdx = fieldIndices[prefix + 'shape'] !== -1 ? fieldIndices[prefix + 'shape'] : fieldIndices['node_shape'];
            var styleIdx = fieldIndices[prefix + 'style'] !== -1 ? fieldIndices[prefix + 'style'] : fieldIndices['node_style'];
            var labelIdx = fieldIndices[prefix + 'label'] !== -1 ? fieldIndices[prefix + 'label'] : fieldIndices['node_label'];
            
            if (colorIdx !== -1 && row[colorIdx]) {
                attrs.push('fillcolor="' + row[colorIdx] + '"');
            }
            if (fontcolorIdx !== -1 && row[fontcolorIdx]) {
                attrs.push('fontcolor="' + row[fontcolorIdx] + '"');
            }
            if (shapeIdx !== -1 && row[shapeIdx]) {
                attrs.push('shape="' + row[shapeIdx] + '"');
            }
            if (styleIdx !== -1 && row[styleIdx]) {
                attrs.push('style="' + row[styleIdx] + '"');
            }
            if (labelIdx !== -1 && row[labelIdx]) {
                attrs.push('label="' + this.escapeDotLabel(row[labelIdx]) + '"');
            }
            
            return attrs;
        },

        /**
         * Build edge attributes string from available fields
         */
        _buildEdgeAttrs: function(row, fieldIndices, label) {
            var attrs = [];
            
            if (label) {
                attrs.push('label="' + this.escapeDotLabel(label) + '"');
            }
            if (fieldIndices['edge_color'] !== -1 && row[fieldIndices['edge_color']]) {
                attrs.push('color="' + row[fieldIndices['edge_color']] + '"');
            }
            if (fieldIndices['edge_fontcolor'] !== -1 && row[fieldIndices['edge_fontcolor']]) {
                attrs.push('fontcolor="' + row[fieldIndices['edge_fontcolor']] + '"');
            }
            if (fieldIndices['edge_style'] !== -1 && row[fieldIndices['edge_style']]) {
                attrs.push('style="' + row[fieldIndices['edge_style']] + '"');
            }
            if (fieldIndices['edge_penwidth'] !== -1 && row[fieldIndices['edge_penwidth']]) {
                attrs.push('penwidth="' + row[fieldIndices['edge_penwidth']] + '"');
            }
            
            return attrs;
        },

        formatData: function(data) {
            if (!data || !data.rows || data.rows.length === 0) {
                return { dot: "" };
            }

            var fields = data.fields || [];
            var rows = data.rows || [];
            
            // Fields might be objects with 'name' property or simple strings
            var fieldNames = _.map(fields, function(f) {
                return typeof f === 'object' && f.name ? f.name : f;
            });
            
            var dotFieldIndex = _.indexOf(fieldNames, 'dot');
            
            if (dotFieldIndex !== -1 && rows.length > 0) {
                var dotValue = rows[0][dotFieldIndex];
                if (dotValue && typeof dotValue === 'string' && dotValue.trim().length > 0) {
                    return { dot: dotValue.trim() };
                }
            }
            
            var sourceIndex = _.indexOf(fieldNames, 'source');
            var targetIndex = _.indexOf(fieldNames, 'target');
            var labelIndex = _.indexOf(fieldNames, 'label');
            
            if (sourceIndex === -1 || targetIndex === -1) {
                return { dot: "" };
            }
            
            // Build field indices for styling attributes
            var fieldIndices = {
                // Node styling
                'node_color': _.indexOf(fieldNames, 'node_color'),
                'node_fontcolor': _.indexOf(fieldNames, 'node_fontcolor'),
                'node_shape': _.indexOf(fieldNames, 'node_shape'),
                'node_style': _.indexOf(fieldNames, 'node_style'),
                'node_label': _.indexOf(fieldNames, 'node_label'),
                // Source-specific styling
                'source_color': _.indexOf(fieldNames, 'source_color'),
                'source_fontcolor': _.indexOf(fieldNames, 'source_fontcolor'),
                'source_shape': _.indexOf(fieldNames, 'source_shape'),
                'source_style': _.indexOf(fieldNames, 'source_style'),
                'source_label': _.indexOf(fieldNames, 'source_label'),
                // Target-specific styling
                'target_color': _.indexOf(fieldNames, 'target_color'),
                'target_fontcolor': _.indexOf(fieldNames, 'target_fontcolor'),
                'target_shape': _.indexOf(fieldNames, 'target_shape'),
                'target_style': _.indexOf(fieldNames, 'target_style'),
                'target_label': _.indexOf(fieldNames, 'target_label'),
                // Edge styling
                'edge_color': _.indexOf(fieldNames, 'edge_color'),
                'edge_fontcolor': _.indexOf(fieldNames, 'edge_fontcolor'),
                'edge_style': _.indexOf(fieldNames, 'edge_style'),
                'edge_penwidth': _.indexOf(fieldNames, 'edge_penwidth')
            };
            
            // Check if any styling fields are present
            var hasNodeStyling = _.some(['node_color', 'node_fontcolor', 'node_shape', 'node_style', 'node_label',
                'source_color', 'source_fontcolor', 'source_shape', 'source_style', 'source_label',
                'target_color', 'target_fontcolor', 'target_shape', 'target_style', 'target_label'], 
                function(key) { return fieldIndices[key] !== -1; });
            
            // Start building DOT with default font
            var dotLines = [
                'digraph {',
                '    fontname="Splunk Platform Sans, Arial, Helvetica, sans-serif";',
                '    node [fontname="Splunk Platform Sans, Arial, Helvetica, sans-serif" style="filled, rounded" shape="box"];',
                '    edge [fontname="Splunk Platform Sans, Arial, Helvetica, sans-serif"];'
            ];
            
            var edges = [];
            var nodeAttrs = {}; // Track node attributes to avoid duplicates
            var self = this;
            
            _.each(rows, function(row) {
                var source = row[sourceIndex];
                var target = row[targetIndex];
                var label = labelIndex !== -1 ? row[labelIndex] : null;
                
                if (source && target) {
                    var sourceId = self.escapeDotId(source);
                    var targetId = self.escapeDotId(target);
                    
                    // Collect node attributes (merge with existing)
                    if (hasNodeStyling) {
                        var srcAttrs = self._buildNodeAttrs(row, fieldIndices, source, true);
                        var tgtAttrs = self._buildNodeAttrs(row, fieldIndices, target, false);
                        
                        if (srcAttrs.length > 0) {
                            nodeAttrs[sourceId] = nodeAttrs[sourceId] || [];
                            nodeAttrs[sourceId] = _.union(nodeAttrs[sourceId], srcAttrs);
                        }
                        if (tgtAttrs.length > 0) {
                            nodeAttrs[targetId] = nodeAttrs[targetId] || [];
                            nodeAttrs[targetId] = _.union(nodeAttrs[targetId], tgtAttrs);
                        }
                    }
                    
                    // Build edge
                    var edgeStr = '    "' + sourceId + '" -> "' + targetId + '"';
                    var edgeAttrs = self._buildEdgeAttrs(row, fieldIndices, label);
                    if (edgeAttrs.length > 0) {
                        edgeStr += ' [' + edgeAttrs.join(' ') + ']';
                    }
                    edgeStr += ';';
                    edges.push(edgeStr);
                }
            });
            
            // Add node definitions with styling
            _.each(nodeAttrs, function(attrs, nodeId) {
                if (attrs.length > 0) {
                    dotLines.push('    "' + nodeId + '" [' + attrs.join(' ') + '];');
                }
            });
            
            // Add edges
            _.each(edges, function(edge) {
                dotLines.push(edge);
            });
            
            dotLines.push('}');
            return { dot: dotLines.join('\n') };
        },
        
        escapeDotId: function(id) {
            if (!id) return '';
            return String(id).replace(/"/g, '\\"').replace(/\n/g, '\\n');
        },
        
        escapeDotLabel: function(label) {
            if (!label) return '';
            return String(label).replace(/"/g, '\\"').replace(/\n/g, '\\n');
        },

        updateView: function(data, config) {
            // Extract formatter options from config
            // Defaults match the recommended values from the attack tree example
            var rankdir = this._getConfigValue(config, 'rankdir', 'TB');
            var splines = this._getConfigValue(config, 'splines', 'true');
            var overlap = this._getConfigValue(config, 'overlap', 'false');
            var nodesep = this._getConfigValue(config, 'nodesep', '0.2');
            var ranksep = this._getConfigValue(config, 'ranksep', '0.4');
            var zoomEnabled = this._getConfigValue(config, 'zoomEnabled', 'true') === 'true';
            
            // Store config for reflow
            this.currentConfig = {
                rankdir: rankdir,
                splines: splines,
                overlap: overlap,
                nodesep: nodesep,
                ranksep: ranksep,
                zoomEnabled: zoomEnabled
            };
            
            // The 'data' parameter is already the result of formatData()
            // Don't call formatData again - just use data.dot directly
            var dotString = "";
            if (data && typeof data.dot === 'string') {
                dotString = data.dot;
            }
            
            // Don't overwrite valid data with empty data
            if (dotString.length > 0) {
                this.currentDot = dotString;
            } else if (this.currentDot && this.currentDot.length > 0) {
                // Keep existing data
                dotString = this.currentDot;
            }
            
            // Inject layout options from formatter into the DOT string
            var processedDot = this._injectLayoutOptions(dotString, this.currentConfig);
            
            var containerWidth = this.$el.width();
            var containerHeight = this.$el.height();
            
            ReactDOM.render(
                React.createElement(DAGViewerAdapter, {
                    dot: processedDot,
                    containerWidth: containerWidth,
                    containerHeight: containerHeight,
                    zoomEnabled: zoomEnabled
                }),
                this.reactContainer
            );
            this.reactRoot = true;
        },

        getInitialDataParams: function() {
            return {
                outputMode: SplunkVisualizationBase.ROW_MAJOR_OUTPUT_MODE,
                count: 10000
            };
        },

        reflow: function() {
            if (this.reactRoot && this.currentDot) {
                var containerWidth = this.$el.width();
                var containerHeight = this.$el.height();
                
                // Re-inject layout options when reflowing
                var processedDot = this._injectLayoutOptions(this.currentDot, this.currentConfig || {});
                var zoomEnabled = this.currentConfig && this.currentConfig.zoomEnabled !== false;
                
                ReactDOM.render(
                    React.createElement(DAGViewerAdapter, {
                        dot: processedDot,
                        containerWidth: containerWidth,
                        containerHeight: containerHeight,
                        zoomEnabled: zoomEnabled
                    }),
                    this.reactContainer
                );
            }
        },
        
        remove: function() {
            if (this.reactContainer && this.reactRoot) {
                try {
                    ReactDOM.unmountComponentAtNode(this.reactContainer);
                } catch (e) {}
                this.reactRoot = null;
            }
            SplunkVisualizationBase.prototype.remove.apply(this, arguments);
        }
    });
});
