// Il corpo dell'utente sopra l'immagine della webcam: non una silhouette
// uniforme, ma un arto luminoso per ogni segmento, colorato come la retta a
// cui appartiene. Cosi' si vede a occhio nudo quale parte del corpo sta
// generando quale nota.
//
// Quando una retta si aggancia, i suoi segmenti emettono il "riverbero
// visivo": anelli di luce che si allargano dall'arto e si spengono, uno
// dietro l'altro, con lo stesso passo con cui la nota guadagna armonici.

import * as THREE from 'three';

const VERT = /* glsl */`
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const FRAG = /* glsl */`
    precision mediump float;
    varying vec2 vUv;
    uniform vec3  uColor;
    uniform float uTime;
    uniform float uScore;    // 0..1 correttezza della retta
    uniform float uLock;     // 0..1 rampa di "agganciato"
    uniform float uTotal;    // lunghezza del quad in unita' di larghezza
    uniform float uHalf;     // meta' della lunghezza dell'asse della capsula
    uniform float uThick;    // raggio del nucleo

    void main() {
        // distanza dall'asse del segmento (capsula), in unita' di larghezza
        vec2 p = (vUv - 0.5) * vec2(uTotal, 1.0);
        float h = clamp(p.x, -uHalf, uHalf);
        float d = length(p - vec2(h, 0.0));

        // arto: nucleo pieno + alone
        float core = smoothstep(uThick, uThick * 0.45, d);
        float halo = exp(-(d * d) / (uThick * uThick * 3.2)) * 0.45;

        // riverbero visivo: tre onde che partono dall'arto sfalsate nel tempo
        float rev = 0.0;
        for (int k = 0; k < 3; k++) {
            float phase = fract(uTime * 0.55 - float(k) * 0.333);
            float r = uThick + phase * (0.5 - uThick);
            rev += exp(-pow((d - r) / 0.035, 2.0)) * (1.0 - phase);
        }
        rev *= uLock * 0.55;

        float a = core * (0.45 + uScore * 0.55) + halo * (0.4 + uScore * 0.6) + rev;
        vec3 col = mix(vec3(1.0), uColor, 0.55 + uScore * 0.4);
        gl_FragColor = vec4(col * a, a);
    }
`;

class GlowSegment {
    constructor(color) {
        this.material = new THREE.ShaderMaterial({
            vertexShader: VERT,
            fragmentShader: FRAG,
            uniforms: {
                uColor: { value: new THREE.Color(color) },
                uTime: { value: 0 },
                uScore: { value: 0 },
                uLock: { value: 0 },
                uTotal: { value: 4 },
                uHalf: { value: 1.5 },
                uThick: { value: 0.12 }
            },
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false
        });
        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
        this.mesh.renderOrder = 3;
    }

    place(a, b, thickness, score, lock, time) {
        if (!a || !b) { this.mesh.visible = false; return; }
        const dx = b.x - a.x, dy = -(b.y - a.y);   // mondo con y verso l'alto
        const len = Math.hypot(dx, dy);
        if (len < 1e-5) { this.mesh.visible = false; return; }
        this.mesh.visible = true;

        // il quad e' piu' lungo del segmento per contenere alone e riverbero
        const width = thickness * 5.0;
        const quadLen = len + width;

        this.mesh.position.set((a.x + b.x) / 2, 1 - (a.y + b.y) / 2, 0.05);
        this.mesh.rotation.z = Math.atan2(dy, dx);
        this.mesh.scale.set(quadLen, width, 1);

        const u = this.material.uniforms;
        u.uTotal.value = quadLen / width;
        u.uHalf.value = (len / width) / 2;
        u.uThick.value = thickness / width;
        u.uScore.value = score;
        u.uLock.value = lock;
        u.uTime.value = time;
    }

    dispose() {
        this.mesh.geometry.dispose();
        this.material.dispose();
    }
}

export class GlowBody {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        scene.add(this.group);
        this.rays = [];      // [{ def, segments: [GlowSegment], lock }]
        this.neutral = [];   // segmenti strutturali (spalle, bacino), sempre bianchi
        for (let i = 0; i < 4; i++) {
            const s = new GlowSegment('#ffffff');
            s.material.uniforms.uScore.value = 0.15;
            this.neutral.push(s);
            this.group.add(s.mesh);
        }
        this.head = new GlowSegment('#ffffff');
        this.group.add(this.head.mesh);
    }

    setRays(rayDefs) {
        for (const r of this.rays) {
            for (const s of r.segments) { this.group.remove(s.mesh); s.dispose(); }
        }
        this.rays = rayDefs.map(def => {
            const segments = def.segs.map(() => {
                const s = new GlowSegment(def.color);
                this.group.add(s.mesh);
                return s;
            });
            return { def, segments, lock: 0 };
        });
    }

    /**
     * @param {object} uPts   punti dell'utente in spazio isotropo (o null)
     * @param {Array}  scores punteggi per retta
     * @param {Array}  active stato acceso/spento per retta
     */
    update(uPts, scores, active, time, dt) {
        if (!uPts) { this.group.visible = false; return; }
        this.group.visible = true;

        // tutto e' proporzionato al busto: cosi' lo spessore degli arti resta
        // giusto sia se l'utente e' vicino sia se e' lontano
        const torso = (uPts.shoulderMid && uPts.hipMid)
            ? Math.hypot(uPts.shoulderMid.x - uPts.hipMid.x, uPts.shoulderMid.y - uPts.hipMid.y)
            : 0.2;
        const limb = Math.max(0.012, torso * 0.17);

        const NEUTRAL = [
            ['lShoulder', 'rShoulder'], ['lHip', 'rHip'],
            ['shoulderMid', 'hipMid'], ['lShoulder', 'lHip']
        ];
        NEUTRAL.forEach(([a, b], i) => {
            const w = (a === 'shoulderMid') ? limb * 1.5 : limb * 0.8;
            this.neutral[i].place(uPts[a], uPts[b], w, 0.2, 0, time);
        });

        // testa: un segmento cortissimo fa una sfera luminosa
        if (uPts.nose && uPts.shoulderMid) {
            const n = uPts.nose;
            this.head.place(n, { x: n.x + 1e-4, y: n.y }, torso * 0.28, 0.3, 0, time);
        } else {
            this.head.mesh.visible = false;
        }

        for (let i = 0; i < this.rays.length; i++) {
            const r = this.rays[i];
            const score = scores[i] || 0;
            const target = active[i] ? 1 : 0;
            r.lock += (target - r.lock) * Math.min(1, dt * 3);
            for (let s = 0; s < r.def.segs.length; s++) {
                const [a, b] = r.def.segs[s];
                // i tratti che attraversano il corpo (spalla-spalla, anca-anca)
                // esistono solo per chiudere la catena della retta: qui non
                // vanno disegnati come arti
                const crossBody = (a[0] === 'l' && b[0] === 'r') || (a[0] === 'r' && b[0] === 'l');
                if (crossBody) { r.segments[s].mesh.visible = false; continue; }
                r.segments[s].place(uPts[a], uPts[b], limb, score, r.lock, time);
            }
        }
    }

    set visible(v) { this.group.visible = v; }
    get visible() { return this.group.visible; }
}
