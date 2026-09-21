// I raggi cosmici: le rette dell'asana rese come fasci di luce che
// attraversano tutto lo schermo, non come semplici segmenti fra due giunti.
// Il corpo non li "disegna", ci si adagia sopra.
//
// Ogni raggio e' un quad orientato lungo la retta, con uno shader additivo:
// un nucleo stretto e brillante, un alone largo e morbido, e una corrente di
// energia che scorre lungo il fascio. Il punteggio della retta pilota
// larghezza, luminosita' e velocita' della corrente, cosi' il raggio "si
// accorda" mentre la posizione si avvicina a quella giusta.

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
    uniform float uScore;     // 0..1 quanto la retta e' corretta
    uniform float uLock;      // 0..1 rampa di "agganciato"
    uniform float uAspect;    // lunghezza / larghezza del quad

    void main() {
        // distanza dal centro del fascio, 0 sull'asse, 1 sul bordo
        float d = abs(vUv.y - 0.5) * 2.0;

        // nucleo che si stringe e si accende man mano che la posa e' giusta
        float coreW = mix(0.42, 0.13, uScore);
        float core  = exp(-(d * d) / (coreW * coreW));
        float halo  = exp(-(d * d) / 0.55) * 0.35;

        // corrente di energia lungo il raggio: ferma e rada quando la posa e'
        // approssimativa, veloce e fitta quando si aggancia
        float speed = 0.18 + uScore * 0.9;
        float flow  = sin((vUv.x * uAspect * 0.9) - uTime * speed * 6.0);
        flow = pow(max(flow, 0.0), 6.0) * (0.12 + uScore * 0.5);

        // le estremita' sfumano, il raggio non ha inizio ne' fine netti
        float ends = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x);

        // pulsazione lenta quando il raggio e' agganciato
        float pulse = 1.0 + uLock * 0.22 * sin(uTime * 3.4);

        float a = (core * (0.30 + uScore * 0.85) + halo + flow * core) * ends * pulse;
        vec3 col = mix(uColor * 0.65, mix(uColor, vec3(1.0), 0.45), uScore);
        gl_FragColor = vec4(col * a, a);
    }
`;

class CosmicRay {
    constructor(def) {
        this.def = def;
        this.material = new THREE.ShaderMaterial({
            vertexShader: VERT,
            fragmentShader: FRAG,
            uniforms: {
                uColor: { value: new THREE.Color(def.color) },
                uTime: { value: 0 },
                uScore: { value: 0 },
                uLock: { value: 0 },
                uAspect: { value: 20 }
            },
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false
        });
        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
        this.mesh.renderOrder = 1;
        this.lock = 0;
    }

    /**
     * @param {object} fit   retta bersaglio gia' portata sul corpo dell'utente
     *                       ({cx, cy, dirx, diry} in spazio isotropo)
     * @param {number} score 0..1
     * @param {boolean} active
     * @param {object} bounds estensione del mondo visibile, per far uscire il
     *                        raggio dallo schermo da entrambi i lati
     */
    update(fit, score, active, bounds, time, dt) {
        if (!fit) { this.mesh.visible = false; return; }
        this.mesh.visible = true;

        // lunghezza: abbastanza da attraversare il riquadro in diagonale,
        // qualunque sia l'inclinazione
        const span = Math.hypot(bounds.width, bounds.height) * 1.25;
        const width = bounds.height * (0.035 + score * 0.045);

        this.mesh.position.set(fit.cx, 1 - fit.cy, -0.35);
        this.mesh.rotation.z = Math.atan2(-fit.diry, fit.dirx);
        this.mesh.scale.set(span, width, 1);

        const target = active ? 1 : 0;
        this.lock += (target - this.lock) * Math.min(1, dt * 3);

        this.material.uniforms.uTime.value = time;
        this.material.uniforms.uScore.value = score;
        this.material.uniforms.uLock.value = this.lock;
        this.material.uniforms.uAspect.value = span / Math.max(1e-4, width);
    }

    dispose() {
        this.mesh.geometry.dispose();
        this.material.dispose();
    }
}

export class RaysView {
    constructor(scene) {
        this.scene = scene;
        this.rays = [];
        this.group = new THREE.Group();
        scene.add(this.group);
    }

    /** Ricostruisce i raggi quando cambia asana (il numero di rette cambia). */
    setRays(rayDefs) {
        for (const r of this.rays) { this.group.remove(r.mesh); r.dispose(); }
        this.rays = rayDefs.map(def => {
            const ray = new CosmicRay(def);
            this.group.add(ray.mesh);
            return ray;
        });
    }

    /**
     * @param {Array} fits   una retta bersaglio per raggio, gia' ancorata
     * @param {Array} scores punteggi smussati
     * @param {Array} active stato acceso/spento
     */
    update(fits, scores, active, bounds, time, dt) {
        for (let i = 0; i < this.rays.length; i++) {
            this.rays[i].update(fits[i], scores[i] || 0, !!active[i], bounds, time, dt);
        }
    }

    set visible(v) { this.group.visible = v; }
    get visible() { return this.group.visible; }
}
