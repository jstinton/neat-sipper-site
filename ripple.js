(function () {
  const canvas = document.getElementById('ripple');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) { document.body.style.background = '#0f0600'; return; }

  const vertSrc = `
    attribute vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
  `;

  const fragSrc = `
    precision highp float;
    uniform float u_time;
    uniform vec2  u_res;

    /* tanh not in GLSL ES 1.0 */
    float htanh(float x) {
      x = clamp(x, -10.0, 10.0);
      float e2 = exp(2.0 * x);
      return (e2 - 1.0) / (e2 + 1.0);
    }

    /* Bourbon colour ramp: near-black → dark amber → bright gold */
    vec3 bourbon(float t) {
      t = clamp(t, 0.0, 1.0);
      vec3 c0 = vec3(0.04, 0.01, 0.00);
      vec3 c1 = vec3(0.20, 0.07, 0.01);
      vec3 c2 = vec3(0.46, 0.18, 0.03);
      vec3 c3 = vec3(0.70, 0.36, 0.06);
      vec3 c4 = vec3(0.88, 0.56, 0.11);
      vec3 c5 = vec3(0.97, 0.80, 0.30);
      vec3 c6 = vec3(0.72, 0.45, 0.09);
      float s = t * 6.0;
      if (s < 1.0) return mix(c0, c1, s);
      if (s < 2.0) return mix(c1, c2, s - 1.0);
      if (s < 3.0) return mix(c2, c3, s - 2.0);
      if (s < 4.0) return mix(c3, c4, s - 3.0);
      if (s < 5.0) return mix(c4, c5, s - 4.0);
      return mix(c5, c6, s - 5.0);
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_res;
      vec2 p  = uv * 2.0 - 1.0;
      p.x    *= u_res.x / u_res.y;

      float r     = length(p);
      float theta = atan(p.y, p.x);
      float T     = u_time * 0.30;   /* animation speed */

      /* ── SINGLE-DROP WAVE FIELD ────────────────────────────────────────
         Rings are purely radial (from centre outward), like a drop of
         bourbon hitting the surface.  Three harmonics give the natural
         multi-ring train of a real water drop.  Only the tiniest angular
         wobble is added so the circles feel organic, not mechanical.    */

      /* Primary ring — the main outward-travelling wavefront */
      float v = sin(r * 22.0 - T * 3.2);

      /* 2nd harmonic — adds ring density inside the wavefront */
      v += sin(r * 11.0 - T * 1.6) * 0.50;

      /* 3rd harmonic */
      v += sin(r *  5.5 - T * 0.8) * 0.22;

      /* Tiny angular asymmetry — real drops are never perfectly round */
      v += sin(r * 8.0 + theta * 2.0 - T * 1.4) * 0.09;
      v += sin(r * 15.0 - theta * 3.0 - T * 2.2) * 0.06;

      /* v range ≈ ± 1.87 */

      /* ── COLOUR ────────────────────────────────────────────────────── */
      float colorPos = (v + 1.87) / 3.74;
      vec3 baseColor = bourbon(colorPos);

      /* ── SHARP CONCENTRIC RINGS ────────────────────────────────────
         sin(v * ringFreq) creates many fine bands;
         htanh(...* crisp) sharpens them to crisp contour lines.       */
      float ringFreq = 18.0;
      float crisp    = 11.0;
      float bands    = sin(v * ringFreq);
      float sharp    = htanh(bands * crisp);
      float brightness = (sharp + 1.0) * 0.5;

      /* Trough nearly black, peaks full colour */
      vec3 col = baseColor * (0.03 + 0.97 * brightness);

      /* ── WAVE ENERGY ENVELOPE ──────────────────────────────────────
         Real ripples lose energy with distance from the drop point.
         Multiply by a soft radial fall-off so rings are most vivid
         in the centre and fade toward the edges.                      */
      float energy = exp(-r * 1.0);
      col *= (0.15 + 0.85 * energy);

      /* ── GLASS RIM VIGNETTE ────────────────────────────────────── */
      float vig = 1.0 - smoothstep(0.30, 1.0, r);
      col = mix(col * 0.04, col, vig);

      /* ── DROP IMPACT GLOW ──────────────────────────────────────────
         Tiny bright warm spot at the centre — the moment of impact.  */
      float impact = exp(-r * r * 8.0) * 0.45;
      col += impact * vec3(0.98, 0.72, 0.25);

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function compileShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Ripple shader error:', gl.getShaderInfoLog(s));
    }
    return s;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compileShader(gl.VERTEX_SHADER, vertSrc));
  gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1, -1,  1,
    -1,  1,  1, -1,  1,  1
  ]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uTime = gl.getUniformLocation(prog, 'u_time');
  const uRes  = gl.getUniformLocation(prog, 'u_res');

  function resize() {
    canvas.width  = canvas.offsetWidth  || window.innerWidth;
    canvas.height = canvas.offsetHeight || window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);
  resize();
  window.addEventListener('load', resize);

  const t0 = performance.now();
  function render() {
    gl.uniform1f(uTime, (performance.now() - t0) / 1000);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(render);
  }
  render();
})();
