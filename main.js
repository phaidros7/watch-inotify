// Copyright 2010-2011 Mikeal Rogers
//
//    Licensed under the Apache License, Version 2.0 (the "License");
//    you may not use this file except in compliance with the License.
//    You may obtain a copy of the License at
//
//        http://www.apache.org/licenses/LICENSE-2.0
//
//    Unless required by applicable law or agreed to in writing, software
//    distributed under the License is distributed on an "AS IS" BASIS,
//    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//    See the License for the specific language governing permissions and
//    limitations under the License.

var sys = require('util')
  , fs = require('fs')
  , Inotify = require('inotify').Inotify
  , WATCH_FLAGS = Inotify.IN_ALL_EVENTS
  , path = require('path')
  , events = require('events')
  ;

var EVENT_CODES = {
	1: "created",
	2: "changed",
	4: "removed"
};

function walk(dir, options, callback) {
	if (!callback) {
		callback = options;
		options = {}
	}
	if (!callback.files) {
		callback.files = {};
	}
	if (!callback.pending) {
		callback.pending = 0;
	}
	callback.pending += 1;
	fs.stat(dir, function(err, stat) {
		if (err) {
			return callback(err);
		}
		callback.files[dir] = true;
		fs.readdir(dir, function(err, files) {
			if (err) {
				return callback(err);
			}
			callback.pending -= 1;
			files.forEach(function(f) {
				f = path.join(dir, f);
				callback.pending += 1;
				fs.stat(f, function(err, stat) {
					var enoent = false
					  , done;

					if (err) {
						if (err.code !== "ENOENT") {
							return callback(err);
						} else {
							enoent = true;
						}
					}
					callback.pending -= 1;
					done = callback.pending === 0;

					if (!enoent) {
						if (options.ignoreDotFiles && path.basename(f)[0] === '.') {
							return done && callback(null, callback.files);
						}
						if (options.filter && options.filter(f, stat)) {
							return done && callback(null, callback.files);
						}
						callback.files[f] = true;
						if (stat.isDirectory()) {
							walk(f, options, callback);
						}
						if (done) {
							callback(null, callback.files);
						}
					}
				})
			});

			if (callback.pending === 0) {
				callback(null, callback.files);
			}
		});

		if (callback.pending === 0) {
			callback(null, callback.files);
		}
	})

}
exports.watchTree = function(inotify, root, options, callback) {
	if (!callback) {
		callback = options;
		options = {}
	}
	walk(root, options, function(err, files) {
		if (err) {
			throw err;
		}
		var fileWatcher = function(f) {
			var descriptor
			  , moveEvents = {};

			descriptor = inotify.addWatch({
				path: f,
				watch_for: WATCH_FLAGS,
				callback: function(event) {
					var mask = event.mask;

					// avoid reacting on "access", "open", "close"
					if (mask & Inotify.IN_ACCESS || mask & Inotify.IN_OPEN || mask & Inotify.IN_CLOSE_NOWRITE) {
						return;
					}

					// created
					if (mask & Inotify.IN_CREATE) {
						if (mask & Inotify.IN_ISDIR) {
							fs.readdir(f, function(err, nfiles) {
								if (err) {
									return;
								}

								nfiles.forEach(function(b) {
									var file = path.join(f, b);
									if (!files[file]) {
										var createEvent = JSON.parse(JSON.stringify(event));
										createEvent.name = file;
										callback(1, event);
										fileWatcher(file);
									}
								})
							});
						} else {
							callback(1, event);
						}
					// modified
					} else if (mask & Inotify.IN_MODIFY || mask & Inotify.IN_CLOSE_WRITE || mask & Inotify.IN_ATTRIB) {
						callback(2, event);
					// removed
					} else if (mask & Inotify.IN_DELETE || mask & Inotify.IN_DELETE_SELF) {
						try {
							inotify.removeWatch(files[f]);
						} catch (ex) {
							console.error(ex.stack);
						}
						delete files[f];
						callback(4, event);
					} else if (mask & Inotify.IN_MOVED_FROM) {
						moveEvents[event.cookie] = event;
					} else if (mask & Inotify.IN_MOVED_TO) {
						if (moveEvents.hasOwnProperty(event.cookie)) {
							moveEvents[event.cookie].newName = event.name;
							callback(2, moveEvents[event.cookie]);
							delete moveEvents[event.cookie];
						}
					} else {
						callback(2, event);
					}
				}
			});
			files[f] = descriptor;
		};

		fileWatcher(root);
		for (var i in files) {
			if (files.hasOwnProperty(i)) {
				fileWatcher(i);
			}
		}
		callback(files, null, null);
	})
};

exports.createMonitor = function(root, options, cb) {
	var monitor = new events.EventEmitter()
	  , inotify = new Inotify(false);

	if (!cb) {
		cb = options;
		options = {}
	}

	exports.watchTree(inotify, root, options, function(code, event) {
		if (typeof code === "object") {
			monitor.files = code;
			cb(monitor);
		} else {
			monitor.emit(EVENT_CODES[code], event);
		}
	});
};

exports.walk = walk;
