/**
 * args can contain:
 * canvas: canvas DOM node, or id of one (required)
 * debug: set to true to log WebGL errors to console (requires webgl-debug.js)
 * errorCallback: called with error string on error if debug is true
 * callCallback: called with call signature string on every WebGL call if debug is true
 */
function Gladder(args) {

  var canvas;
  var gl;
  var gla = this;

  ///////////////
  // UTILITIES //
  ///////////////

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
    // TODO check enum values on request
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

  processArgs(args, {
    canvas: REQUIRED,
    debug: false,
    errorCallback: null,
    callCallback: null,
  });

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

  this.canvas = canvas;

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
    });
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
    REQUEST_ANIMATION_FRAME.call(window, callback, canvas);
  };

  this.mainLoop = function(callback) {
    this.mainLoop.exit = false;
    var last = Date.now();
    var drawFrame = function() {
      var now = Date.now();
      var delta = Math.max(0, now - last);
      last = now;
      callback(delta);
      if (!gla.mainLoop.exit) {
        gla.requestAnimationFrame(drawFrame, gla.canvas);
      }
    }
    this.requestAnimationFrame(drawFrame, canvas);
  };

  this.exitMainLoop = function() {
    this.mainLoop.exit = true;
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
  
  this.Buffer = function Buffer(args) {
    processArgs(args, {
      data: REQUIRED,
      componentsPerItem: REQUIRED,
      type: Float32Array,
      normalized: false,
      stride: 0,
      usage: Buffer.Usage.STATIC_DRAW,
    });

    var glBuffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, glBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new args.type(args.data), args.usage);

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

    // TODO create withBound function instead
    this.bindArray = function() {
      gl.bindBuffer(gl.ARRAY_BUFFER, glBuffer);
    };

    this.bindElementArray = function() {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glBuffer);
    };
  };

  this.Buffer.Usage = {
    DYNAMIC_DRAW: gl.DYNAMIC_DRAW,
    STATIC_DRAW: gl.STATIC_DRAW,
    STREAM_DRAW: gl.STREAM_DRAW,
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
      } else if (args[1] instanceof gla.Buffer) {
        // Received a buffer
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
      // TODO cache used program
      gl.useProgram(glProgram);
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

    this.setImage = function(args) {
      processArgs(args, {
        // TODO accept HTML images/videos/...
        // TODO allow loading from URL
        width: REQUIRED,
        height: REQUIRED,
        target: gla.Texture.Target.TEXTURE_2D,
        level: 0,
        format: gla.Texture.Format.RGBA,
        type: gla.Texture.Type.UNSIGNED_BYTE,
        pixels: null,
      });
      bind.call(this);
      gl.texImage2D(args.target, args.level, args.format, args.width, args.height, 0, args.format, args.type, args.pixels);
    };

    this.setFilter(args.minFilter, args.magFilter);
    this.setWrap(args.wrapS, args.wrapT);
    if (args.width !== undefined && args.height !== undefined) {
      this.setImage({
        width: args.width,
        height: args.height,
        format: args.format,
        type: args.type,
        pixels: args.pixels,
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

  // TODO

  //////////////////
  // FRAMEBUFFERS //
  //////////////////

  this.Framebuffer = function(args) {
    processArgs(args, {
      colorBuffer: null,
      depthBuffer: null,
      stencilBuffer: null,
      width: canvas.width,
      height: canvas.height,
    });

    var glFramebuffer = gl.createFramebuffer();
    this.colorBuffer = null;
    this.depthBuffer = null;
    this.stencilBuffer = null;

    this.withBound = function(func) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, glFramebuffer);
      func();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); // TODO restore properly
    };

    // TODO add delete() functions to this and other objects

    function attachBuffer(attachment, buffer, width, height) {
      this.withBound(function() {
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
      });
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
      this.withBound(function() {
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
      });
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

  /////////////
  // DRAWING //
  /////////////

  this.draw = function(args) {
    processArgs(args, {
      program: REQUIRED,
      uniforms: {},
      attributes: {},
      mode: gla.DrawMode.TRIANGLES,
      first: 0,
      count: REQUIRED,
    });

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
