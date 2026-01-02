var webpack = require('webpack');
var path = require('path');
var fs = require('fs');
var MiniCssExtractPlugin = require('mini-css-extract-plugin');
var { RawSource } = require('webpack').sources;
var { Compilation } = require('webpack');

// Plugin to append AMD wrapper after bundle
function AppendAMDWrapperPlugin() {}
AppendAMDWrapperPlugin.prototype.apply = function(compiler) {
    compiler.hooks.thisCompilation.tap('AppendAMDWrapperPlugin', function(compilation) {
        compilation.hooks.processAssets.tap(
            {
                name: 'AppendAMDWrapperPlugin',
                stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_INLINE
            },
            function(assets) {
                var bundleAsset = assets['visualization.js'];
                if (!bundleAsset) return;
                
                // Read the AMD wrapper source
                var wrapperPath = path.join(__dirname, 'src', 'visualization_source.js');
                var wrapperCode = fs.readFileSync(wrapperPath, 'utf8');
                
                // Get the bundle code
                var bundleCode = bundleAsset.source().toString();
                
                // Concatenate: bundle first (sets window.DAGViewerBundle), then AMD wrapper
                var finalCode = bundleCode + '\n\n' + wrapperCode;
                
                // Update the asset
                compilation.updateAsset('visualization.js', new RawSource(finalCode));
            }
        );
    });
};

module.exports = {
    mode: 'production',
    entry: './src/bundle.js',  // Entry is bundle.js (React/d3)
    resolve: {
        modules: [
            path.join(__dirname, 'src'),
            path.join(__dirname, 'node_modules')
        ],
        extensions: ['.js', '.jsx']
    },
    output: {
        path: __dirname,
        filename: 'visualization.js',
        // IIFE is fine - bundle sets window.DAGViewerBundle
        iife: true
    },
    // No externals - we bundle everything for the React part
    externals: {},
    module: {
        rules: [
            {
                test: /\.jsx?$/,
                exclude: /node_modules\/(?!(d3-graphviz|graphviz-react)\/).*/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [
                            ['@babel/preset-env', {
                                targets: {
                                    browsers: ['> 0.2%', 'not dead', 'not ie <= 11']
                                },
                                modules: false
                            }],
                            ['@babel/preset-react', {
                                pragma: 'React.createElement',
                                pragmaFrag: 'React.Fragment'
                            }]
                        ],
                        plugins: [
                            '@babel/plugin-proposal-class-properties'
                        ]
                    }
                }
            },
            {
                test: /\.css$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    'css-loader'
                ]
            },
            {
                test: /\.(png|jpg|gif|svg|eot|ttf|woff|woff2)$/,
                use: [
                    {
                        loader: 'file-loader',
                        options: {
                            publicPath: './',
                            name: '[name].[ext]'
                        }
                    }
                ]
            }
        ]
    },
    plugins: [
        new MiniCssExtractPlugin({
            filename: 'visualization.css'
        }),
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify('production')
        }),
        new AppendAMDWrapperPlugin()
    ],
    optimization: {
        minimize: true
    }
};
