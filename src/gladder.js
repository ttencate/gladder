/**
 * args can contain:
 * canvas: canvas DOM node, or id of one (required)
 * debug: set to true to log errors to console (requires webgl-debug.js)
 * errorCallback: called with error string on error if debug is true
 */
function Gladder(args) {

  var canvas;
  var gl;
  var gla = this;

  function getElement(element) {
    if (element === null) {
      throw new Error("Element is null");
    }
    if (element.innerHTML !== undefined) {
      return element;
    }
    var id = element;
    element = document.getElementById(id);
    if (element === null) {
      throw new Error("Element " + id + " is neither a DOM element nor an id");
    }
    return element;
  };

  ////////////
  // BASICS //
  ////////////

  this.setClearColor = function(red, green, blue, alpha) {
    gl.clearColor(red, green, blue, alpha === undefined ? 1.0 : alpha);
  };

  this.setClearDepth = function(depth) {
    gl.clearDepth(depth);
  };

  this.clear = function(args) {
    gl.clear(
        args.colorBuffer ? gl.COLOR_BUFFER_BIT : 0 |
        args.depthBuffer ? gl.DEPTH_BUFFER_BIT : 0 |
        args.stencilBuffer ? gl.STENCIL_BUFFER_BIT : 0
        );
  };

  ////////////////
  // STATE BITS //
  ////////////////
  
  function createStateBitFunc(funcName, bitName) {
    gla[funcName] = function(enable) {
      if (enable || enable === undefined) {
        gl.enable(gl[bitName]);
      } else {
        gl.disable(gl[bitName]);
      }
    };
  }

  createStateBitFunc('enableBlend', 'BLEND');
  createStateBitFunc('enableCullFace', 'CULL_FACE');
  createStateBitFunc('enableDepthTest', 'DEPTH_TEST');
  createStateBitFunc('enableDither', 'DITHER');
  createStateBitFunc('enablePolygonOffsetFill', 'POLYGON_OFFSET_FILL');
  createStateBitFunc('enableStencilTest', 'STENCIL_TEST');

  ///////////////
  // ANIMATION //
  ///////////////

  var REQUEST_ANIMATION_FRAME =
    window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.oRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    function(callback, element) { window.setTimeout(callback, 1000/60); };

  this.requestAnimationFrame = function(callback) {
    REQUEST_ANIMATION_FRAME.call(window, callback, canvas);
  };

  this.mainLoop = function(callback) {
    var last = Date.now();
    var drawFrame = function() {
      var now = Date.now();
      var delta = Math.max(0, now - last);
      last = now;
      callback(delta);
      gla.requestAnimationFrame(drawFrame, gla.canvas);
    }
    this.requestAnimationFrame(drawFrame, canvas);
  };

  this.flush = function() {
    gl.flush();
  };

  this.finish = function() {
    gl.finish();
  };

  //////////////
  // VIEWPORT //
  //////////////
  
  this.viewport = {};

  this.viewport.set = function(x, y, w, h) {
    gl.viewport(x, y, w, h);
  }

  this.viewport.setFull = function() {
    this.set(0, 0, canvas.width, canvas.height);
  };

  /////////////
  // BUFFERS //
  /////////////
  
  this.Buffer = function(args) {
    if (args.type === undefined) args.type = Float32Array;
    if (args.normalized === undefined) args.normalized = false;
    if (args.stride === undefined) args.stride = 0;

    var glBuffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, glBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new args.type(args.data), gl.STATIC_DRAW);

    this.componentsPerItem = args.componentsPerItem;
    this.numItems = args.data.length / args.componentsPerItem;
    this.normalized = args.normalized;
    this.stride = args.stride;
    this.type = args.type;
    this.glType = null;
    switch (args.type) {
      case Int8Array: this.glType = gl.BYTE; break;
      case Int16Array: this.glType = gl.SHORT; break;
      case Int32Array: this.glType = gl.FIXED; break;
      case Uint8Array: this.glType = gl.UNSIGNED_BYTE; break;
      case Uint16Array: this.glType = gl.UNSIGNED_SHORT; break;
      case Uint32Array: this.glType = gl.FIXED; break; // XXX Not quite accurate
      case Float32Array: this.glType = gl.FLOAT; break;
      default: throw new Error("Unsupported buffer type " + args.type);
    };

    this.bindArray = function() {
      gl.bindBuffer(gl.ARRAY_BUFFER, glBuffer);
    };

    this.bindElementArray = function() {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glBuffer);
    };

    this.drawTriangles = function() {
      gl.drawArrays(gl.TRIANGLES, 0, this.numItems);
    };
  };

  /////////////
  // SHADERS //
  /////////////

  function getScriptContents(script) {
    script = getElement(script);
    return script.innerHTML;
  };

  function compileShader(glShader, source) {
    gl.shaderSource(glShader, source);
    gl.compileShader(glShader);
    if (!gl.getShaderParameter(glShader, gl.COMPILE_STATUS)) {
      throw new Error("Shader compile error:\n" + gl.getShaderInfoLog(glShader));
    }
  };

  this.Shader = function(args) {
    var source = null;
    try {
      source = getScriptContents(args.source);
    } catch (e) {
      // Assume we were passed raw shader source code
      source = shader;
    }

    var type = null;
    if (args.vertexShader) {
      type = gl.VERTEX_SHADER;
    } else if (args.fragmentShader) {
      type = gl.FRAGMENT_SHADER;
    } else {
      throw new Error("Either vertexShader or fragmentShader must be set to true upon Shader construction");
    }

    var glShader = gl.createShader(type);
    compileShader(glShader, source);

    /**
     * Internal use only.
     */
    this.attach = function(glProgram) {
      gl.attachShader(glProgram, glShader);
    };
  }

  //////////////
  // UNIFORMS //
  //////////////

  function Uniform(glUniform, type) {
    var value = null;

    var suffix = {
      "float": "1f", "vec2": "2f", "vec3": "3f", "vec4": "4f",
      "int": "1i", "ivec2": "2i", "ivec3": "3i", "ivec4": "4i",
      "mat2": "2f", "mat3": "3f", "mat4": "4f",
    }[type];
    if (suffix === undefined) {
      throw new Error("Unknown uniform type " + type);
    }
    var vSuffix = suffix + "v";

    var setter = null;
    if (type.substring(0, 3) == "mat") {
      vSuffix = "Matrix" + vSuffix;
      suffix = null;
    } else {
      setter = gl["uniform" + suffix];
    }
    var vSetter = gl["uniform" + vSuffix];

    this.get = function() {
      return value;
    }
    
    this.set = function() {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(glUniform);
      if (args[args.length - 1][0] !== undefined) {
        // Received an array
        vSetter.apply(gl, args);
      } else if (setter !== null) {
        // Received some scalars
        setter.apply(gl, args);
      } else {
        throw new Error("Uniform cannot be set from " + args.join(", "));
      }
      args.shift();
      value = args;
    }
  }

  ////////////////
  // ATTRIBUTES //
  ////////////////

  function Attribute(glAttribute, type) {
    var value = null;
    var arrayEnabled = false;

    var suffix = {
      "float": "1f", "vec2": "2f", "vec3": "3f", "vec4": "4f",
      "int": "1i", "ivec2": "2i", "ivec3": "3i", "ivec4": "4i",
    }[type];
    if (suffix === undefined) {
      throw new Error("Unknown attribute type " + type);
    }
    var vSuffix = suffix + "v";

    var setter = gl["vertexAttrib" + suffix];
    var vSetter = setter + "v";

    function enableArray(enabled) {
      if (enabled != arrayEnabled) {
        if (enabled) {
          gl.enableVertexAttribArray(glAttribute);
        } else {
          gl.disableVertexAttribArray(glAttribute);
        }
        arrayEnabled = enabled;
      }
    }

    this.get = function() {
      return value;
    }
    
    this.set = function() {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(this.glUniform);
      if (args[args.length - 1][0] !== undefined) {
        // Received an array
        enableArray(false);
        vSetter.apply(gl, args);
      } else if (args[1] instanceof gla.Buffer) {
        var buffer = args[1];
        buffer.bindArray();
        enableArray(true);
        var type = null;
        gl.vertexAttribPointer(glAttribute, buffer.componentsPerItem, buffer.glType, buffer.normalized, buffer.stride, 0);
      } else if (setter !== null) {
        // Received some scalars
        enableArray(false);
        setter.apply(gl, args);
      } else {
        throw new Error("Uniform cannot be set from " + args.join(", "));
      }
      args.shift();
      value = args;
    }
  }

  //////////////
  // PROGRAMS //
  //////////////

  function linkProgram(glProgram, vertexShader, fragmentShader) {
    vertexShader.attach(glProgram);
    fragmentShader.attach(glProgram);
    gl.linkProgram(glProgram);
    if (!gl.getProgramParameter(glProgram, gl.LINK_STATUS)) {
      throw new Error("Program link error:\n" + gl.getProgramInfoLog(glProgram));
    }
  };

  this.Program = function(args) {
    var glProgram = gl.createProgram();
    // TODO accept Shader objects for vertexShader and fragmentShader args
    var vertexShader = new gla.Shader({ source: args.vertexShader, vertexShader: true });
    var fragmentShader = new gla.Shader({ source: args.fragmentShader, fragmentShader: true });
    linkProgram(glProgram, vertexShader, fragmentShader);

    this.uniforms = {};
    if (args.uniforms) {
      for (var name in args.uniforms) {
        if (!args.uniforms.hasOwnProperty(name)) { continue; }
        var type = args.uniforms[name];
        var glUniform = gl.getUniformLocation(glProgram, name);
        if (glUniform === null) {
          console.log("Warning: uniform " + name + " not found in program");
          continue;
        }
        this.uniforms[name] = new Uniform(glUniform, type);
      }
    }

    this.attributes = {};
    if (args.attributes) {
      for (var name in args.attributes) {
        if (!args.attributes.hasOwnProperty(name)) { continue; }
        var type = args.attributes[name];
        var glAttribute = gl.getAttribLocation(glProgram, name);
        if (glAttribute === null) {
          console.log("Warning: attribute " + name + " not found in program");
          continue;
        }
        this.attributes[name] = new Attribute(glAttribute, type);
      }
    }

    this.use = function() {
      gl.useProgram(glProgram);
    }
  };

  //////////////
  // TEXTURES //
  //////////////

  // TODO

  //////////////////
  // FRAMEBUFFERS //
  //////////////////

  // TODO

  /////////////
  // CONTEXT //
  /////////////

  function getGl(canvas) {
    var CONTEXT_NAMES = ["webgl", "experimental-webgl", "moz-webgl", "webkit-3d"];
    for (var i = 0; i < CONTEXT_NAMES.length; ++i) {
      var gl = canvas.getContext(CONTEXT_NAMES[i]);
      if (gl !== null) {
        break;
      }
    }
    if (gl === null) {
      throw new Error("WebGL not supported");
    }
    return gl;
  }

  canvas = getElement(args.canvas);
  gl = getGl(canvas);

  if (args.debug) {
    if (WebGLDebugUtils === undefined) {
      throw new Error("To use debug mode, you need to load webgl-debug.js. Get it from http://www.khronos.org/webgl/wiki/Debugging");
    }
    var onError = null;
    if (args.errorCallback) {
      onError = function(err, funcName, passedArguments) {
        args.errorCallback(
            WebGLDebugUtils.glEnumToString(err) + " in call " +
            funcName + "(" + Array.prototype.slice.call(passedArguments).join(", ") + ")");
      };
    }
    var onCall = null;
    if (args.callCallback) {
      onCall = function(funcName, passedArguments) {
        args.callCallback(
            funcName + "(" + Array.prototype.slice.call(passedArguments).join(", ") + ")");
      };
    }
    gl = WebGLDebugUtils.makeDebugContext(gl, onError, onCall);
  }

  this.canvas = canvas;
}
