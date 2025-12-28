/*
 Leaflet.idw (Inverse Distance Weighting)
 MODE: GLOBAL COVERAGE
 - Removed all distance limits.
 - Every pixel on the map will now have a color.
*/
(function () {
    'use strict';

    function IDW(canvas) {
        if (!(this instanceof IDW)) {
            return new IDW(canvas);
        }
        this._canvas = canvas = typeof canvas === 'string' ? document.getElementById(canvas) : canvas;
        this._ctx = canvas.getContext('2d');
        this._width = canvas.width;
        this._height = canvas.height;
        this._max = 1;
        this._data = [];
        this._gradientCache = {};
    }

    IDW.prototype = {
        data: function (data) {
            this._data = data;
            return this;
        },
        max: function (max) {
            this._max = max;
            return this;
        },
        add: function (point) {
            this._data.push(point);
            return this;
        },
        clear: function () {
            this._data = [];
            return this;
        },
        radius: function (r) {
            this._range = r;
            return this;
        },
        resize: function () {
            this._width = this._canvas.width;
            this._height = this._canvas.height;
        },
        gradient: function (grad) {
            this._gradOption = grad;
            this._precomputeGradient();
            return this;
        },
        
        _precomputeGradient: function() {
            var canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 1;
            var ctx = canvas.getContext('2d');
            var gradient = ctx.createLinearGradient(0, 0, 256, 0);

            for (var i in this._gradOption) {
                gradient.addColorStop(parseFloat(i), this._gradOption[i]);
            }

            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 256, 1);

            var imgData = ctx.getImageData(0, 0, 256, 1).data;
            this._palette = [];

            for (var i = 0; i < 256; i++) {
                var r = imgData[i * 4];
                var g = imgData[i * 4 + 1];
                var b = imgData[i * 4 + 2];
                var a = 0.6; // Opacity
                this._palette.push('rgba(' + r + ',' + g + ',' + b + ',' + a + ')');
            }
        },

        draw: function (opacity, cellSize, exp) {
            var ctx = this._ctx;
            ctx.clearRect(0, 0, this._width, this._height);

            var data = this._data,
                len = data.length,
                max = this._max,
                cell = cellSize || 20,     
                exponent = exp || 2;       

            if(!this._palette) this._precomputeGradient();

            for (var y = 0; y < this._height; y += cell) {
                for (var x = 0; x < this._width; x += cell) {
                    
                    var numerator = 0;
                    var denominator = 0;
                    
                    // CHECK ALL STATIONS (Global Influence)
                    for (var k = 0; k < len; k++) {
                        var p = data[k];
                        var dist = Math.sqrt(Math.pow((x + cell/2) - p[0], 2) + Math.pow((y + cell/2) - p[1], 2));
                        
                        var weight = dist === 0 ? 1000 : 1 / Math.pow(dist, exponent);
                        numerator += p[2] * weight;
                        denominator += weight;
                    }

                    var interpolatedValue = -1;
                    if(denominator > 0) {
                        interpolatedValue = numerator / denominator;
                    }

                    if(interpolatedValue >= 0) {
                        // Normalize 0.0 to 1.0
                        var ratio = (interpolatedValue / max);
                        if(ratio > 1) ratio = 1;
                        if(ratio < 0) ratio = 0;

                        // Map to Palette
                        var paletteIndex = Math.floor(ratio * 255);
                        ctx.fillStyle = this._palette[paletteIndex];
                        ctx.fillRect(x, y, cell, cell);
                    }
                }
            }
            return this;
        }
    };

    L.IdwLayer = (L.Layer ? L.Layer : L.Class).extend({
        initialize: function (latlngs, options) {
            this._latlngs = latlngs;
            L.setOptions(this, options);
        },
        setLatLngs: function (latlngs) {
            this._latlngs = latlngs;
            return this.redraw();
        },
        addLatLng: function (latlng) {
            this._latlngs.push(latlng);
            return this.redraw();
        },
        setOptions: function (options) {
            L.setOptions(this, options);
            if (this._idw) {
                this._updateOptions();
                this.redraw();
            }
            return this;
        },
        redraw: function () {
            if (this._idw && !this._frame && !this._map._animating) {
                this._frame = L.Util.requestAnimFrame(this._redraw, this);
            }
            return this;
        },
        onAdd: function (map) {
            this._map = map;
            if (!this._canvas) this._initCanvas();
            if (this.options.pane) this.getPane().appendChild(this._canvas);
            else map._panes.overlayPane.appendChild(this._canvas);
            map.on('moveend', this._reset, this);
            if (map.options.zoomAnimation && L.Browser.any3d) map.on('zoomanim', this._animateZoom, this);
            this._reset();
        },
        onRemove: function (map) {
            if (this.options.pane) this.getPane().removeChild(this._canvas);
            else map.getPanes().overlayPane.removeChild(this._canvas);
            map.off('moveend', this._reset, this);
            if (map.options.zoomAnimation) map.off('zoomanim', this._animateZoom, this);
        },
        addTo: function (map) {
            map.addLayer(this);
            return this;
        },
        _initCanvas: function () {
            var canvas = this._canvas = L.DomUtil.create('canvas', 'leaflet-idw-layer leaflet-layer');
            var originProp = L.DomUtil.testProp(['transformOrigin', 'WebkitTransformOrigin', 'msTransformOrigin']);
            canvas.style[originProp] = '50% 50%';
            var size = this._map.getSize();
            canvas.width = size.x;
            canvas.height = size.y;
            var animated = this._map.options.zoomAnimation && L.Browser.any3d;
            L.DomUtil.addClass(canvas, 'leaflet-zoom-' + (animated ? 'animated' : 'hide'));
            this._idw = new IDW(canvas);
            this._updateOptions();
        },
        _updateOptions: function () {
            this._idw.radius(this.options.radius || 50);
            if (this.options.gradient) this._idw.gradient(this.options.gradient);
            if (this.options.max) this._idw.max(this.options.max);
        },
        _reset: function () {
            var topLeft = this._map.containerPointToLayerPoint([0, 0]);
            L.DomUtil.setPosition(this._canvas, topLeft);
            var size = this._map.getSize();
            if (this._idw._width !== size.x) {
                this._canvas.width = this._idw._width = size.x;
            }
            if (this._idw._height !== size.y) {
                this._canvas.height = this._idw._height = size.y;
            }
            this._redraw();
        },
        _redraw: function () {
            if (!this._map) return;
            var data = [],
                r = 1000, // FORCE INFINITE RADIUS for bounds
                size = this._map.getSize(),
                bounds = new L.Bounds(L.point([-r, -r]), size.add([r, r]));
            var latlngs = this._latlngs;
            for (var i = 0, len = latlngs.length; i < len; i++) {
                var p = this._map.latLngToContainerPoint(latlngs[i]);
                // Removed bounds check to allow off-screen points to influence map
                data.push([p.x, p.y, latlngs[i][2]]);
            }
            this._idw.data(data);
            this._idw.draw(this.options.opacity, this.options.cellSize, this.options.exp);
            this._frame = null;
        },
        _animateZoom: function (e) {
            var scale = this._map.getZoomScale(e.zoom),
                offset = this._map._getCenterOffset(e.center).multiplyBy(-scale).subtract(this._map._getMapPanePos());
            if (L.DomUtil.setTransform) L.DomUtil.setTransform(this._canvas, offset, scale);
            else this._canvas.style[L.DomUtil.TRANSFORM] = L.DomUtil.getTranslateString(offset) + ' scale(' + scale + ')';
        }
    });
    L.idwLayer = function (latlngs, options) {
        return new L.IdwLayer(latlngs, options);
    };
})();