# TODO add docs to all public methods

isString = (x) -> Object.prototype.toString.call(x) == '[object String]'

isArray = (x) -> Object.prototype.toString.call(x) == '[object Array]'

isInteger = (x) -> x == Math.floor(x)

getElement = (element) ->
  throw new Error('Element is null or undefined') unless element?
  return element if element.innerHTML?
  id = element
  element = document.getElementById(id)
  throw new Error("Element #{id} is neither a DOM element nor an id") unless element?
  element

REQUIRED = new Object()

processArgs = (args, defaultArgs) ->
  # TODO check enum values when a particular flag (debug?) is enabled
  for own key, value of defaultArgs
    if !args[key]?
      throw new Error("Argument #{key} is required") if value == REQUIRED
      args[key] = value
  return

###########
# CONTEXT #
###########

# TODO implement WebGLContextAttributes (alpha, etc.)
getGl = (args) ->
  processArgs(args, {
    canvas: REQUIRED
    debug: false
    errorCallback: null
    callCallback: null
  })

  canvas = getElement(args.canvas)

  for context_name in ['webgl', 'experimental-webgl', 'moz-webgl', 'webkit-3d']
    gl = canvas.getContext(context_name)
    break if gl
  throw new Error('WebGL not supported') unless gl?

  if args.debug
    gl = wrapInDebugContext(gl, args.errorCallback, args.callCallback)
  gl

wrapInDebugContext = (gl, errorCallback, callCallback) ->
  throw new Error('To use debug mode, you need to load webgl-debug.js. Get it from http://www.khronos.org/webgl/wiki/Debugging') unless WebGLDebugUtils?

  onError = null
  if errorCallback?
    onError = (err, funcName, passedArguments) ->
      errorCallback(
          "#{WebGLDebugUtils.glEnumToString(err)} in call " +
          "#{funcName}(#{Array.prototype.slice.call(passedArguments).join(', ')})")

  onCall = null
  if callCallback?
    onCall = (funcName, passedArguments) ->
      callCallback(
          "#{funcName}(#{Array.prototype.slice.call(passedArguments).join(', ')})")

  WebGLDebugUtils.makeDebugContext(gl, onError, onCall)

# args can contain:
# canvas: canvas DOM node, or id of one (required)
# debug: set to true to log WebGL errors to console (requires webgl-debug.js to be loaded)
# errorCallback: called with error string on error if debug is true
# callCallback: called with call signature string on every WebGL call if debug is true
window.Gladder = (args) ->

  gl = getGl(args)
  @canvas = gl.canvas

  ################
  # CAPABILITIES #
  ################

  @Capability =
    BLEND: gl.BLEND
    CULL_FACE: gl.CULL_FACE
    DEPTH_TEST: gl.DEPTH_TEST
    DITHER: gl.DITHER
    POLYGON_OFFSET_FILL: gl.POLYGON_OFFSET_FILL
    SAMPLE_ALPHA_TO_COVERAGE: gl.SAMPLE_ALPHA_TO_COVERAGE
    SAMPLE_COVERAGE: gl.SAMPLE_COVERAGE
    SCISSOR_TEST: gl.SCISSOR_TEST
    STENCIL_TEST: gl.STENCIL_TEST
  
  capabilityState = {}
  capabilityState[@Capability.DITHER] = true

  # TODO merge into draw call
  @enable = ->
    for cap in arguments
      if !capabilityState[cap]
        gl.enable(cap)
        capabilityState[cap] = true

  @disable = ->
    for cap in arguments
      if capabilityState[cap]
        gl.disable(cap)
        capabilityState[cap] = false

  #############
  # ANIMATION #
  #############

  REQUEST_ANIMATION_FRAME =
    window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.oRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    (callback, element) ->
      window.setTimeout(callback, 1000/60)

  @requestAnimationFrame = (callback) ->
    REQUEST_ANIMATION_FRAME.call(window, callback, gl.canvas)
  
  mainLoopExiting = null

  @mainLoop = (callback) ->
    mainLoopExiting = false
    last = Date.now()
    drawFrame = ->
      now = Date.now()
      delta = Math.max(0, now - last)
      last = now
      callback(delta)
      gla.requestAnimationFrame(drawFrame, gl.canvas) unless mainLoopExiting
    @requestAnimationFrame(drawFrame, gl.canvas)

  @exitMainLoop = -> mainLoopExiting = true

  @flush = -> gl.flush()

  @finish = -> gl.finish()
  
  ############
  # VIEWPORT #
  ############

  viewport =
    x: 0
    y: 0
    width: gl.canvas.width
    height: gl.canvas.height

  setViewport = (args) ->
    processArgs(args, {
      x: 0
      y: 0
      width: gl.canvas.width
      height: gl.canvas.height
    })
    if viewport.x != args.x || viewport.y != args.y || viewport.width != args.width || viewport.height != args.height
      gl.viewport(args.x, args.y, args.width, args.height)
      viewport.x = x
      viewport.y = y
      viewport.width = width
      viewport.height = height

  ###########
  # BUFFERS #
  ###########
  
  # TODO currently unused, remove if unneeded
  getGLBufferType = (arrayBufferViewType) ->
    switch arrayBufferViewType
      when Int8Array then gl.BYTE
      when Uint8Array then gl.UNSIGNED_BYTE
      when Int16Array then gl.SHORT
      when Uint16Array then gl.UNSIGNED_SHORT
      when Int32Array then gl.FIXED
      when Uint32Array then gl.FIXED # XXX Not quite accurate
      when Float32Array then gl.FLOAT
      else throw new Error("Unsupported buffer type #{args.type}")

  sizeOfType = (type) ->
    switch type
      when gla.Buffer.Type.BYTE, gla.Buffer.Type.UNSIGNED_BYTE then 1
      when gla.Buffer.Type.SHORT, gla.Buffer.Type.UNSIGNED_SHORT then 2
      when gla.Buffer.Type.FIXED, gla.Buffer.Type.FLOAT then 4
      else throw new Error("Unknown type #{type}")

  @BufferView = (buffer, args) ->
    processArgs(args, {
      size: REQUIRED
      type: gla.Buffer.Type.FLOAT
      normalized: false
      stride: 0
      offset: 0
    })

    typeSize = sizeOfType(args.type)
    if args.stride > 0 && args.stride < typeSize * args.size
      throw new Error("stride == #{args.stride}, if nonzero, must be at least " +
        "size * sizeof(type) == #{args.size} * #{typeSize} == #{args.size * args.typeSize}")
    if !isInteger(args.stride / typeSize)
      throw new Error("stride == #{args.stride} must be a multiple of sizeof(type) == #{typeSize}")
    if !isInteger(args.offset / typeSize)
      throw new Error("offset == #{args.offset} must be a multiple of sizeof(type) == #{typeSize}")

    @buffer = buffer
    @size = args.size
    @type = args.type
    @normalized = args.normalized
    @stride = args.stride
    @offset = args.offset

    @numValues = ->
      if @stride > 0
        @buffer.numBytes / @stride * @size
      else
        @buffer.numBytes / sizeOfType(@type)

    @numItems = ->
      if @stride > 0
        @buffer.numBytes / @stride
      else
        @buffer.numBytes / (sizeOfType(@type) * @size)

    return

  boundBuffer = {}

  @Buffer = (args) ->
    processArgs(args, {
      target: gla.Buffer.Target.ARRAY_BUFFER
      data: null
      size: null
      usage: gla.Buffer.Usage.STATIC_DRAW
      views: {}
    })

    glBuffer = gl.createBuffer()

    @target = args.target
    @usage = args.usage
    @numBytes = null

    @bind = ->
      if boundBuffer[@target] != this
        gl.bindBuffer(@target, glBuffer)
        boundBuffer[@target] = this

    @set = (args) ->
      processArgs(args, {
        data: null
        size: null
        offset: null
        usage: this.usage
      })
      @bind()
      if args.offset == null
        if !(args.data == null ^ args.size == null)
          throw new Error('Must set exactly one of data and size')
        if args.data != null
          data = args.data
          if isArray(data)
            data = new Float32Array(data)
          gl.bufferData(@target, data, args.usage)
          @numBytes = data.byteLength
        else
          gl.bufferData(@target, args.size, args.usage)
          @numBytes = args.size
      else
        if args.usage != null
          throw new Error('Cannot set usage and offset at the same time')
        gl.bufferSubData(@target, args.offset, args.data)
      @usage = args.usage

    @addView = (name, args) ->
      @views[name] = new gla.BufferView(this, args)

    @removeView = (name) ->
      delete @views[name]

    if args.data != null || args.size != null
      @set({ data: args.data, size: args.size, usage: this.usage })

    # TODO if we were passed typed data, infer view type if not set
    @views = {}
    for own key, view of args.views
      @views[key] = new gla.BufferView(this, view)

    return

  @Buffer.Target =
    ARRAY_BUFFER: gl.ARRAY_BUFFER
    ELEMENT_ARRAY_BUFFER: gl.ELEMENT_ARRAY_BUFFER

  @Buffer.Usage =
    DYNAMIC_DRAW: gl.DYNAMIC_DRAW
    STATIC_DRAW: gl.STATIC_DRAW
    STREAM_DRAW: gl.STREAM_DRAW

  @Buffer.Type =
    BYTE: gl.BYTE
    UNSIGNED_BYTE: gl.UNSIGNED_BYTE
    SHORT: gl.SHORT
    UNSIGNED_SHORT: gl.UNSIGNED_SHORT
    FIXED: gl.FIXED
    FLOAT: gl.FLOAT

  ###########
  # SHADERS #
  ###########

  getScriptContents = (script) -> getElement(script).innerHTML

  compileShader = (glShader, source) ->
    gl.shaderSource(glShader, source)
    gl.compileShader(glShader)
    if !gl.getShaderParameter(glShader, gl.COMPILE_STATUS)
      throw new Error("Shader compile error:\n#{gl.getShaderInfoLog(glShader)}")

  @Shader = (args) ->
    processArgs(args, {
      source: REQUIRED
      type: REQUIRED
    })

    try
      source = getScriptContents(args.source)
    catch e
      # Assume we were passed raw shader source code
      source = args.source

    type = args.type

    glShader = gl.createShader(type)
    compileShader(glShader, source)

    # Internal use only.
    @attach = (glProgram) ->
      gl.attachShader(glProgram, glShader)

    return

  @Shader.Type =
    VERTEX_SHADER: gl.VERTEX_SHADER
    FRAGMENT_SHADER: gl.FRAGMENT_SHADER

  ############
  # UNIFORMS #
  ############

  Uniform = (glUniform, type) ->
    value = null

    @type = type

    suffix = {
      'bool': '1i',
      'int': '1i', 'ivec2': '2i', 'ivec3': '3i', 'ivec4': '4i',
      'float': '1f', 'vec2': '2f', 'vec3': '3f', 'vec4': '4f',
      'mat2': '2f', 'mat3': '3f', 'mat4': '4f',
      'sampler2D': '1i', 'samplerCube': '1i',
    }[type]
    throw new Error("Unknown uniform type #{type}") unless suffix?
    vSuffix = suffix + 'v'

    if type.substring(0, 3) == 'mat'
      vSetter = gl['uniformMatrix' + vSuffix]
      @set = (matrix) ->
        vSetter.call(gl, glUniform, false, matrix)
    else
      setter = gl['uniform' + suffix]
      vSetter = gl['uniform' + vSuffix]
      @set = ->
        args = Array.prototype.slice.call(arguments)
        args.unshift(glUniform)
        if args[args.length - 1][0] != undefined
          # Received an array
          vSetter.apply(gl, args)
        else if setter != null
          # Received some scalars
          setter.apply(gl, args)
        else
          throw new Error("Uniform cannot be set from #{args.join(', ')}")
        args.shift()
        value = args

    @get = -> value

    return

  ##############
  # ATTRIBUTES #
  ##############

  Attribute = (glAttribute, type) ->
    value = null
    arrayEnabled = false

    suffix = {
      'float': '1f', 'vec2': '2f', 'vec3': '3f', 'vec4': '4f',
      'int': '1i', 'ivec2': '2i', 'ivec3': '3i', 'ivec4': '4i',
    }[type]
    throw new Error("Unknown attribute type #{type}") unless suffix?
    vSuffix = suffix + 'v'

    setter = gl['vertexAttrib' + suffix]
    vSetter = setter + 'v'

    enableArray = (enabled) ->
      if enabled != arrayEnabled
        if enabled
          # TODO borks if attribute not found (-1)
          gl.enableVertexAttribArray(glAttribute)
        else
          gl.disableVertexAttribArray(glAttribute)
        arrayEnabled = enabled

    @get = -> value
    
    @set = ->
      args = Array.prototype.slice.call(arguments)
      args.unshift(@glUniform)
      if args[args.length - 1][0] != undefined
        # Received an array
        enableArray(false)
        vSetter.apply(gl, args)
      else if args[1] instanceof gla.BufferView
        # Received a buffer
        # TODO check it's of type ARRAY_BUFFER
        # TODO allow passing a Buffer if it has only one view
        bufferView = args[1]
        bufferView.buffer.bind()
        enableArray(true)
        gl.vertexAttribPointer(glAttribute, bufferView.size, bufferView.type, bufferView.normalized, bufferView.stride, bufferView.offset)
      else if setter != null
        # Received some scalars
        enableArray(false)
        setter.apply(gl, args)
      else
        throw new Error("Uniform cannot be set from #{args.join(', ')}")
      args.shift()
      value = args

    return

  ############
  # PROGRAMS #
  ############

  linkProgram = (glProgram, vertexShader, fragmentShader) ->
    vertexShader.attach(glProgram)
    fragmentShader.attach(glProgram)
    gl.linkProgram(glProgram)
    if !gl.getProgramParameter(glProgram, gl.LINK_STATUS)
      throw new Error("Program link error:\n#{gl.getProgramInfoLog(glProgram)}")

  usedProgram = null

  @Program = (args) ->
    processArgs(args, {
      vertexShader: REQUIRED
      fragmentShader: REQUIRED
      uniforms: {}
      attributes: {}
    })

    glProgram = gl.createProgram()
    if args.vertexShader instanceof gla.Shader
      vertexShader = args.vertexShader
    else
      vertexShader = new gla.Shader({ source: args.vertexShader, type: gla.Shader.Type.VERTEX_SHADER })
    if args.fragmentShader instanceof gla.Shader
      fragmentShader = args.fragmentShader
    else
      fragmentShader = new gla.Shader({ source: args.fragmentShader, type: gla.Shader.Type.FRAGMENT_SHADER })
    linkProgram(glProgram, vertexShader, fragmentShader)

    @uniforms = {}
    for own name, type of args.uniforms
      glUniform = gl.getUniformLocation(glProgram, name)
      console.log("Warning: uniform #{name} not found in program") unless glUniform?
      @uniforms[name] = new Uniform(glUniform, type)

    @attributes = {}
    for own name, type of args.attributes
      glAttribute = gl.getAttribLocation(glProgram, name)
      console.log("Warning: attribute #{name} not found in program") unless glAttribute?
      @attributes[name] = new Attribute(glAttribute, type)

    @use = ->
      if this != usedProgram
        gl.useProgram(glProgram)
        usedProgram = this

    return

  #################
  # TEXTURE UNITS #
  #################

  activeTextureUnit = 0

  TextureUnit = (index) ->
    glUnit = gl.TEXTURE0 + index

    @bound = {}

    activate = ->
      if activeTextureUnit != index
        gl.activeTexture(glUnit)
        activeTextureUnit = index

    @bind = (target, texture) ->
      if @bound[target] != texture
        activate()
        gl.bindTexture(target, texture._id)
        @bound[target] = texture

    return

  textureUnits = (->
    count = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)
    new TextureUnit(i) for i in [0...count]
  )()

  getActiveTextureUnit = -> textureUnits[activeTextureUnit]

  ############
  # TEXTURES #
  ############

  @Texture = (args) ->
    processArgs(args, {
      target: gla.Texture.Target.TEXTURE_2D
      minFilter: gla.Texture.Filter.NEAREST_MIPMAP_LINEAR
      magFilter: gla.Texture.Filter.LINEAR
      wrapS: gla.Texture.Wrap.REPEAT
      wrapT: gla.Texture.Wrap.REPEAT
    })

    glTexture = gl.createTexture()
    @_id = glTexture

    target = args.target

    parameters = {}

    bind = => getActiveTextureUnit().bind(target, this)

    setParameter = (parameter, value) =>
      if parameters[parameter] != value
        bind()
        gl.texParameteri(target, parameter, value)
        parameters[parameter] = value

    @setFilter = (min, mag) ->
      setParameter(gl.TEXTURE_MIN_FILTER, min)
      setParameter(gl.TEXTURE_MAG_FILTER, if mag? then mag else min)

    @setWrap = (s, t) ->
      setParameter(gl.TEXTURE_WRAP_S, s)
      setParameter(gl.TEXTURE_WRAP_T, if t? then t else s)

    # TODO handle NPOT textures automatically
    # TODO support texSubImage2D
    # TODO support copyTex(Sub)Image2D
    @setImage = (args) =>
      processArgs(args, {
        width: null
        height: null
        target: gla.Texture.Target.TEXTURE_2D
        level: 0
        format: gla.Texture.Format.RGBA
        type: gla.Texture.Type.UNSIGNED_BYTE
        image: null
        generateMipmap: true
      })
      if args.image != null
        if isString(args.image)
          image = new Image()
          image.onload = =>
            @setImage({ target: args.target, level: args.level, format: args.format, type: args.type, image: image, generateMipmap: args.generateMipmap })
            @onload() if @onload?
          image.src = args.image
        else
          bind()
          gl.texImage2D(args.target, args.level, args.format, args.format, args.type, args.image)
          if args.generateMipmap
            gl.generateMipmap(args.target)
      else
        if args.width == null || args.height == null
          throw new Error('If image is not specified, width and height are mandatory')
        bind()
        gl.texImage2D(args.target, args.level, args.format, args.width, args.height, 0, args.format, args.type, null)
      return

    @setFilter(args.minFilter, args.magFilter)
    @setWrap(args.wrapS, args.wrapT)
    if (args.width != undefined && args.height != undefined) || args.image != undefined
      @setImage({
        width: args.width
        height: args.height
        format: args.format
        type: args.type
        image: args.image
      })

    return

  @Texture.Target =
    TEXTURE_2D: gl.TEXTURE_2D
    CUBE_MAP: gl.CUBE_MAP
    CUBE_MAP_POSITIVE_X: gl.TEXTURE_CUBE_MAP_POSITIVE_X
    CUBE_MAP_NEGATIVE_X: gl.TEXTURE_CUBE_MAP_NEGATIVE_X
    CUBE_MAP_POSITIVE_Y: gl.TEYTURE_CUBE_MAP_POSITIVE_Y
    CUBE_MAP_NEGATIVE_Y: gl.TEYTURE_CUBE_MAP_NEGATIVE_Y
    CUBE_MAP_POSITIVE_Z: gl.TEZTURE_CUBE_MAP_POSITIVE_Z
    CUBE_MAP_NEGATIVE_Z: gl.TEZTURE_CUBE_MAP_NEGATIVE_Z
  @Texture.Filter =
    NEAREST: gl.NEAREST
    LINEAR: gl.LINEAR
    NEAREST_MIPMAP_NEAREST: gl.NEAREST_MIPMAP_NEAREST
    LINEAR_MIPMAP_NEAREST: gl.LINEAR_MIPMAP_NEAREST
    NEAREST_MIPMAP_LINEAR: gl.NEAREST_MIPMAP_LINEAR
    LINEAR_MIPMAP_LINEAR: gl.LINEAR_MIPMAP_LINEAR
  @Texture.Wrap =
    CLAMP_TO_EDGE: gl.CLAMP_TO_EDGE
    MIRRORED_REPEAT: gl.MIRRORED_REPEAT
    REPEAT: gl.REPEAT
  @Texture.Format =
    ALPHA: gl.ALPHA
    LUMINANCE: gl.LUMINANCE
    LUMINANCE_ALPHA: gl.LUMINANCE_ALPHA
    RGB: gl.RGB
    RGBA: gl.RGBA
  @Texture.Type =
    UNSIGNED_BYTE: gl.UNSIGNED_BYTE
    UNSIGNED_SHORT_5_6_5: gl.UNSIGNED_SHORT_5_6_5
    UNSIGNED_SHORT_4_4_4_4: gl.UNSIGNED_SHORT_4_4_4_4
    UNSIGNED_SHORT_5_5_5_1: gl.UNSIGNED_SHORT_5_5_5_1

  #################
  # RENDERBUFFERS #
  #################

  # TODO implement renderbuffers

  ################
  # FRAMEBUFFERS #
  ################

  boundFramebuffer = null

  bindFramebuffer = (framebuffer) ->
    if framebuffer != boundFramebuffer
      gl.bindFramebuffer(gl.FRAMEBUFFER, if framebuffer? then framebuffer._id else null)
      boundFramebuffer = framebuffer

  @Framebuffer = (args) ->
    processArgs(args, {
      colorBuffer: null
      depthBuffer: null
      stencilBuffer: null
      width: gl.canvas.width
      height: gl.canvas.height
    })

    glFramebuffer = gl.createFramebuffer()
    @_id = glFramebuffer

    @colorBuffer = null
    @depthBuffer = null
    @stencilBuffer = null

    # TODO add delete() functions to this and other objects

    attachBuffer = (attachment, buffer, width, height) ->
      bindFramebuffer(this)
      if buffer == gla.CREATE_TEXTURE_2D
        buffer = new gla.Texture({
          minFilter: gla.Texture.Filter.NEAREST
          magFilter: gla.Texture.Filter.NEAREST
          wrapS: gla.Texture.Wrap.CLAMP_TO_EDGE
          wrapT: gla.Texture.Wrap.CLAMP_TO_EDGE
          width: width
          height: height
        })
      else if buffer == gla.CREATE_RENDERBUFFER
        # TODO implement once we have renderbuffers
        throw new Error('Renderbuffers not yet supported')

      if buffer instanceof gla.Texture
        gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, buffer._id, 0)
      else if buffer instanceof gla.RenderBuffer
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, attachment, gl.RENDERBUFFER, buffer._id)

      buffer

    @attachColorBuffer = (colorBuffer, width, height) ->
      @colorBuffer = attachBuffer.call(this, gl.COLOR_ATTACHMENT0, colorBuffer, width, height)

    @attachDepthBuffer = (depthBuffer, width, height) ->
      @depthBuffer = attachBuffer.call(this, gl.DEPTH_ATTACHMENT, depthBuffer, width, height)

    @attachStencilBuffer = (stencilBuffer, width, height) ->
      @stencilBuffer = attachBuffer.call(this, gl.STENCIL_ATTACHMENT, stencilBuffer, width, height)

    @checkComplete = ->
      bindFramebuffer(this)
      framebufferStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
      if framebufferStatus != gl.FRAMEBUFFER_COMPLETE
        textStatus = switch framebufferStatus
          when gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT then 'INCOMPLETE_ATTACHMENT'
          when gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT then 'INCOMPLETE_MISSING_ATTACHMENT'
          when gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS then 'INCOMPLETE_DIMENSIONS'
          when gl.FRAMEBUFFER_UNSUPPORTED then 'UNSUPPORTED'
          else framebufferStatus
        throw new Error("Framebuffer incomplete: #{textStatus}")

    if args.colorBuffer
      @attachColorBuffer(args.colorBuffer, args.width, args.height)
    if args.depthBuffer
      @attachDepthBuffer(args.depthBuffer, args.width, args.height)
    if args.stencilBuffer
      @attachStencilBuffer(args.stencilBuffer, args.width, args.height)

    return

  # TODO: set these on Framebuffer
  @CREATE_TEXTURE_2D = new Object()
  @CREATE_RENDERBUFFER = new Object()

  ############
  # CLEARING #
  ############

  clearColor = [0, 0, 0, 0]
  clearDepth = 1
  clearStencil = 0

  @clear = (args) ->
    processArgs(args, {
      color: null
      depth: null
      stencil: null
      framebuffer: null
    })

    bindFramebuffer(args.framebuffer)

    bits = 0
    if args.color != null
      bits |= gl.COLOR_BUFFER_BIT
      fullColor = []
      colorChanged = false
      for i in [0..3]
        if args.color[i] == undefined
          fullColor[i] = fullColor[i-1]
        else
          fullColor[i] = args.color[i]
        colorChanged = colorChanged || (fullColor[i] != clearColor[i])
      if colorChanged
        gl.clearColor(fullColor[0], fullColor[1], fullColor[2], fullColor[3])
        clearColor = fullColor
    if args.depth != null
      bits |= gl.DEPTH_BUFFER_BIT
      if args.depth != clearDepth
        gl.clearDepth(args.depth)
        clearDepth = args.depth
    if args.stencil != null
      bits |= gl.STENCIL_BUFFER_BIT
      if args.stencil != clearStencil
        gl.clearStencil(args.stencil)
        clearStencil = args.stencil
    gl.clear(bits)

  ###########
  # DRAWING #
  ###########

  # TODO accept a "stack" of multiple args, and merge them?
  # TODO implement polygonOffset
  @draw = (args) ->
    processArgs(args, {
      program: REQUIRED
      uniforms: {}
      attributes: {}
      mode: gla.DrawMode.TRIANGLES
      first: 0
      count: REQUIRED
      framebuffer: null
      # TODO: use framebuffer size if framebuffer is given
      viewport: { x: 0, y: 0, width: gl.canvas.width, height: gl.canvas.height }
    })

    framebuffer = args.framebuffer
    bindFramebuffer(framebuffer)
    if framebuffer != null
      framebuffer.checkComplete()

    setViewport(args.viewport)

    program = args.program
    program.use()

    currentTextureUnit = {}
    for own key, value of args.uniforms
      type = program.uniforms[key].type
      switch type
        when 'sampler2D', 'samplerRect'
          # XXX There is room for optimization here: if the texture is already bound
          # to another texture unit, just use that one.
          target = { sampler2D: gl.TEXTURE_2D, samplerCube: gl.TEXTURE_CUBE_MAP }[type]
          current = currentTextureUnit[target] || 0
          textureUnits[current].bind(target, value)
          program.uniforms[key].set(current)
          currentTextureUnit[target] = current + 1
        else
          program.uniforms[key].set(value)

    for own key, value of args.attributes
      program.attributes[key].set(value)

    # TODO add support for drawElements
    gl.drawArrays(args.mode, args.first, args.count)

  @DrawMode =
    POINTS: gl.POINTS
    LINE_STRIP: gl.LINE_STRIP
    LINE_LOOP: gl.LINE_LOOP
    LINES: gl.LINES
    TRIANGLE_STRIP: gl.TRIANGLE_STRIP
    TRIANGLE_FAN: gl.TRIANGLE_FAN
    TRIANGLES: gl.TRIANGLES

  return
