import * as MP from "@bandaloo/merge-pass";

/** @type {WebGL2RenderingContext} */
let gl;
/** @type {WebGLUniformLocation[]} */
let programs = [];
/** @type {WebGLTexture[]} */
let textures = [];
/** @type {WebGLFramebuffer[]} */
let framebuffers = [];
/** @type {{time: WebGLUniformLocation, res: WebGLUniformLocation}[]} */
let locations = [];
/** @type {MP.Merger} */
let merger;

const shaderToyDefault = `
#ifdef GL_ES
precision mediump float;
#endif

uniform mediump vec2 u_resolution;
uniform mediump float u_time;
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec3 col = 0.5 + 0.5 * cos(u_time + uv.xyx + vec3(0,2,4));
  gl_FragColor = vec4(col, 1.0);
}`;

const blueWaves = `
#ifdef GL_ES
precision mediump float;
#endif

uniform mediump vec2 u_resolution;
uniform mediump float u_time;
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec3 col = vec3(0., 0., 0.5 + 0.5 * cos(u_time + uv.x * 20.));
  gl_FragColor = vec4(col, 1.0);
}`;

const redRectangles = `
#ifdef GL_ES
precision mediump float;
#endif

uniform mediump vec2 u_resolution;
uniform mediump float u_time;
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec3 col = vec3(ceil(0.5 * cos(u_time + uv.x * 20.) * cos(u_time + uv.y * 10.)), 0., 0.);
  gl_FragColor = vec4(col, 1.0);
}`;

let sources = [shaderToyDefault, redRectangles, blueWaves];

window.onload = function () {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById(
    "gl"
  ));
  gl = canvas.getContext("webgl2");

  // create a buffer object to store vertices
  const buffer = gl.createBuffer();

  // point buffer at graphic context's array buffer
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

  // prettier-ignore
  const triangles = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);

  // initialize memory for buffer and populate it; give open gl hint contents
  // will not change dynamically
  gl.bufferData(gl.ARRAY_BUFFER, triangles, gl.STATIC_DRAW);

  for (const source of sources) {
    // make program
    const program = makeProgram(source);
    gl.useProgram(program);

    // find a pointer to the uniform "time" in our fragment shader
    const loc = {
      time: gl.getUniformLocation(program, "u_time"),
      res: gl.getUniformLocation(program, "u_resolution"),
    };
    locations.push(loc);
    gl.uniform2f(loc.res, window.innerWidth, window.innerHeight);

    // get position attribute location in shader
    const position = gl.getAttribLocation(program, "a_position");
    // enable the attribute
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    // add program to list
    programs.push(program);

    // add texture to list
    const tex = makeTexture();
    textures.push(tex);

    // attach texture as first color attachment
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0, // attachment
      gl.TEXTURE_2D,
      tex, // target texture
      0 // level
    );

    // add framebuffer to list
    framebuffers.push(framebuffer);
  }

  merger = new MP.Merger(
    [
      MP.brightness(MP.op(-0.9, "*", MP.getcomp(MP.channel(1), "b"))),
      MP.godrays(),
    ],
    textures[0],
    gl,
    {
      // color information is shader toy default
      channels: textures.slice(1), // red rectangles and blue waves
    }
  );

  // TODO replace with full render (which will call animation loop)
  fullRender();
  //sceneRender();
};

function makeProgram(fShaderSource) {
  // create vertex shader
  const vShaderSource = `attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0., 1.);
}`;
  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertexShader, vShaderSource);
  gl.compileShader(vertexShader);
  console.log(gl.getShaderInfoLog(vertexShader));

  // create fragment shader
  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragmentShader, fShaderSource);
  gl.compileShader(fragmentShader);
  console.log(gl.getShaderInfoLog(fragmentShader));

  // create shader program
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  return program;
}

// keep track of time via incremental frame counter
let time = 0;

function sceneRender() {
  // increment time (really frames)
  time++;

  for (let i = 0; i < programs.length; i++) {
    const program = programs[i];
    //const texture = textures[i];
    const framebuffer = framebuffers[i];
    const location = locations[i];

    // after binding this framebuffer, every time we call `gl.drawArrays` it
    // will render out to the texture, since we attached a texture to the
    // framebuffer
    // prettier-ignore
    //gl.bindFramebuffer(gl.FRAMEBUFFER, i < programs.length - 1 ? framebuffer : null);
    // TODO get rid of this
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

    // use the next draw program
    gl.useProgram(program);

    // update time on CPU and GPU
    gl.uniform1f(location.time, time / 60);

    // draw triangles using the array buffer from index 0 to 6 (6 is count)
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  //gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function makeTexture() {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0, // level
    gl.RGBA, // internal format
    gl.drawingBufferWidth,
    gl.drawingBufferHeight,
    0, // border
    gl.RGBA, // format
    gl.UNSIGNED_BYTE, // type
    null // data
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function fullRender() {
  sceneRender();
  merger.draw(time / 60);
  window.requestAnimationFrame(fullRender);
  //window.setTimeout(fullRender, 500);
}
