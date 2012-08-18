var Gladder = Gladder || {};
(function(namespace) {

  var CONTEXT_NAMES = ["webgl", "experimental-webgl", "moz-webgl", "webkit-3d"];

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

  /////////////
  // CONTEXT //
  /////////////

  /**
   * args can contain:
   * canvas: canvas DOM node, or id of one (required)
   * debug: set to true to log errors to console (requires webgl-debug.js)
   * errorCallback: called with error string on error if debug is true
   */
  namespace.createContext = function(args) {
    var canvas = getElement(args.canvas);
    var gl = null;
    for (var i = 0; i < CONTEXT_NAMES.length; ++i) {
      var gl = canvas.getContext(CONTEXT_NAMES[i]);
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
      if (args.errorCallback) {
        onError = function(err, funcName, args) {
          args.errorCallback(
              WebGLDebugUtils.glEnumToString(err) + " in call " +
              funcName + "(" + args.join(", ") + ")");
        };
      }
      gl = WebGLDebugUtils.makeDebugContext(gl, onError);
    }
    return new Context(gl, canvas);
  };

  function Context(gl, canvas) {
    this.gl = gl;
    this.canvas = canvas;

    ////////////
    // BASICS //
    ////////////

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
      var self = this;
      var last = Date.now();
      var drawFrame = function() {
        var now = Date.now();
        var delta = Math.max(0, now - last);
        last = now;
        callback(delta);
        self.requestAnimationFrame(drawFrame, self.canvas);
      }
      this.requestAnimationFrame(drawFrame, canvas);
    };

    this.setFullViewport = function() {
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    /////////////
    // BUFFERS //
    /////////////
    
    this.createBuffer = function(data) {

    };

    /////////////
    // SHADERS //
    /////////////

    function getScriptContents(script) {
      script = getElement(script);
      return script.innerHTML;
    };

    this.compileShader = function(glShader, source, type) {
      gl.shaderSource(glShader, source);
      gl.compileShader(glShader);
      if (!gl.getShaderParameter(glShader, gl.COMPILE_STATUS)) {
        throw new Error("Shader compile error:\n" + gl.getShaderInfoLog(glShader));
      }
    };

    this.createShader = function(shader, type) {
      var source = null;
      try {
        source = getScriptContents(shader);
      } catch (e) {
        // Assume we were passed raw shader source code
        source = shader;
      }
      var glShader = gl.createShader(type);
      this.compileShader(glShader, source, type);
      return glShader;
    }

    //////////////
    // PROGRAMS //
    //////////////

    this.linkProgram = function(glProgram, vertexShader, fragmentShader) {
      gl.attachShader(glProgram, vertexShader);
      gl.attachShader(glProgram, fragmentShader);
      gl.linkProgram(glProgram);
      if (!gl.getProgramParameter(glProgram, gl.LINK_STATUS)) {
        throw new Error("Program link error:\n" + gl.getProgramInfoLog(glProgram));
      }
    };

    this.createProgram = function(args) {
      var glProgram = gl.createProgram();
      var vertexShader = this.createShader(args.vertexShader, gl.VERTEX_SHADER);
      var fragmentShader = this.createShader(args.fragmentShader, gl.FRAGMENT_SHADER);
      this.linkProgram(glProgram, vertexShader, fragmentShader);
      return new Program(glProgram, args.uniforms, args.attributes);
    };

    function Uniform(glUniform, type) {
      this.glUniform = glUniform;
      this.value = null;

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
      
      this.set = function() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift(this.glUniform);
        if (args[args.length - 1][0] !== undefined) {
          vSetter.apply(gl, args);
        } else if (setter !== null) {
          setter.apply(gl, args);
        } else {
          throw new Error("Uniform cannot be set from " + args.join(", "));
        }
        args.shift();
        this.value = args;
      }
    }

    function Program(glProgram, uniforms, attributes) {
      this.glProgram = glProgram;

      this.uniforms = {};
      if (uniforms) {
        for (var name in uniforms) {
          if (!uniforms.hasOwnProperty(name)) { continue; }
          var type = uniforms[name];
          var glUniform = gl.getUniformLocation(glProgram, name);
          if (glUniform === null) {
            console.log("Warning: uniform " + name + " not found in program");
            continue;
          }
          this.uniforms[name] = new Uniform(glUniform, type);
        }
      }

      this.attributes = {};
      if (attributes) {
        for (var name in attributes) {
          if (!attributes.hasOwnProperty(name)) { continue; }
          var glAttribute = gl.getAttribLocation(glProgram, name);
          if (glAttribute === null) {
            console.log("Warning: attribute " + name + " not found in program");
            continue;
          }
          this.attributes[name] = glAttribute;
        }
      }
    };

    Program.prototype.use = function() {
      gl.useProgram(this.glProgram);
    }
  }

})(Gladder);
