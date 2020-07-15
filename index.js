import * as MP from "@bandaloo/merge-pass";

/** @type {WebGL2RenderingContext} */
let gl;
/** @type {WebGLUniformLocation[]} */
let programs = [];
/** @type {WebGLFramebuffer[]} */
let framebuffers = [];
/** @type {{time: WebGLUniformLocation, res: WebGLUniformLocation}[]} */
let locations = [];
/** @type {MP.Merger} */
let merger;

const common = `#ifdef GL_ES
precision mediump float;
#endif
uniform mediump vec2 u_resolution;
uniform mediump float u_time;\n`;

const shaderToyDefault = `void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec3 col = 0.5 + 0.5 * cos(u_time + uv.xyx + vec3(0,2,4));
  gl_FragColor = vec4(col, 1.0);
}`;

const blueWaves = `void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec3 col = vec3(0., 0., 0.5 + 0.5 * cos(u_time * -2. + uv.x * 40.));
  gl_FragColor = vec4(col, 1.0);
}`;

const redRectangles = `void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float c = ceil(mod((uv.x + u_time / 9. + .5 * ceil(mod(uv.y * 9., 1.) - .5)) * 9., 1.) - .5);
  gl_FragColor = vec4(c, c, c, 1.0);
}`;

const sources = [shaderToyDefault, redRectangles, blueWaves];

/** @type {WebGLFramebuffer} */
let framebuffer;

window.onload = () => {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById(
    "gl"
  ));
  gl = canvas.getContext("webgl2");

  // not necessary but this lets you fullscreen the canvas by clicking on it
  canvas.addEventListener("click", () => canvas.requestFullscreen());

  // create a buffer object to store vertices
  const buffer = gl.createBuffer();

  // point buffer at graphic context's array buffer
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

  const points = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];
  const triangles = new Float32Array(points);

  // initialize memory for buffer and populate it; give open gl hint contents
  // will not change dynamically
  gl.bufferData(gl.ARRAY_BUFFER, triangles, gl.STATIC_DRAW);

  /** @type {WebGLTexture[]} */
  let textures = [];

  for (const source of sources) {
    // make program
    const program = makeProgram(source);
    gl.useProgram(program);

    // find a pointer to the time uniform in our fragment shader
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

    // add framebuffer to list
    //framebuffers.push(framebuffer);
  }

  framebuffer = gl.createFramebuffer();
  //gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

  merger = new MP.Merger(
    [
      MP.brightness(MP.op(-0.9, "*", MP.getcomp(MP.channel(1), "b"))),
      MP.godrays(),
    ],
    textures[0],
    gl,
    {
      // color information is shader toy default
      channels: textures.slice(1), // red rectangles and blue waves for channels
    }
  );

  fullRender();
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
  gl.shaderSource(fragmentShader, common + fShaderSource);
  gl.compileShader(fragmentShader);
  console.log(gl.getShaderInfoLog(fragmentShader));

  // create shader program
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  return program;
}

function sceneRender(time) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  for (let i = 0; i < programs.length; i++) {
    const program = programs[i];
    //const framebuffer = framebuffers[i];
    const location = locations[i];

    // IMPORTANT!! change the texture attachment of your framebuffer to the
    // texture in the merger. due to the implementation of `target`, channel
    // textures, the front texture and the back texture get shuffled around.
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0, // attachment
      gl.TEXTURE_2D,
      i === 0 ? merger.tex.back.tex : merger.tex.bufTextures[i - 1].tex, // target texture
      0 // level
    );

    // use the next draw program
    gl.useProgram(program);

    // update time on CPU and GPU
    gl.uniform1f(location.time, time);

    // draw triangles using the array buffer from index 0 to 6 (6 is count)
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
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

function fullRender(time = 0) {
  const seconds = time / 1000;
  sceneRender(seconds); // updates textures before merger uses them
  merger.draw(seconds);
  window.requestAnimationFrame(fullRender);
}
