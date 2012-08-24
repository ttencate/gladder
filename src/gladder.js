// TODO add JSDoc to all public methods
/**
 * args can contain:
 * canvas: canvas DOM node, or id of one (required)
 * debug: set to true to log WebGL errors to console (requires webgl-debug.js)
 * errorCallback: called with error string on error if debug is true
 * callCallback: called with call signature string on every WebGL call if debug is true
 */
function Gladder(args) {

  var gl;
  var gla = this;

  ///////////////
  // UTILITIES //
  ///////////////

  function isString(x) {
    return Object.prototype.toString.call(x) == '[object String]';
  }

  function isArray(x) {
    return Object.prototype.toString.call(x) === '[object Array]';
  }

  function isInteger(x) {
    return x === Math.floor(x);
  }

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

  var REQUIRED = new Object();

  function processArgs(args, defaultArgs) {
    // TODO check enum values when a particular flag (debug?) is enabled
    for (var key in defaultArgs) {
      if (!defaultArgs.hasOwnProperty(key)) continue;
      if (!args.hasOwnProperty(key) || args[key] === undefined) {
        if (defaultArgs[key] === REQUIRED) {
          throw new Error("Argument " + key + " is required");
        }
        args[key] = defaultArgs[key];
      }
    }
  };

  /////////////
  // CONTEXT //
  /////////////

  // TODO implement WebGLContextAttributes (alpha, etc.)
  function getGl(args) {
    processArgs(args, {
      canvas: REQUIRED,
      debug: false,
      errorCallback: null,
      callCallback: null,
    });

    var gl = null;
    var canvas = getElement(args.canvas);

    var CONTEXT_NAMES = ["webgl", "experimental-webgl", "moz-webgl", "webkit-3d"];
    for (var i = 0; i < CONTEXT_NAMES.length; ++i) {
      gl = canvas.getContext(CONTEXT_NAMES[i]);
      if (gl !== null) {
        break;
      }
    }
    if (gl === null) {
      throw new Error("WebGL not supported");
    }

    if (args.debug) {
      if (WebGLDebugUtils === undefined) {
        throw new Error("To use debug mode, you need to load webgl-debug.js. Get it from http://www.khronos.org/webgl/wiki/Debugging");
      }
      var onError = null;
      if (args.errorCallback !== null) {
        onError = function(err, funcName, passedArguments) {
          args.errorCallback(
              WebGLDebugUtils.glEnumToString(err) + " in call " +
              funcName + "(" + Array.prototype.slice.call(passedArguments).join(", ") + ")");
        };
      }
      var onCall = null;
      if (args.callCallback !== null) {
        onCall = function(funcName, passedArguments) {
          args.callCallback(
              funcName + "(" + Array.prototype.slice.call(passedArguments).join(", ") + ")");
        };
      }
      gl = WebGLDebugUtils.makeDebugContext(gl, onError, onCall);
    }
    return gl;
  }

  gl = getGl(args);

  this.canvas = gl.canvas;

  //////////////////
  // CAPABILITIES //
  //////////////////

  this.Capability = {
    BLEND: gl.BLEND,
    CULL_FACE: gl.CULL_FACE,
    DEPTH_TEST: gl.DEPTH_TEST,
    DITHER: gl.DITHER,
    POLYGON_OFFSET_FILL: gl.POLYGON_OFFSET_FILL,
    SAMPLE_ALPHA_TO_COVERAGE: gl.SAMPLE_ALPHA_TO_COVERAGE,
    SAMPLE_COVERAGE: gl.SAMPLE_COVERAGE,
    SCISSOR_TEST: gl.SCISSOR_TEST,
    STENCIL_TEST: gl.STENCIL_TEST,
  }
  
  var capabilityState = {};
  capabilityState[this.Capability.DITHER] = true;

  // TODO merge into draw call
  this.enable = function() {
    for (var i = 0; i < arguments.length; ++i) {
      var cap = arguments[i];
      if (!capabilityState[cap]) {
        gl.enable(arguments[i]);
        capabilityState[cap] = true;
      }
    }
  };

  this.disable = function() {
    for (var i = 0; i < arguments.length; ++i) {
      var cap = arguments[i];
      if (capabilityState[cap]) {
        gl.disable(arguments[i]);
        capabilityState[cap] = false;
      }
    }
  };

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
    REQUEST_ANIMATION_FRAME.call(window, callback, gl.canvas);
  };
  
  var mainLoopExiting = null;

  this.mainLoop = function(callback) {
    mainLoopExiting = false;
    var last = Date.now();
    var drawFrame = function() {
      var now = Date.now();
      var delta = Math.max(0, now - last);
      last = now;
      callback(delta);
      if (!mainLoopExiting) {
        gla.requestAnimationFrame(drawFrame, gl.canvas);
      }
    }
    this.requestAnimationFrame(drawFrame, gl.canvas);
  };

  this.exitMainLoop = function() {
    mainLoopExiting = true;
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

  var viewport = {
    x: 0,
    y: 0,
    width: gl.canvas.width,
    height: gl.canvas.height,
  };

  function setViewport(args) {
    processArgs(args, {
      x: 0,
      y: 0,
      width: gl.canvas.width,
      height: gl.canvas.height,
    });
    if (viewport.x !== args.x || viewport.y !== args.y || viewport.width !== args.width || viewport.height !== args.height) {
      gl.viewport(x, y, width, height);
      viewport.x = x;
      viewport.y = y;
      viewport.width = width;
      viewport.height = height;
    }
  }

  /////////////
  // BUFFERS //
  /////////////
  
  // TODO currently unused, remove if unneeded
  function getGLBufferType(arrayBufferViewType) {
    switch (arrayBufferViewType) {
      case Int8Array: return gl.BYTE;
      case Uint8Array: return gl.UNSIGNED_BYTE;
      case Int16Array: return gl.SHORT;
      case Uint16Array: return gl.UNSIGNED_SHORT;
      case Int32Array: return gl.FIXED;
      case Uint32Array: return gl.FIXED; // XXX Not quite accurate
      case Float32Array: return gl.FLOAT;
      default: throw new Error("Unsupported buffer type " + args.type);
    };
  }

  function sizeOfType(type) {
    switch (type) {
      case gla.Buffer.Type.BYTE:
      case gla.Buffer.Type.UNSIGNED_BYTE:
        return 1;
      case gla.Buffer.Type.SHORT:
      case gla.Buffer.Type.UNSIGNED_SHORT:
        return 2;
      case gla.Buffer.Type.FIXED:
      case gla.Buffer.Type.FLOAT:
        return 4;
      default:
        throw new Error("Unknown type " + type);
    }
  }

  this.BufferView = function(buffer, args) {
    processArgs(args, {
      size: REQUIRED,
      type: gla.Buffer.Type.FLOAT,
      normalized: false,
      stride: 0,
      offset: 0,
    });

    var typeSize = sizeOfType(args.type);
    if (args.stride > 0 && args.stride < typeSize * args.size) {
      throw new Error("stride == " + args.stride + ", if nonzero, must be at least size * sizeof(type) == " + args.size + " * " + typeSize + " == " + (args.size * args.typeSize));
    }
    if (!isInteger(args.stride / typeSize)) {
      throw new Error("stride == " + args.stride + " must be a multiple of sizeof(type) == " + typeSize);
    }
    if (!isInteger(args.offset / typeSize)) {
      throw new Error("offset == " + args.offset + " must be a multiple of sizeof(type) == " + typeSize);
    }

    this.buffer = buffer;
    this.size = args.size;
    this.type = args.type;
    this.normalized = args.normalized;
    this.stride = args.stride;
    this.offset = args.offset;

    this.numValues = function() {
      if (this.stride > 0) {
        return this.buffer.numBytes / this.stride * this.size;
      } else {
        return this.buffer.numBytes / sizeOfType(this.type);
      }
    };

    this.numItems = function() {
      if (this.stride > 0) {
        return this.buffer.numBytes / this.stride;
      } else {
        return this.buffer.numBytes / (sizeOfType(this.type) * this.size);
      }
    };
  };

  var boundBuffer = {};

  this.Buffer = function Buffer(args) {
    processArgs(args, {
      target: Buffer.Target.ARRAY_BUFFER,
      data: null,
      size: null,
      usage: Buffer.Usage.STATIC_DRAW,
      views: {},
    });

    var glBuffer = gl.createBuffer();

    this.target = args.target;
    this.usage = args.usage;
    this.numBytes = null;

    this.bind = function() {
      if (boundBuffer[this.target] !== this) {
        gl.bindBuffer(this.target, glBuffer);
        boundBuffer[this.target] = this;
      }
    };

    this.set = function(args) {
      processArgs(args, {
        data: null,
        size: null,
        offset: null,
        usage: this.usage,
      });
      this.bind();
      if (args.offset === null) {
        if (!(args.data === null ^ args.size === null)) {
          throw new Error("Must set exactly one of data and size");
        }
        if (args.data !== null) {
          var data = args.data;
          if (isArray(data)) {
            data = new Float32Array(data);
          }
          gl.bufferData(this.target, data, args.usage);
          this.numBytes = data.byteLength;
        } else {
          gl.bufferData(this.target, args.size, args.usage);
          this.numBytes = args.size;
        }
      } else {
        if (args.usage !== null) {
          throw new Error("Cannot set usage and offset at the same time");
        }
        gl.bufferSubData(this.target, args.offset, args.data);
      }
      this.usage = args.usage;
    };

    this.addView = function(name, args) {
      this.views[name] = new gla.BufferView(this, args);
    };

    this.removeView = function(name) {
      delete this.views[name];
    };

    if (args.data !== null || args.size !== null) {
      this.set({ data: args.data, size: args.size, usage: this.usage });
    }

    // TODO if we were passed typed data, infer view type if not set
    function createViews(argsViews) {
      var views = {};
      for (var key in argsViews) {
        if (!argsViews.hasOwnProperty(key)) continue;
        views[key] = new gla.BufferView(this, argsViews[key]);
      }
      return views;
    }
    this.views = createViews.call(this, args.views);
  };

  this.Buffer.Target = {
    ARRAY_BUFFER: gl.ARRAY_BUFFER,
    ELEMENT_ARRAY_BUFFER: gl.ELEMENT_ARRAY_BUFFER,
  };

  this.Buffer.Usage = {
    DYNAMIC_DRAW: gl.DYNAMIC_DRAW,
    STATIC_DRAW: gl.STATIC_DRAW,
    STREAM_DRAW: gl.STREAM_DRAW,
  };

  this.Buffer.Type = {
    BYTE: gl.BYTE,
    UNSIGNED_BYTE: gl.UNSIGNED_BYTE,
    SHORT: gl.SHORT,
    UNSIGNED_SHORT: gl.UNSIGNED_SHORT,
    FIXED: gl.FIXED,
    FLOAT: gl.FLOAT,
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
    processArgs(args, {
      source: REQUIRED,
      type: REQUIRED,
    });

    var source;
    try {
      source = getScriptContents(args.source);
    } catch (e) {
      // Assume we were passed raw shader source code
      source = args.source;
    }

    var type = args.type;

    var glShader = gl.createShader(type);
    compileShader(glShader, source);

    /**
     * Internal use only.
     */
    this.attach = function(glProgram) {
      gl.attachShader(glProgram, glShader);
    };
  }

  this.Shader.Type = {
    VERTEX_SHADER: gl.VERTEX_SHADER,
    FRAGMENT_SHADER: gl.FRAGMENT_SHADER,
  };

  //////////////
  // UNIFORMS //
  //////////////

  function Uniform(glUniform, type) {
    var value = null;

    this.type = type;

    var suffix = {
      "bool": "1i",
      "int": "1i", "ivec2": "2i", "ivec3": "3i", "ivec4": "4i",
      "float": "1f", "vec2": "2f", "vec3": "3f", "vec4": "4f",
      "mat2": "2f", "mat3": "3f", "mat4": "4f",
      "sampler2D": "1i", "samplerCube": "1i",
    }[type];
    if (suffix === undefined) {
      throw new Error("Unknown uniform type " + type);
    }
    var vSuffix = suffix + "v";

    if (type.substring(0, 3) == "mat") {
      var vSetter = gl["uniformMatrix" + vSuffix];
      this.set = function(matrix) {
        vSetter.call(gl, glUniform, false, matrix);
      };
    } else {
      var setter = gl["uniform" + suffix];
      var vSetter = gl["uniform" + vSuffix];
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

    this.get = function() {
      return value;
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
      } else if (args[1] instanceof gla.BufferView) {
        // Received a buffer
        // TODO check it's of type ARRAY_BUFFER
        // TODO allow passing a Buffer if it has only one view
        var bufferView = args[1];
        bufferView.buffer.bind();
        enableArray(true);
        gl.vertexAttribPointer(glAttribute, bufferView.size, bufferView.type, bufferView.normalized, bufferView.stride, bufferView.offset);
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

  var usedProgram = null;

  this.Program = function(args) {
    processArgs(args, {
      vertexShader: REQUIRED,
      fragmentShader: REQUIRED,
      uniforms: {},
      attributes: {},
    });

    var glProgram = gl.createProgram();
    var vertexShader;
    if (args.vertexShader instanceof gla.Shader) {
      vertexShader = args.vertexShader;
    } else {
      vertexShader = new gla.Shader({ source: args.vertexShader, type: gla.Shader.Type.VERTEX_SHADER });
    }
    var fragmentShader;
    if (args.fragmentShader instanceof gla.Shader) {
      fragmentShader = args.fragmentShader;
    } else {
      fragmentShader = new gla.Shader({ source: args.fragmentShader, type: gla.Shader.Type.FRAGMENT_SHADER });
    }
    linkProgram(glProgram, vertexShader, fragmentShader);

    this.uniforms = {};
    for (var name in args.uniforms) {
      if (!args.uniforms.hasOwnProperty(name)) { continue; }
      var type = args.uniforms[name];
      var glUniform = gl.getUniformLocation(glProgram, name);
      if (glUniform === null) {
        console.log("Warning: uniform " + name + " not found in program");
      }
      this.uniforms[name] = new Uniform(glUniform, type);
    }

    this.attributes = {};
    for (var name in args.attributes) {
      if (!args.attributes.hasOwnProperty(name)) { continue; }
      var type = args.attributes[name];
      var glAttribute = gl.getAttribLocation(glProgram, name);
      if (glAttribute === null) {
        console.log("Warning: attribute " + name + " not found in program");
      }
      this.attributes[name] = new Attribute(glAttribute, type);
    }

    this.use = function() {
      if (this !== usedProgram) {
        gl.useProgram(glProgram);
        usedProgram = this;
      }
    }
  };

  ///////////////////
  // TEXTURE UNITS //
  ///////////////////

  var activeTextureUnit = 0;

  function TextureUnit(index) {
    var glUnit = gl.TEXTURE0 + index;

    this.bound = {};

    function activate() {
      if (activeTextureUnit !== index) {
        gl.activeTexture(glUnit);
        activeTextureUnit = index;
      }
    }

    this.bind = function(target, texture) {
      if (this.bound[target] !== texture) {
        activate();
        gl.bindTexture(target, texture._id);
        this.bound[target] = texture;
      }
    }
  }

  textureUnits = (function() {
    var textureUnits = [];
    var count = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
    for (var i = 0; i < count; ++i) {
      textureUnits[i] = new TextureUnit(i);
    }
    return textureUnits;
  })();

  function getActiveTextureUnit() {
    return textureUnits[activeTextureUnit];
  }

  //////////////
  // TEXTURES //
  //////////////

  this.Texture = function Texture(args) {
    processArgs(args, {
      target: Texture.Target.TEXTURE_2D,
      minFilter: Texture.Filter.NEAREST_MIPMAP_LINEAR,
      magFilter: Texture.Filter.LINEAR,
      wrapS: Texture.Wrap.REPEAT,
      wrapT: Texture.Wrap.REPEAT,
    });

    var glTexture = gl.createTexture();
    this._id = glTexture;

    var target = args.target;

    var parameters = {};

    function bind() {
      getActiveTextureUnit().bind(target, this);
    };

    function setParameter(parameter, value) {
      if (parameters[parameter] !== value) {
        bind.call(this);
        gl.texParameteri(target, parameter, value);
        parameters[parameter] = value;
      }
    }

    this.setFilter = function(min, mag) {
      setParameter.call(this, gl.TEXTURE_MIN_FILTER, min);
      setParameter.call(this, gl.TEXTURE_MAG_FILTER, mag === undefined ? min : mag);
    };

    this.setWrap = function(s, t) {
      setParameter.call(this, gl.TEXTURE_WRAP_S, s);
      setParameter.call(this, gl.TEXTURE_WRAP_T, t === undefined ? s : t);
    };

    // TODO support texSubImage2D
    // TODO support copyTex(Sub)Image2D
    this.setImage = function(args) {
      processArgs(args, {
        width: null,
        height: null,
        target: gla.Texture.Target.TEXTURE_2D,
        level: 0,
        format: gla.Texture.Format.RGBA,
        type: gla.Texture.Type.UNSIGNED_BYTE,
        image: null,
        generateMipmap: true,
      });
      if (args.image !== null) {
        if (isString(args.image)) {
          var image = new Image();
          var self = this;
          image.onload = function() {
            self.setImage({ target: args.target, level: args.level, format: args.format, type: args.type, image: image, generateMipmap: args.generateMipmap });
            if (self.onload) {
              self.onload(self);
            }
          };
          image.src = args.image;
        } else {
          bind.call(this);
          gl.texImage2D(args.target, args.level, args.format, args.format, args.type, args.image);
          if (args.generateMipmap) {
            gl.generateMipmap(args.target);
          }
        }
      } else {
        if (args.width === null || args.height === null) {
          throw new Error("If image is not specified, width and height are mandatory");
        }
        bind.call(this);
        gl.texImage2D(args.target, args.level, args.format, args.width, args.height, 0, args.format, args.type, null);
      }
    };

    this.setFilter(args.minFilter, args.magFilter);
    this.setWrap(args.wrapS, args.wrapT);
    if ((args.width !== undefined && args.height !== undefined) || args.image !== undefined) {
      this.setImage({
        width: args.width,
        height: args.height,
        format: args.format,
        type: args.type,
        image: args.image,
      });
    }
  };

  this.Texture.Target = {
    TEXTURE_2D: gl.TEXTURE_2D,
    CUBE_MAP: gl.CUBE_MAP,
    CUBE_MAP_POSITIVE_X: gl.TEXTURE_CUBE_MAP_POSITIVE_X,
    CUBE_MAP_NEGATIVE_X: gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
    CUBE_MAP_POSITIVE_Y: gl.TEYTURE_CUBE_MAP_POSITIVE_Y,
    CUBE_MAP_NEGATIVE_Y: gl.TEYTURE_CUBE_MAP_NEGATIVE_Y,
    CUBE_MAP_POSITIVE_Z: gl.TEZTURE_CUBE_MAP_POSITIVE_Z,
    CUBE_MAP_NEGATIVE_Z: gl.TEZTURE_CUBE_MAP_NEGATIVE_Z,
  };
  this.Texture.Filter = {
    NEAREST: gl.NEAREST,
    LINEAR: gl.LINEAR,
    NEAREST_MIPMAP_NEAREST: gl.NEAREST_MIPMAP_NEAREST,
    LINEAR_MIPMAP_NEAREST: gl.LINEAR_MIPMAP_NEAREST,
    NEAREST_MIPMAP_LINEAR: gl.NEAREST_MIPMAP_LINEAR,
    LINEAR_MIPMAP_LINEAR: gl.LINEAR_MIPMAP_LINEAR,
  };
  this.Texture.Wrap = {
    CLAMP_TO_EDGE: gl.CLAMP_TO_EDGE,
    MIRRORED_REPEAT: gl.MIRRORED_REPEAT,
    REPEAT: gl.REPEAT,
  };
  this.Texture.Format = {
    ALPHA: gl.ALPHA,
    LUMINANCE: gl.LUMINANCE,
    LUMINANCE_ALPHA: gl.LUMINANCE_ALPHA,
    RGB: gl.RGB,
    RGBA: gl.RGBA,
  };
  this.Texture.Type = {
    UNSIGNED_BYTE: gl.UNSIGNED_BYTE,
    UNSIGNED_SHORT_5_6_5: gl.UNSIGNED_SHORT_5_6_5,
    UNSIGNED_SHORT_4_4_4_4: gl.UNSIGNED_SHORT_4_4_4_4,
    UNSIGNED_SHORT_5_5_5_1: gl.UNSIGNED_SHORT_5_5_5_1,
  };

  ///////////////////
  // RENDERBUFFERS //
  ///////////////////

  // TODO implement renderbuffers

  //////////////////
  // FRAMEBUFFERS //
  //////////////////

  var boundFramebuffer = null;

  function bindFramebuffer(framebuffer) {
    if (framebuffer !== boundFramebuffer) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer === null ? null : framebuffer._id);
      boundFramebuffer = framebuffer;
    }
  }

  this.Framebuffer = function(args) {
    processArgs(args, {
      colorBuffer: null,
      depthBuffer: null,
      stencilBuffer: null,
      width: gl.canvas.width,
      height: gl.canvas.height,
    });

    var glFramebuffer = gl.createFramebuffer();
    this._id = glFramebuffer;

    this.colorBuffer = null;
    this.depthBuffer = null;
    this.stencilBuffer = null;

    // TODO add delete() functions to this and other objects

    function attachBuffer(attachment, buffer, width, height) {
      bindFramebuffer(this);
      if (buffer === gla.CREATE_TEXTURE_2D) {
        buffer = new gla.Texture({
          minFilter: gla.Texture.Filter.NEAREST,
          magFilter: gla.Texture.Filter.NEAREST,
          wrapS: gla.Texture.Wrap.CLAMP_TO_EDGE,
          wrapT: gla.Texture.Wrap.CLAMP_TO_EDGE,
          width: width,
          height: height,
        });
      } else if (buffer === gla.CREATE_RENDERBUFFER) {
        // TODO implement once we have renderbuffers
      }
      if (buffer instanceof gla.Texture) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, buffer._id, 0);
      } else if (buffer instanceof gla.RenderBuffer) {
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, attachment, gl.RENDERBUFFER, buffer._id);
      }
      return buffer;
    };

    this.attachColorBuffer = function(colorBuffer, width, height) {
      this.colorBuffer = attachBuffer.call(this, gl.COLOR_ATTACHMENT0, colorBuffer, width, height);
    };

    this.attachDepthBuffer = function(depthBuffer, width, height) {
      this.depthBuffer = attachBuffer.call(this, gl.DEPTH_ATTACHMENT, depthBuffer, width, height);
    };

    this.attachStencilBuffer = function(stencilBuffer, width, height) {
      this.stencilBuffer = attachBuffer.call(this, gl.STENCIL_ATTACHMENT, stencilBuffer, width, height);
    };

    this.checkComplete = function() {
      bindFramebuffer(this);
      var framebufferStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (framebufferStatus !== gl.FRAMEBUFFER_COMPLETE) {
        var textStatus = framebufferStatus;
        switch (framebufferStatus) {
          case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT: textStatus = "INCOMPLETE_ATTACHMENT"; break;
          case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT: textStatus = "INCOMPLETE_MISSING_ATTACHMENT"; break;
          case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS: textStatus = "INCOMPLETE_DIMENSIONS"; break;
          case gl.FRAMEBUFFER_UNSUPPORTED: textStatus = "UNSUPPORTED"; break;
        };
        throw new Error("Framebuffer incomplete: " + textStatus);
      }
    };

    if (args.colorBuffer) {
      this.attachColorBuffer(args.colorBuffer, args.width, args.height);
    }
    if (args.depthBuffer) {
      this.attachDepthBuffer(args.depthBuffer, args.width, args.height);
    }
    if (args.stencilBuffer) {
      this.attachStencilBuffer(args.stencilBuffer, args.width, args.height);
    }
  };

  this.CREATE_TEXTURE_2D = new Object();
  this.CREATE_RENDERBUFFER = new Object();

  //////////////
  // CLEARING //
  //////////////

  var clearColor = [0, 0, 0, 0];
  var clearDepth = 1;
  var clearStencil = 0;

  this.clear = function(args) {
    processArgs(args, {
      color: null,
      depth: null,
      stencil: null,
      framebuffer: null,
    });

    bindFramebuffer(args.framebuffer);

    var bits = 0;
    if (args.color !== null) {
      bits |= gl.COLOR_BUFFER_BIT;
      var fullColor = [];
      var colorChanged = false;
      for (var i = 0; i <= 3; ++i) {
        if (args.color[i] === undefined) {
          fullColor[i] = fullColor[i-1];
        } else {
          fullColor[i] = args.color[i];
        }
        colorChanged = colorChanged || (fullColor[i] != clearColor[i]);
      }
      if (colorChanged) {
        gl.clearColor(fullColor[0], fullColor[1], fullColor[2], fullColor[3]);
        clearColor = fullColor;
      }
    }
    if (args.depth !== null) {
      bits |= gl.DEPTH_BUFFER_BIT;
      if (args.depth != clearDepth) {
        gl.clearDepth(args.depth);
        clearDepth = args.depth;
      }
    }
    if (args.stencil !== null) {
      bits |= gl.STENCIL_BUFFER_BIT;
      if (args.stencil != clearStencil) {
        gl.clearStencil(args.stencil);
        clearStencil = args.stencil;
      }
    }
    gl.clear(bits);
  };

  /////////////
  // DRAWING //
  /////////////

  // TODO accept a "stack" of multiple args, and merge them?
  // TODO implement polygonOffset
  this.draw = function(args) {
    processArgs(args, {
      program: REQUIRED,
      uniforms: {},
      attributes: {},
      mode: gla.DrawMode.TRIANGLES,
      first: 0,
      count: REQUIRED,
      framebuffer: null,
      viewport: { x: 0, y: 0, width: gl.canvas.width, height: gl.canvas.height },
    });

    var framebuffer = args.framebuffer;
    bindFramebuffer(framebuffer);
    if (framebuffer !== null) {
      framebuffer.checkComplete();
    }

    setViewport(args.viewport);

    var program = args.program;
    program.use();

    var currentTextureUnit = {};
    for (var key in args.uniforms) {
      if (!args.uniforms.hasOwnProperty(key)) continue;
      var type = program.uniforms[key].type;
      var value = args.uniforms[key];
      switch (type) {
        case "sampler2D":
        case "samplerRect":
          // XXX There is room for optimization here: if the texture is already bound
          // to another texture unit, just use that one.
          var target = { sampler2D: gl.TEXTURE_2D, samplerCube: gl.TEXTURE_CUBE_MAP }[type];
          var current = currentTextureUnit[target] || 0;
          textureUnits[current].bind(target, value);
          program.uniforms[key].set(current);
          currentTextureUnit[target] = current + 1;
          break;
        default:
          program.uniforms[key].set(value);
          break;
      }
    }

    for (var key in args.attributes) {
      if (!args.attributes.hasOwnProperty(key)) continue;
      program.attributes[key].set(args.attributes[key]);
    }

    // TODO add support for drawElements
    gl.drawArrays(args.mode, args.first, args.count);
  };

  this.DrawMode = {
    POINTS: gl.POINTS,
    LINE_STRIP: gl.LINE_STRIP,
    LINE_LOOP: gl.LINE_LOOP,
    LINES: gl.LINES,
    TRIANGLE_STRIP: gl.TRIANGLE_STRIP,
    TRIANGLE_FAN: gl.TRIANGLE_FAN,
    TRIANGLES: gl.TRIANGLES,
  };
}
