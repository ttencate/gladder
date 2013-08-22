What is Gladder?
===============

Gladder is a WebGL framework, written in CoffeeScript, compiling down to pure JavaScript.

Gladder is...

* ... opaque. It does not expose WebGL, but rather aims to wrap it in a straightforward way.
* ... thin. Many Gladder classes are direct equivalents of WebGL constructs.
* ... light. It has no dependencies, other than WebGL itself.
* ... flexible. It tries to make as few assumptions about your application as possible.
* ... unobtrusive. It does not change default behaviour of anything.
* ... cross-browser. It abstracts away browser differences.

Gladder is not...

* ... a scene graph. You can build your own on top of it, if you like.
* ... a 3D library. It does not know anything about model loading, for example.
* ... a game engine. You'll have to write your own input handling, sound, physics, etcetera.
