draft-js polyfill
=============

This is a very simple polyfill that implements the following methods required by draft-js:

```
String.prototype.endsWith( searchString, position )
String.prototype.startsWith( searchString, position )
Array.prototype.fill( value )

```

Just require and call this once into the page (prior to any calls to these methods).
