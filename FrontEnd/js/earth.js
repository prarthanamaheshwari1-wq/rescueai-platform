(function () {

    // ---------- settings ----------

    // Known background images: key = "width x height" of the file.
    // cx, cy, radius = where the Earth sits inside that image (pixels).
    // The script reads the real image size and the CSS position by itself,
    // so you can edit/crop the photo and it still lines up if the size is listed here.
    const PRESETS = {
        "1408x768": { cx: 707, cy: 381, radius: 259 },   // original wide image
        "1166x748": { cx: 608, cy: 382, radius: 258 }    // your cropped image
    };

    // Filled in automatically once the photo has loaded
    let PHOTO = { w: 1408, h: 768, cx: 707, cy: 381, radius: 259 };
    let BG_POS_X = 0.40;
    let BG_POS_Y = 0.15;

    const TEX_DAY    = "assets/earth_day.jpg";
    const TEX_NIGHT  = "assets/earth_night.jpg";
    const TEX_CLOUDS = "assets/earth_clouds.jpg";

    const SECONDS_PER_ROTATION = 90;   // lower = faster spin
    const AXIS_TILT = 0.38;            // radians
    const START_LON = 0.35;            // which part of the world faces us first
    const COVER = 1.025;               // slightly bigger so the photo's Earth is fully hidden


    // ---------- canvas + WebGL ----------

    const canvas = document.createElement("canvas");
    canvas.className = "earth-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:fixed;z-index:2;pointer-events:none;display:none;";

    const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: true });
    if (!gl) return;                                   // keep the photo's Earth

    document.body.appendChild(canvas);

    const VERT = `
        attribute vec2 aPos;
        varying vec2 vP;
        void main() {
            vP = aPos;
            gl_Position = vec4(aPos, 0.0, 1.0);
        }`;

    const FRAG = `
        precision highp float;
        varying vec2 vP;

        uniform sampler2D uDay;
        uniform sampler2D uNight;
        uniform sampler2D uClouds;
        uniform float uRot;
        uniform float uTilt;
        uniform float uSphere;     // sphere radius as a fraction of the canvas half-size
        uniform float uPx;         // sphere radius in pixels

        const float PI = 3.14159265;

        vec2 sphereUV(vec3 n, float rot) {
            // tilt the axis
            float c = cos(-uTilt), s = sin(-uTilt);
            vec3 m = vec3(n.x * c - n.y * s, n.x * s + n.y * c, n.z);
            float lon = atan(m.x, m.z) - rot;
            float lat = asin(clamp(m.y, -1.0, 1.0));
            return vec2(fract(lon / (2.0 * PI) + 0.5), 0.5 - lat / PI);
        }

        void main() {
            float r = length(vP) / uSphere;            // 1.0 = edge of the planet
            vec3 glowCol = vec3(0.35, 0.65, 1.0);

            // light comes from the upper left, like in the photo
            vec3 L = normalize(vec3(-0.6, 0.3, 0.72));

            if (r > 1.0) {
                // soft atmosphere halo outside the planet
                float h = exp(-(r - 1.0) * 16.0) * 0.55;
                float lit = 0.3 + 0.7 * clamp(dot(normalize(vP), normalize(L.xy)) * 0.5 + 0.5, 0.0, 1.0);
                float a = h * lit;
                gl_FragColor = vec4(glowCol * a, a);
                return;
            }

            vec2 q = vP / uSphere;
            vec3 n = vec3(q, sqrt(max(0.0, 1.0 - dot(q, q))));

            vec3 day = texture2D(uDay, sphereUV(n, uRot)).rgb;
            vec3 night = texture2D(uNight, sphereUV(n, uRot)).rgb;
            float cloud = texture2D(uClouds, sphereUV(n, uRot * 1.12)).r;

            float d = dot(n, L);
            float lightAmt = smoothstep(-0.2, 0.3, d);

            vec3 dayLit = (day * 1.35 + vec3(cloud) * 0.6) * (0.16 + 1.25 * max(d, 0.0));
            dayLit = mix(dayLit, dayLit * vec3(1.05, 1.02, 0.95), 0.4);

            vec3 nightLit = day * 0.05 + night * vec3(1.3, 1.0, 0.65) * (1.0 - smoothstep(-0.25, 0.1, d));

            vec3 col = mix(nightLit, dayLit, lightAmt);

            // ocean sun glint
            vec3 V = vec3(0.0, 0.0, 1.0);
            vec3 H = normalize(L + V);
            float oceanMask = clamp((day.b - day.r) * 3.0, 0.0, 1.0);
            col += pow(max(dot(n, H), 0.0), 140.0) * 0.22 * oceanMask * (1.0 - cloud);

            // blue rim light (atmosphere seen edge-on)
            float rim = pow(1.0 - n.z, 2.6);
            col += glowCol * rim * (0.25 + 0.9 * max(d + 0.25, 0.0));

            // smooth anti-aliased edge
            float edge = clamp((1.0 - r) * uPx, 0.0, 1.0);
            gl_FragColor = vec4(col * edge, edge);
        }`;

    function compile(type, src) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            console.warn("Earth shader error:", gl.getShaderInfoLog(sh));
            return null;
        }
        return sh;
    }

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { canvas.remove(); return; }

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return; }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const U = {
        rot:    gl.getUniformLocation(prog, "uRot"),
        tilt:   gl.getUniformLocation(prog, "uTilt"),
        sphere: gl.getUniformLocation(prog, "uSphere"),
        px:     gl.getUniformLocation(prog, "uPx")
    };

    gl.uniform1f(U.tilt, AXIS_TILT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);


    // ---------- textures ----------

    function loadTexture(url, unit, uniformName) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = function () {
                const tex = gl.createTexture();
                gl.activeTexture(gl.TEXTURE0 + unit);
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.uniform1i(gl.getUniformLocation(prog, uniformName), unit);
                resolve();
            };
            img.onerror = () => reject(new Error("Could not load " + url));
            img.src = url;
        });
    }


    // ---------- sizing: match the photo's Earth exactly ----------

    let sphereRadiusPx = 200;

    function layout() {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        // same maths as "background-size: cover"
        const scale = Math.max(vw / PHOTO.w, vh / PHOTO.h);
        const offX = (vw - PHOTO.w * scale) * BG_POS_X;
        const offY = (vh - PHOTO.h * scale) * BG_POS_Y;

        const cx = offX + PHOTO.cx * scale;
        const cy = offY + PHOTO.cy * scale;
        sphereRadiusPx = PHOTO.radius * scale * COVER;

        // The planet fills 72% of the canvas half-width; the rest holds the glow
        const SPHERE_FRACTION = 0.72;
        const full = (2 * sphereRadiusPx) / SPHERE_FRACTION;   // canvas side in CSS px

        canvas.style.width = full + "px";
        canvas.style.height = full + "px";
        canvas.style.left = (cx - full / 2) + "px";
        canvas.style.top = (cy - full / 2) + "px";
        canvas.width = Math.round(full * dpr);
        canvas.height = Math.round(full * dpr);

        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform1f(U.sphere, SPHERE_FRACTION);
        gl.uniform1f(U.px, sphereRadiusPx * dpr);
    }


    // ---------- animation ----------

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let running = true;
    const startTime = performance.now();

    function render(now) {
        const t = (now - startTime) / 1000;
        const rot = START_LON + (reduceMotion ? 0 : (t / SECONDS_PER_ROTATION) * Math.PI * 2);

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(U.rot, rot);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function loop(now) {
        if (!running) return;
        render(now);
        requestAnimationFrame(loop);
    }

    document.addEventListener("visibilitychange", function () {
        running = !document.hidden;
        if (running && !reduceMotion) requestAnimationFrame(loop);
    });

    let timer;
    window.addEventListener("resize", function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
            layout();
            render(performance.now());
        }, 150);
    });


    // ---------- read the photo + CSS position ----------

    function detectPhoto() {
        return new Promise(function (resolve) {
            const el = document.querySelector(".universe");
            if (!el) return resolve();

            const cs = getComputedStyle(el);
            const m = /url\(["']?(.*?)["']?\)/.exec(cs.backgroundImage);
            if (!m) return resolve();

            // First background layer position, e.g. "40% 15%"
            const pos = cs.backgroundPosition.split(",")[0].trim().split(/\s+/);
            const px = parseFloat(pos[0]), py = parseFloat(pos[1]);
            if (!isNaN(px) && pos[0].indexOf("%") > -1) BG_POS_X = px / 100;
            if (!isNaN(py) && pos[1] && pos[1].indexOf("%") > -1) BG_POS_Y = py / 100;

            const img = new Image();
            img.onload = function () {
                const w = img.naturalWidth, h = img.naturalHeight;
                const p = PRESETS[w + "x" + h];

                if (p) {
                    PHOTO = { w: w, h: h, cx: p.cx, cy: p.cy, radius: p.radius };
                } else {
                    // Unknown size: assume the Earth is centred (best guess)
                    console.warn("[RescueAI] Unknown background size " + w + "x" + h +
                        ". Add it to PRESETS in earth.js (Earth centre + radius in pixels).");
                    PHOTO = { w: w, h: h, cx: w * 0.5, cy: h * 0.5, radius: h * 0.34 };
                }
                resolve();
            };
            img.onerror = function () { resolve(); };
            img.src = m[1];
        });
    }


    // ---------- start once all textures are ready ----------

    Promise.all([
        detectPhoto(),
        loadTexture(TEX_DAY, 0, "uDay"),
        loadTexture(TEX_NIGHT, 1, "uNight"),
        loadTexture(TEX_CLOUDS, 2, "uClouds")
    ]).then(function () {
        layout();
        render(performance.now());
        canvas.style.display = "block";
        if (!reduceMotion) requestAnimationFrame(loop);
    }).catch(function (err) {
        console.warn("[RescueAI] Rotating Earth disabled:", err.message);
        canvas.remove();                                 // photo's Earth stays visible
    });

})();