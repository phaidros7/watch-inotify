watch-inotify
=============

Version of [watch](https://github.com/mikeal/watch) (by Mike Rogers) module, which uses [node-inotify](https://github.com/c4milo/node-inotify) for watching/monitoring file trees.

Usage
=============

As in original module API is not changed, so creating of monitor is the same:

```javascript
watch.createMonitor('/home/mikeal', function (monitor) {
	monitor.on("created", function (f, stat) {
		// handle creation
	});
	monitor.on("changed", function (f, curr, prev) {
		// handle file changes
	});
	monitor.on("removed", function (f, stat) {
		// handle deletion
	});
});
```

TODO
============
* Update code to use FS Events (for OS X) and make this module support both inotify and FS Events (maybe use [NodeJS-FSEvents](https://github.com/phidelta/NodeJS-FSEvents)?)