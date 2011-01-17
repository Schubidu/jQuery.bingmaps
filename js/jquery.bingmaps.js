/*
 * enclose the plugin's JS in a closure so that
 * we do not pollute the global namespace
 * and avoid ns conflicts
 */

(function($) { // $ represents the jQuery obj passed in

	var pushPinCounter = {};
	(function(context) {
		var id = 0;

		context.next = function() {
			return id++;
		};

		context.reset = function() {
			id = 0;
		}
	})(pushPinCounter);


	var PLUGIN_POSTFIX = ".bingmaps", // have some unique identifier
			OPTS = "opts" + PLUGIN_POSTFIX, // the attribute for the options data
			mapLayerUID = 0,
			mapLayerTitle_PREFIX = 'bingMap-',
			mapLayerTitle_OPT = 'layerTitle',
			MM, mapDiv;

	// defaults, public scope for extensibility

	$.bingmaps = {
		defaults: {
			key : '',
			pushPins : null,
			icon: 'http://ecn.dev.virtualearth.net/mapcontrol/v7.0/i/poi_search.png',
			center: {
				latitude: 51.163375,
				longitude: 10.447683
			},
			zoom: 6,
			maxZoom: 15,
			minZoom: 1,
			infoBox: $.noop
		},
		uid: 0
	};

	function InfoBox(map, fn, obj) {
		this.div;  // Container div element
		this.createFn = fn; // HTML to display inside the infobox
		this.map = map;
		this.data = obj;
		this.pin = null;
		this.hasHtml = false;
	}

	// Add the infobox div to the page
	InfoBox.prototype.show = function() {
		if (this.pin == null) return false;
		if (this.div == undefined) {
			// Create the container div.
			this.div = $('<div class="infobox-wrapper" />');
			var div = $('<div class="infobox" />');
			this.div.append(div);
			var cfn = $.proxy(this.createFn, this);
			$('img[src="' + this.pin.getIcon() + '"]', this.map.getRootElement()).parent().append(this.div);
			cfn(div, this.data);
			this.hasHtml = $('*', div).length != 0 || div.text() != '';
		}
		if(this.hasHtml) {
			this.pin.setOptions({zIndex: 1000});
			this.div.css('visibility', "visible");
			this.div.parent().css('overflow', "visible");
		}
	};

	// Hide the infobox
	InfoBox.prototype.hide = function() {
		if (this.div != undefined && this.hasHtml) {
			this.pin.setOptions({zIndex: 1});
			this.div.css('visibility', "hidden");
			this.div.parent().css('overflow', "hidden");
		}
	};

	// Pin the infobox
	InfoBox.prototype.setPin = function(pin) {
		this.pin = pin;
	};

	Microsoft.Maps.Pushpin.prototype.setInfoBox = function(infoBox) {
		if (typeof this.infoBox != undefined && this.infoBox != undefined && this.infoBox != null) {
			this.removeInfoBox();
		}
		// Assign the infobox to this pushpin
		this.infoBox = infoBox;
		this.infoBox.setPin(this);
		this.isInfoBoxOpen = false;

		// Add handlers for mouse events
		this.mouseoverHandler = Microsoft.Maps.Events.addHandler(this, 'click', function(e) {
			e.target.toggleInfoBox();
		});
	};

// Extend the Pushpin class to toogle an existing InfoBox object
	Microsoft.Maps.Pushpin.prototype.toggleInfoBox = function(showBox) {
		if (this.infoBox == undefined) return false;
		var s;
		if (showBox == undefined) {
			s = !this.isInfoBoxOpen;
		} else {
			s = showBox;
		}

		if (s) {
			this.infoBox.show();
		} else {
			this.infoBox.hide();
		}
		this.isInfoBoxOpen = s;

	};

// Extend the Pushpin class to remove an existing InfoBox object
	Microsoft.Maps.Pushpin.prototype.removeInfoBox = function() {
		this.infoBox = null;

		// Remove handlers for mouse events
		Microsoft.Maps.Events.removeHandler(this.clickHandler);
		//	Microsoft.Maps.Events.removeHandler(this.mouseoutHander);
	};

	Microsoft.Maps.Pushpin.prototype.setJqueryBingsmapsMetaData = function(metaData) {
		this.jqueryBingsmapsMetaData = metaData
	};


	function MetaData(obj) {
		this.latitude = obj.location[0];
		this.longitude = obj.location[1];
		this.location = new Microsoft.Maps.Location(this.latitude, this.longitude);
		this.object = function() {
			return obj;
		}
	}

	$.bingmaps.metaData = MetaData;


	function PinCollection() {
		var uniqueCollection = function() {
			var temp = [], c = [];
			if (collection != null && collection.length) {
				c = $.merge([], collection);
			}
			collection = [];
			$.each(c, function(i, v) {
				var s = v.latitude + ',' + v.longitude;
				if ($.inArray(s, temp) == -1) {
					temp.push(s);
					collection.push(v);
				}
			});
		};
		var collection = null;
		this.add = function(location) {
			if (collection == null) {
				collection = [];
			}
			collection.push(location);
			return this;
		};
		this.toArray = function() {
			uniqueCollection();
			return collection;
		};
		this.toPinsArray = function() {
			uniqueCollection();
			var c = [];
			$.each(collection, function(i, v) {
				c.push(v.object())
			});
			return c;
		};
		this.toLatLongArray = function() {
			uniqueCollection();
			var r = [];
			for (var i = 0; i < collection.length; i++) {
				r.push(collection[i].location);
			}
			return r;
		};
		this.getLength = function() {
			if ($.isArray(collection)) {
				return collection.length;
			}
			return 0;
		}
	}

	// the jQuery chainable helper, to allow jQuery('#elem').bingmaps(x)
	$.fn.bingmaps = function(incoming, additional) {

		var $this = $(this);
		var type = typeof (incoming);

		if (type == "undefined" || type == "object")
			return initialize($this, incoming);
		else if (type == "string")
			return $this.trigger(incoming + PLUGIN_POSTFIX, additional);
	};

	// the method that does the initialization
	function initialize($subject, options) {

		var opts = $.extend({}, $.bingmaps.defaults, options);

		return $subject.each(function(subj) {
			var $subj = $(this);
			var id = uniqueId($subj);
			var data = $.parseJSON($('script', $subj).text());

			var map = null;

			if (MM == null) {
				MM = Microsoft.Maps;
			}
			if (typeof(Microsoft.Maps.Map) != 'undefined') {
				var mapOptions = {
					credentials: opts.key,
					enableSearchLogo: false,
					enableClickableLogo: false,
					center: new Microsoft.Maps.Location(opts.center.latitude, opts.center.longitude),
					zoom: opts.zoom
				};

				map = new Microsoft.Maps.Map(this, mapOptions);
				map.htmlID = id;

				var viewChanged = Microsoft.Maps.Events.addHandler(map, 'targetviewchanged', function(e) {
					if(this.target.entities.get(0).getLength() == 1){
						var pin = this.target.entities.get(0).get(0);
						var pixel = map.tryLocationToPixel(pin.getLocation());

						//console.debug(pixel);
					};

				});
			}

			opts.map = map;
			opts[mapLayerTitle_OPT] = mapLayerTitle_PREFIX + (mapLayerUID++);

			$subj.data(OPTS, opts);
			for (var pluginEvent in PluginEvents)
				$subj.bind(pluginEvent + PLUGIN_POSTFIX, $subj, PluginEvents[pluginEvent]);

			if (opts.pushPins) {
				$(this).bingmaps('pushPins', {pushPins: opts.pushPins})
			}
		});
	}

	var PluginEvents = {
		pushPins: function(evt, additional) {
			var helper = pluginObjectHelper(evt),
					opts = helper.options,
					map = opts.map,

					pushPins = [];
			pushPins = opts.pushPins;
			if (additional) {
				if (!$.isArray(additional.pushPins))
					additional.pushPins = [additional.pushPins];
				pushPins = $.merge(opts.pushPins, additional.pushPins);
				var pins = new PinCollection();
				for (var i = 0; i < pushPins.length; i++) {
					pins.add(new $.bingmaps.metaData(pushPins[i]));
				}
				helper.subject.bingmaps('options', {name: 'pushPins', value: pins.toPinsArray()});
				if (map != null) {
					map.entities.clear();
					if (pins.getLength()) {
						mapDiv = map;
						var entity = new Microsoft.Maps.EntityCollection();
						$.each(pins.toArray(), function() {
							var c = this,
									pc = 'pushpin' + pushPinCounter.next(),
									ic = $.bingmaps.defaults.icon + '#' + pc,
									pin = new Microsoft.Maps.Pushpin(c.location, {icon: ic});
							if ($.isFunction(opts.infoBox)) {
								var infoBox = new InfoBox(map, opts.infoBox, this.object());
								pin.setInfoBox(infoBox);
							}
							entity.push(pin);
						});

						map.entities.push(entity);
						var rect = null;
						if (pins.getLength() == 1) {
							rect = Microsoft.Maps.LocationRect(pins.toLatLongArray()[0], 1, 1);
							map.setView({center:pins.toLatLongArray()[0], zoom: opts.maxZoom});
						} else {
							map.setView({bounds: Microsoft.Maps.LocationRect.fromLocations(pins.toLatLongArray())});
						}


					} else {
						map.setView({center:new Microsoft.Maps.Location(opts.center.latitude, opts.center.longitude), zoom: opts.zoom});
					}
				}
			} else {
				return helper.options.pushPins;
			}
		},
		clearPushPins: function(evt) {
			var helper = pluginObjectHelper(evt);
			helper.subject.bingmaps('options', {name: 'pushPins', value: []});
			$(helper.subject).bingmaps('pushPins', {pushPins: []})
		},
		options: function(evt, additional) {
			var helper = pluginObjectHelper(evt);
			if (additional) {
				if (additional.name && additional.value) {
					var obj = {};
					obj[additional.name] = additional.value;
					var m = $.extend({}, helper.options, obj);
					helper.subject.data(OPTS, m);
				} else if (additional.name) {
					return helper.options[additional.name];
				}
			} else {
				return helper.options;
			}
		},
		// jQuery().pluginName('destroy')
		destroy: function(evt) {
			var helper = pluginObjectHelper(evt);
			// unbind all the events subscribed via this plugin
			helper.subject.unbind(PLUGIN_POSTFIX);
		}
	};
	// private scope helper to retrieve the necessary
	function pluginObjectHelper(evt) {
		var $mySubject = evt.data;
		return {
			// return the object that has been plugged in
			subject: $mySubject,
			// return the options of the plugin when init'd
			options: $mySubject.data(OPTS)
		}
	}

	function findLayer(map, title) {
		var layer = null;
		for (var i = 0; i < map.GetShapeLayerCount(); i++) {
			layer = map.GetShapeLayerByIndex(i);
			if (layer.GetTitle() == 'Colorado') break;
			layer = null;
		}
		return layer;
	}

	function deleteLayer(map) {
		var layer = null;
		for (var i = 0; i < map.GetShapeLayerCount(); i++) {
			layer = map.GetShapeLayerByIndex(i);
			if (layer.GetTitle() == 'Colorado') break;
			layer = null;
		}
		return layer;
	}


	function uniqueId($subject) {
		if ($subject.attr('id') == '') {
			$.bingmaps.uid++;
			$subject.attr('id', 'bingmaps-' + $.bingmaps.uid);
		}
		return $subject.attr('id');
	}

	function appendJS(filename) {
		var s = document.createElement('script');
		s.setAttribute("type", "text/javascript");
		s.setAttribute("src", filename);
		document.getElementsByTagName("head")[0].appendChild(s);
	}

})(jQuery); // pass jQuery object in to self enclosing fn
