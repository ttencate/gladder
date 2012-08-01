var Glower = Glower || {};
(function(namespace) {

  var CONTEXT_NAMES = ["webgl", "experimental-webgl", "moz-webgl", "webkit-3d"];

  /**
   * If the given object is a DOM element, return it as-is.
   * Otherwise, assume it's an id and get the corresponding element.
   *
   * @throw an Error object if neither worked
   */
  function getElement(element) {
    if (element === null) {
      throw new Error("Element is null");
    }
    if (element.nodeType == 1) {
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

  /**
   * Initializes the WebGL context.
   * 
   * @param canvas a HTMLCanvasElement, or the id of one
   * @return the GL context, or null if failed
   * @throw an Error object if creation failed
   */
  namespace.initGl = function(canvas) {
    canvas = getElement(canvas);
    for (var i = 0; i < CONTEXT_NAMES.length; ++i) {
      // TODO gl is global which is why everything works... FIX THIS!
      gl = canvas.getContext(CONTEXT_NAMES[i]);
      if (gl !== null) {
        gl.checkError = function() { /* TODO */ };
        return gl;
      }
    }
    throw new Error("WebGL not supported");
  };

  /**
   * Cross-browser wrapper for requestAnimationFrame.
   *
   * @param callback the function to be called when rendering
   * @param element the element that bounds the animation, or null; ignored by
   *                some browsers
   */
  namespace.requestAnimationFrame =
    window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.oRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    function(callback, element) { window.setTimeout(callback, 1000/60); };

  /////////////
  // SHADERS //
  /////////////

  /**
   * Returns the text contents of a script element.
   *
   * @param script a HTMLScriptElement, or the id of one
   * @return a string containing the element's contents
   */
  namespace.getScriptContents = function(script) {
    script = getElement(script);
    return script.innerHTML;
  };

  /**
   * Returns the WebGL shader type from a script element's type. It must be
   * "x-shader/x-vertex" or "x-shader/x-fragment".
   *
   * @param script a HTMLScriptElement, or the id of one
   * @return gl.VERTEX_SHADER or gl.FRAGMENT_SHADER
   * @throw an Error object if type is unknown
   */
  namespace.getShaderTypeFromScript = function(script) {
    script = getElement(script);
    switch (script.type) {
      case "x-shader/x-vertex":
        return gl.VERTEX_SHADER;
      case "x-shader/x-fragment":
        return gl.FRAGMENT_SHADER;
    }
    throw new Error("Unknown shader type " + script.type);
  };

  /**
   * Loads and compiles a shader.
   *
   * @param source the shader source code as a string
   * @param type gl.VERTEX_SHADER or gl.FRAGMENT_SHADER
   * @return a WebGLShader object
   * @throw an Error object if compilation failed
   */
  namespace.compileShader = function(source, type) {
    var shader = gl.createShader(type);
    gl.checkError();
    gl.shaderSource(shader, source);
    gl.checkError();
    gl.compileShader(shader);
    gl.checkError();
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error("Shader compile error:\n" + gl.getShaderInfoLog(shader));
    }
    return shader;
  };

  /**
   * Links shaders into a program.
   *
   * @param vertexShader a WebGL vertex shader object id
   * @param fragmentShader a WebGL fragment shader object id
   * @return a WebGLProgram object
   * @throw an Error object if linking failed
   */
  namespace.linkProgram = function(vertexShader, fragmentShader) {
    var program = gl.createProgram();
    gl.checkError();
    gl.attachShader(program, vertexShader);
    gl.checkError();
    gl.attachShader(program, fragmentShader);
    gl.checkError();
    gl.linkProgram(program);
    gl.checkError();
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("Program link error:\n" + gl.getProgramInfoLog(program));
    }
    return program;
  };

  /**
   * TODO design some decent api around this that is not harder to use
   */
  namespace.programFromScripts = function(vertexScript, fragmentScript) {
    return namespace.linkProgram(
        namespace.compileShader(namespace.getScriptContents(vertexScript), gl.VERTEX_SHADER),
        namespace.compileShader(namespace.getScriptContents(fragmentScript), gl.FRAGMENT_SHADER));
  };

})(Glower);
