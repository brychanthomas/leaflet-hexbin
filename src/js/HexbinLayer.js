(function(){
	"use strict";

  // L is defined by the Leaflet library, see git://github.com/Leaflet/Leaflet.git for documentation
	L.HexbinLayer = L.Layer.extend({
		includes: [L.Evented],

		options : {
			radius : 10,
			opacity: 0.5,
			lng: function(d){
				return d[0];
			},
			lat: function(d){
				return d[1];
			},
			value: function(d){
				return d.length;
			},
			valueFloor: 0,
			valueCeil: undefined,
			colorRange: ['#f7fbff', '#08306b'],
			radiusRange: [1, 10],
		},

		initialize : function(options) {
			L.setOptions(this, options);

			this._hexLayout = d3.hexbin()
				.radius(this.options.radius)
				.x(function(d){ return d.point[0]; })
				.y(function(d){ return d.point[1]; });

			this._data = [];
			this._colorScale = d3.scale.linear()
				.range(this.options.colorRange)
				.clamp(true);

			this._radiusScale = d3.scale.sqrt()
				.range(this.options.radiusRange)
				.clamp(true);
		},

		onAdd : function(map) {
			this._map = map;

			// Create a container for svg.
			this._container = this._initContainer();

			// Set up events
			map.on({'moveend': this._redraw}, this);

			// Initial draw
			this._redraw();
		},

		onRemove : function(map) {
			this._destroyContainer();

			// Remove events
			map.off({'moveend': this._redraw}, this);

			this._container = null;
			this._map = null;
			this._data = null;
		},

		addTo : function(map) {
			map.addLayer(this);
			return this;
		},

		_initContainer : function() {
			var container = null;

			// If the container is null or the overlay pane is empty, create the svg element for drawing
			if (null == this._container) {
				var overlayPane = this._map.getPanes().overlayPane;
				container = d3.select(overlayPane).append('svg')
					.attr('class', 'leaflet-layer leaflet-zoom-hide');
			}

			return container;
		},

		_destroyContainer: function(){
			// Remove the svg element
			if(null != this._container){
				this._container.remove();
			}
		},

		// (Re)draws the hexbin group
		_redraw : function(){
			var that = this;

			if (!that._map) {
				return;
			}

			// Generate the mapped version of the data
			var data = that._data.map(function(d) {
				var lng = that.options.lng(d);
				var lat = that.options.lat(d);

				var point = that._project([lng, lat]);
				return { o: d, point: point, d: d };
			});

			var zoom = this._map.getZoom();

			// Determine the bounds from the data and scale the overlay
			var padding = this.options.radius * 2;
			var bounds = this._getBounds(data);
			var width = (bounds.max[0] - bounds.min[0]) + (2 * padding),
				height = (bounds.max[1] - bounds.min[1]) + (2 * padding),
				marginTop = bounds.min[1] - padding,
				marginLeft = bounds.min[0] - padding;

			this._hexLayout.size([ width, height ]);
			this._container
				.attr('width', width).attr('height', height)
				.style('margin-left', marginLeft + 'px')
				.style('margin-top', marginTop + 'px');

			// Select the hex group for the current zoom level. This has
			// the effect of recreating the group if the zoom level has changed
			var join = this._container.selectAll('g.hexbin')
				.data([zoom], function(d){ return d; });

			// enter
			join.enter().append('g')
				.attr('class', function(d) { return 'hexbin zoom-' + d; });

			// enter + update
			join.attr('transform', 'translate(' + -marginLeft + ',' + -marginTop + ')');

			// exit
			join.exit().remove();

			// add the hexagons to the select
			this._createHexagons(join, data);

		},

		_createHexagons : function(g, data) {
			var that = this;

			// Create the bins using the hexbin layout
			var bins = that._hexLayout(data);

			// Determine the extent of the values
			var extent = d3.extent(bins, function(d){
				return that.options.value(d);
			});
			if(null == extent[0]) extent[0] = 0;
			if(null == extent[1]) extent[1] = 0;
			if(null != that.options.valueFloor) extent[0] = that.options.valueFloor;
			if(null != that.options.valueCeil) extent[1] = that.options.valueCeil;

			// Set the colorscale domain to be the extent (after we muck with it a bit)
			that._colorScale.domain(extent);
			that._radiusScale.domain(extent);

			// Update the d3 visualization
			that.hexagons = g.selectAll('path.hexbin-hexagon')
				.data(bins, function(d){ return d.i + ':' + d.j; });

			that.hexagons.transition().duration(200)
				.attr('fill', function(d){ return that._colorScale(d.length); });

			that.hexagons.enter().append('path').attr('class', 'hexbin-hexagon')
				.attr('d', function(d){
					return 'M' + d.x + ',' + d.y + that._hexLayout.hexagon(that._radiusScale(d.length));
				})
				.attr('fill', function(d){ return that._colorScale(d.length); })
				.attr('opacity', 0.01)
				.transition().duration(200)
				.attr('opacity', that.options.opacity)

      if (that.options.hexMouseOver) {
       that.hexagons.on("mouseover", that.options.hexMouseOver);
      }
      if (that.options.hexMouseOut) {
       that.hexagons.on("mouseout", that.options.hexMouseOut);
      }
      if (that.options.hexClick) {
       that.hexagons.on("click", that.options.hexClick);
      }

			that.hexagons.exit().transition().duration(200)
				.attr('opacity', 0.01)
				.remove();
		},

		_project : function(coord) {
			var point = this._map.latLngToLayerPoint([ coord[1], coord[0] ]);
			return [ point.x, point.y ];
		},

		_getBounds: function(data){
			var that = this;

			if(null == data || data.length < 1){
				return { min: [0,0], max: [0,0]};
			}

			// bounds is [[min long, min lat], [max long, max lat]]
			var bounds = [[999, 999], [-999, -999]];

			data.forEach(function(element){
				var x = element.point[0];
				var y = element.point[1];

				bounds[0][0] = Math.min(bounds[0][0], x);
				bounds[0][1] = Math.min(bounds[0][1], y);
				bounds[1][0] = Math.max(bounds[1][0], x);
				bounds[1][1] = Math.max(bounds[1][1], y);
			});

			return { min: bounds[0], max: bounds[1] };
		},

    getBounds: function() {
      var that = this;
			var data = that._data.map(function(d) {
				var lng = that.options.lng(d);
				var lat = that.options.lat(d);

				return { o: d, point: [lng, lat]};
			});
      var bounds = that._getBounds(data);
      return [
        [bounds.min[0], bounds.min[1]],
        [bounds.max[0], bounds.max[1]]
      ]
    },

		/*
		 * Setter for the data
		 */
		data : function(data) {
			this._data = (null != data)? data : [];
			this._redraw();
			return this;
		},

		/*
		 * Getter/setter for the colorScale
		 */
		colorScale: function(colorScale) {
			if(undefined === colorScale){
				return this._colorScale;
			}

			this._colorScale = colorScale;
			this._redraw();
			return this;
		},

		/*
		 * Getter/setter for the radiusScale
		 */
		radiusScale: function(radiusScale) {
			if(undefined === radiusScale){
				return this._radiusScale;
			}

			this._radiusScale = radiusScale;
			this._redraw();
			return this;
		},

		/*
		 * Getter/Setter for the value function
		 */
		value: function(valueFn){
			if(undefined === valueFn){
				return this.options.value;
			}

			this.options.value = valueFn;
			this._redraw();
			return this;
		},

		hexClick: function(fn) {
			if(undefined === fn){
				return this.options.hexClick;
			}

			this.options.hexClick = fn;
			this.hexagons.on("click", fn);
			return this;
    },

		hexMouseOver: function(fn) {
			if(undefined === fn){
				return this.options.hexMouseOver;
			}

			this.options.hexMouseOver = fn;
			this.hexagons.on("mouseover", fn);
			return this;
    },

		hexMouseOut: function(fn) {
			if(undefined === fn){
				return this.options.hexMouseOut;
			}

			this.options.hexMouseOut = fn;
			this.hexagons.on("mouseout", fn);
			return this;
    },

		setZIndex: function(zIndex) {
			if (this._container && this._container[0] && this._container[0][0]) {
				this._container[0][0].style.zIndex = zIndex;
			}
		}

	});

	L.hexbinLayer = function(options) {
		return new L.HexbinLayer(options);
	};

})();
