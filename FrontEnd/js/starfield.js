// =====================================
// RescueAI Deep Space
// A realistic night sky drawn on canvas:
// thousands of stars, a Milky Way band with
// dust lanes, colourful nebulae, distant
// galaxies, twinkling stars and shooting stars.
// =====================================

(function () {

    const canvas = document.createElement("canvas");
    canvas.className = "starfield";
    canvas.setAttribute("aria-hidden", "true");

    const universe = document.querySelector(".universe");
    document.body.insertBefore(canvas, universe ? universe.nextSibling : document.body.firstChild);
    document.querySelectorAll(".stars").forEach(el => (el.style.display = "none"));

    const ctx = canvas.getContext("2d");
    const sky = document.createElement("canvas");      // pre-rendered static sky
    const sctx = sky.getContext("2d");

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Star colours by temperature
    const COLORS = [
        [155, 176, 255], [190, 205, 255], [255, 255, 255], [255, 255, 255],
        [255, 244, 225], [255, 226, 170], [255, 195, 140], [255, 160, 120]
    ];

    const PHOTO_MODE = true;                  // true = use the background photo
    const BAND_ANGLE = -0.42;                 // Milky Way tilt (radians)

    let width = 0, height = 0, dpr = 1;
    let stars = [];
    let shooting = null;
    let band;                                 // band geometry


    // ---------- helpers ----------

    const rand = (a, b) => a + Math.random() * (b - a);
    const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];

    function setupBand() {
        const ux = Math.cos(BAND_ANGLE), uy = Math.sin(BAND_ANGLE);
        band = {
            cx: width * 0.5,
            cy: height * 0.48,
            ux, uy,
            nx: -uy, ny: ux,
            len: Math.hypot(width, height),
            w: Math.min(width, height) * 0.2
        };
    }

    // Random point along the Milky Way band
    function bandPoint(spread) {
        const t = rand(-band.len / 2, band.len / 2);
        const o = gauss() * band.w * spread;
        return {
            x: band.cx + band.ux * t + band.nx * o,
            y: band.cy + band.uy * t + band.ny * o,
            t, o
        };
    }

    function softBlob(c, x, y, rx, ry, rot, stops) {
        c.save();
        c.translate(x, y);
        c.rotate(rot);
        c.scale(rx, ry);
        const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
        stops.forEach(s => g.addColorStop(s[0], s[1]));
        c.fillStyle = g;
        c.fillRect(-1, -1, 2, 2);
        c.restore();
    }


    // ---------- static sky (drawn once) ----------

    function paintSky() {
        sky.width = width * dpr;
        sky.height = height * dpr;
        sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (PHOTO_MODE) return;               // photo provides the sky

        // Deep space base
        const base = sctx.createLinearGradient(0, 0, 0, height);
        base.addColorStop(0, "#000207");
        base.addColorStop(0.6, "#02061a");
        base.addColorStop(1, "#050a22");
        sctx.fillStyle = base;
        sctx.fillRect(0, 0, width, height);

        const area = width * height;
        const small = Math.min(width, height);

        // --- Nebulae (additive colour clouds)
        sctx.globalCompositeOperation = "lighter";
        const nebulae = [
            [60, 90, 230], [170, 60, 210], [40, 160, 200], [220, 90, 120], [90, 70, 220]
        ];
        for (let i = 0; i < 7; i++) {
            const c = pick(nebulae);
            const a = rand(0.05, 0.11);
            softBlob(sctx, rand(0, width), rand(0, height),
                rand(0.18, 0.38) * small * 1.6, rand(0.1, 0.24) * small,
                rand(0, Math.PI),
                [[0, `rgba(${c},${a})`], [0.5, `rgba(${c},${a * 0.4})`], [1, `rgba(${c},0)`]]);
        }

        // --- Milky Way glow: warm bright core, bluish edges, uneven like the real thing
        const phase = Math.random() * 10;
        for (let i = 0; i < 260; i++) {
            const p = bandPoint(0.55);
            const patchy = 0.45 + 0.55 * Math.abs(Math.sin(p.t * 0.0035 + phase));
            const core = Math.exp(-Math.pow(p.o / (band.w * 0.5), 2));
            const col = core > 0.55 ? [255, 228, 195] : [140, 165, 255];
            const a = (0.018 + core * 0.04) * patchy;
            const r = rand(0.06, 0.2) * small;
            softBlob(sctx, p.x, p.y, r * rand(1, 1.8), r, BAND_ANGLE + rand(-0.3, 0.3),
                [[0, `rgba(${col},${a})`], [1, `rgba(${col},0)`]]);
        }
        sctx.globalCompositeOperation = "source-over";

        // --- Dark dust lanes cutting through the band
        for (let i = 0; i < 90; i++) {
            const p = bandPoint(0.22);
            const rx = rand(60, 240), ry = rand(8, 34);
            softBlob(sctx, p.x, p.y, rx, ry, BAND_ANGLE + rand(-0.25, 0.25),
                [[0, "rgba(1,3,10,0.22)"], [1, "rgba(1,3,10,0)"]]);
        }

        // --- Distant galaxies
        sctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 9; i++) {
            const x = rand(0, width), y = rand(0, height);
            const r = rand(8, 24);
            const rot = rand(0, Math.PI);
            const tint = pick([[255, 235, 200], [190, 210, 255], [255, 210, 220]]);
            softBlob(sctx, x, y, r * 2.2, r * rand(0.35, 0.7), rot,
                [[0, `rgba(${tint},0.35)`], [0.4, `rgba(${tint},0.12)`], [1, `rgba(${tint},0)`]]);
            softBlob(sctx, x, y, r * 0.5, r * 0.3, rot,
                [[0, "rgba(255,255,255,0.7)"], [1, "rgba(255,255,255,0)"]]);
        }
        sctx.globalCompositeOperation = "source-over";

        // --- Thousands of faint stars: uniform field + dense band
        function dust(count, inBand) {
            for (let i = 0; i < count; i++) {
                let x, y;
                if (inBand) {
                    const p = bandPoint(0.65);
                    x = p.x; y = p.y;
                } else {
                    x = rand(0, width); y = rand(0, height);
                }
                const c = pick(COLORS);
                const s = rand(0.35, 1.05);
                sctx.fillStyle = `rgba(${c},${rand(0.18, 0.85)})`;
                sctx.fillRect(x, y, s, s);
            }
        }
        dust(Math.round(area / 900), false);
        dust(Math.round(area / 380), true);

        // --- Medium static stars with a hint of glow
        for (let i = 0; i < area / 7000; i++) {
            const c = pick(COLORS);
            const r = rand(0.6, 1.15);
            const x = rand(0, width), y = rand(0, height);
            sctx.fillStyle = `rgba(${c},${rand(0.55, 0.95)})`;
            sctx.beginPath();
            sctx.arc(x, y, r, 0, Math.PI * 2);
            sctx.fill();
        }
    }


    // ---------- twinkling stars (animated) ----------

    function buildStars() {
        const count = PHOTO_MODE
            ? Math.round((width * height) / 9000)
            : Math.min(1100, Math.round((width * height) / 2400));
        stars = [];

        for (let i = 0; i < count; i++) {
            const roll = Math.random();
            let r;
            if (roll < 0.62)      r = rand(0.4, 0.8);
            else if (roll < 0.9)  r = rand(0.8, 1.3);
            else if (roll < 0.985) r = rand(1.3, 2.1);
            else                  r = rand(2.1, 3.1);

            const pos = (!PHOTO_MODE && Math.random() < 0.5)
                ? bandPoint(0.7)
                : { x: rand(0, width), y: rand(0, height) };

            stars.push({
                x: pos.x, y: pos.y, r,
                color: pick(COLORS),
                base: rand(0.4, 0.9),
                speed: rand(0.5, 2.8),
                phase: rand(0, Math.PI * 2)
            });
        }
    }

    function drawStar(s, time) {
        const wave = Math.sin(time * 0.001 * s.speed + s.phase);
        const flick = Math.sin(time * 0.0041 * s.speed + s.phase * 3) * 0.15;
        const alpha = Math.max(0.06, Math.min(1, s.base + wave * 0.38 + flick));
        const [r, g, b] = s.color;

        if (s.r > 1.2) {
            const glow = s.r * 5;
            const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, glow);
            grad.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.55})`);
            grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(s.x, s.y, glow, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();

        if (s.r > 2.1) {
            const len = s.r * 7 * (0.7 + wave * 0.3);
            ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.5})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(s.x - len, s.y); ctx.lineTo(s.x + len, s.y);
            ctx.moveTo(s.x, s.y - len); ctx.lineTo(s.x, s.y + len);
            ctx.stroke();
        }
    }


    // ---------- shooting stars ----------

    function maybeShoot() {
        if (shooting || reduceMotion) return;
        if (Math.random() < 0.0015) {
            const a = Math.PI * rand(0.16, 0.33);
            shooting = {
                x: rand(0, width * 0.8), y: rand(0, height * 0.4),
                vx: Math.cos(a) * 12, vy: Math.sin(a) * 12,
                life: 0, max: 55
            };
        }
    }

    function drawShooting() {
        if (!shooting) return;
        shooting.x += shooting.vx;
        shooting.y += shooting.vy;
        shooting.life++;

        const fade = 1 - shooting.life / shooting.max;
        const tx = shooting.x - shooting.vx * 7;
        const ty = shooting.y - shooting.vy * 7;
        const g = ctx.createLinearGradient(shooting.x, shooting.y, tx, ty);
        g.addColorStop(0, `rgba(255,255,255,${fade})`);
        g.addColorStop(1, "rgba(120,180,255,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.moveTo(shooting.x, shooting.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();

        if (shooting.life >= shooting.max) shooting = null;
    }


    // ---------- render loop ----------

    function draw(time) {
        ctx.clearRect(0, 0, width, height);
        if (!PHOTO_MODE) ctx.drawImage(sky, 0, 0, width, height);
        for (const s of stars) drawStar(s, time);
        maybeShoot();
        drawShooting();
    }

    let running = true;
    function loop(time) {
        if (!running) return;
        draw(time);
        requestAnimationFrame(loop);
    }

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth;
        height = window.innerHeight;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = width + "px";
        canvas.style.height = height + "px";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        setupBand();
        paintSky();
        buildStars();
        draw(performance.now());
    }

    document.addEventListener("visibilitychange", function () {
        running = !document.hidden;
        if (running && !reduceMotion) requestAnimationFrame(loop);
    });

    let timer;
    window.addEventListener("resize", function () {
        clearTimeout(timer);
        timer = setTimeout(resize, 200);
    });

    resize();
    if (!reduceMotion) requestAnimationFrame(loop);

})();