// La scena 3D e il suo aggancio all'immagine della webcam.
//
// Tutto il resto dell'app ragiona in "spazio isotropo": x = (1 - nx) * aspect,
// y = ny, cioe' i landmark MediaPipe specchiati per l'effetto selfie e
// corretti per l'aspect, cosi' gli angoli fra i segmenti sono angoli veri.
// Qui quello spazio diventa mondo three.js con una camera ortografica.
//
// Il canvas riempie sempre lo schermo, e il fotogramma della webcam sta in
// scena come un quad alto 1 e largo `aspect`. Quanto se ne vede lo decidono
// zoom e messa a fuoco:
//
//   zoom = 1   il riquadro contiene tutto il fotogramma (bande dove non
//              arriva, invece di tagliarlo come faceva il vecchio "cover":
//              se il corpo non ci sta, e' meglio vederlo tutto piccolo che
//              vederne meta');
//   zoom > 1   si ingrandisce attorno al punto di messa a fuoco, che l'app
//              tiene sul corpo dell'utente. E' quello che permette di
//              starsene lontani dalla webcam e vedersi comunque grandi.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Oltre questo ingrandimento l'immagine della webcam diventa poltiglia: il
// fotogramma ha i pixel che ha, lo zoom e' digitale.
export const MAX_ZOOM = 3.2;

// Il bagliore non e' una decorazione sempre accesa: e' il premio
// dell'accordo. Con una nota sola si intuisce appena, cresce via via che
// le altre rette si agganciano, ed e' pieno quando l'accordo e' completo.
// La curva e' piu' che lineare apposta: a meta' delle note il bagliore
// deve essere ancora chiaramente parziale, non meta' strada.
const GLOW_MIN = 0.10;
const GLOW_MAX = 1.1;
const GLOW_CURVE = 1.5;
const GLOW_SMOOTH_S = 0.30;

export class Stage {
    constructor(container, video) {
        this.container = container;
        this.video = video;
        this.viewport = { vw: 4, vh: 3, aspect: 4 / 3, width: 1, height: 1 };
        this.baseW = 4 / 3;
        this.baseH = 1;
        this.zoom = 1;
        this.focus = { x: 2 / 3, y: 0.5 };   // in spazio isotropo

        this.scene = new THREE.Scene();

        this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -20, 20);
        this.camera.position.set(0, 0, 10);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setClearColor(0x05060b, 1);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(this.renderer.domElement);
        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.left = '0';
        this.renderer.domElement.style.zIndex = '2';

        this._buildBackground();

        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), GLOW_MAX, 0.7, 0.18);
        this.glow = 1;          // 0..1 smussato, vedi setGlow()
        this.composer.addPass(this.bloom);

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
        const key = new THREE.DirectionalLight(0xffffff, 0.8);
        key.position.set(1, 2, 3);
        this.scene.add(key);
        const rim = new THREE.DirectionalLight(0x88aaff, 0.5);
        rim.position.set(-2, 1, -2);
        this.scene.add(rim);
    }

    /**
     * La webcam entra nella scena come quad di fondo invece di restare un
     * <video> dietro al canvas: cosi' il bloom compone i raggi sopra
     * l'immagine reale, e non c'e' da sperare che la passata di
     * post-produzione preservi la trasparenza.
     *
     * Il quad copre sempre l'intero fotogramma (0..aspect x 0..1 in spazio
     * isotropo): e' il frustum della camera, gia' calcolato in resize(), a
     * ritagliarlo quando lo schermo e' verticale.
     */
    _buildBackground() {
        const tex = new THREE.VideoTexture(this.video);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        // effetto selfie: si specchia la texture, non il quad, cosi' la
        // geometria resta orientata come il resto della scena
        tex.wrapS = THREE.RepeatWrapping;
        tex.repeat.x = -1;
        tex.offset.x = 1;
        this.videoTexture = tex;

        // il grigio scuro fa da velo: la webcam resta leggibile ma non ruba
        // luce ai raggi
        this.bgMaterial = new THREE.MeshBasicMaterial({
            map: tex,
            color: new THREE.Color(0.42, 0.42, 0.5),
            depthTest: false,
            depthWrite: false,
            toneMapped: false
        });
        this.bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.bgMaterial);
        this.bgMesh.renderOrder = -1;
        this.scene.add(this.bgMesh);
    }

    /** Ridimensiona canvas e frustum sulle dimensioni correnti di schermo e video. */
    /**
     * Quanta parte dell'accordo suona, 0..1: e' questo a decidere il glow.
     * @param {number} frazione  note accese / note dell'accordo
     * @param {number} dt        secondi dall'ultimo fotogramma
     */
    setGlow(frazione, dt) {
        const target = Math.max(0, Math.min(1, frazione || 0));
        const k = 1 - Math.exp(-(dt || 0.016) / GLOW_SMOOTH_S);
        this.glow += (target - this.glow) * k;
        this.bloom.strength = GLOW_MIN + (GLOW_MAX - GLOW_MIN) * Math.pow(this.glow, GLOW_CURVE);
    }

    resize() {
        const vw = (this.video && this.video.videoWidth) || 4;
        const vh = (this.video && this.video.videoHeight) || 3;
        const aspect = vw / vh;

        const w = window.innerWidth;
        const h = window.innerHeight;

        this.container.style.width = w + 'px';
        this.container.style.height = h + 'px';
        this.renderer.setSize(w, h, false);
        this.composer.setSize(w, h);
        this.bloom.setSize(w, h);

        this.viewport = { vw, vh, aspect, width: w, height: h };
        const screenAspect = w / h;

        // riquadro a zoom 1: il piu' piccolo, con le proporzioni dello
        // schermo, che contiene tutto il fotogramma
        if (screenAspect > aspect) {
            this.baseH = 1;
            this.baseW = screenAspect;
        } else {
            this.baseW = aspect;
            this.baseH = aspect / screenAspect;
        }

        this.bgMesh.scale.set(aspect, 1, 1);
        this.bgMesh.position.set(aspect / 2, 0.5, -5);

        this._applyView();
        return this.viewport;
    }

    /**
     * @param {number} zoom   1 = tutto il fotogramma
     * @param {number} focusX punto da tenere al centro, in spazio isotropo
     * @param {number} focusY idem (y verso il basso, come i landmark)
     */
    setView(zoom, focusX, focusY) {
        this.zoom = Math.max(1, Math.min(MAX_ZOOM, zoom));
        if (focusX !== undefined) this.focus.x = focusX;
        if (focusY !== undefined) this.focus.y = focusY;
        this._applyView();
    }

    _applyView() {
        const halfW = this.baseW / (2 * this.zoom);
        const halfH = this.baseH / (2 * this.zoom);
        const a = this.viewport.aspect;

        // ingrandendo, il riquadro non deve uscire dal fotogramma: si
        // vedrebbe il vuoto invece dell'immagine
        let cx = this.focus.x;
        let cy = 1 - this.focus.y;          // il mondo ha la y verso l'alto
        cx = (halfW * 2 <= a) ? Math.min(Math.max(cx, halfW), a - halfW) : a / 2;
        cy = (halfH * 2 <= 1) ? Math.min(Math.max(cy, halfH), 1 - halfH) : 0.5;

        this.camera.left = cx - halfW;
        this.camera.right = cx + halfW;
        this.camera.bottom = cy - halfH;
        this.camera.top = cy + halfH;
        this.camera.updateProjectionMatrix();
    }

    /** Riquadro visibile adesso, in coordinate mondo. */
    get viewBox() {
        const c = this.camera;
        return {
            cx: (c.left + c.right) / 2,
            cy: (c.bottom + c.top) / 2,
            w: c.right - c.left,
            h: c.top - c.bottom
        };
    }

    /** Punto dello spazio isotropo -> punto del mondo three.js. */
    toWorld(p, z = 0, out) {
        const v = out || new THREE.Vector3();
        return v.set(p.x, 1 - p.y, z);
    }

    /** Quanto vale, in unita' di mondo, un pixel dello schermo. */
    get unitsPerPixel() {
        const h = this.viewport.height || 1;
        return (this.camera.top - this.camera.bottom) / h;
    }

    render() {
        this.composer.render();
    }
}
