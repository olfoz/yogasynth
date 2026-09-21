// L'avatar guida: il modello rigged della cartella yoga (nathan.fbx) portato
// dentro lo spazio della webcam.
//
// L'asana e' dato in 2D (i landmark del file dati). Qui diventa posa 3D sul
// rig preparato da ikSetup.js.
//
// La posa si costruisce in cinematica DIRETTA, non con un solver IK, e vale
// la pena dire perche'. L'IK serve quando si conosce solo il punto d'arrivo
// e bisogna indovinare le articolazioni in mezzo. Qui non e' il caso: i dati
// dell'asana danno ogni giunto, gomiti e ginocchia comprese. Quindi ogni
// osso si punta direttamente dove l'asana lo vuole.
//
// Provato in entrambi i modi sugli asana del saluto al sole (il banco di
// prova e' tools/banco-avatar.html), col solver CCD di ikSetup l'errore su
// mani e gomiti restava fra il 5% e il 12% dell'altezza del corpo: il gomito
// puo' ruotare solo attorno all'asse fissato in ikSetup e nelle pose molto
// piegate non ci arriva, mentre la spina su un piegamento di quasi 180 gradi
// come quello di Uttanasana si ferma prima e si porta dietro le spalle.
// Puntando gli ossi l'errore scende sotto lo 0,6%. Conta, perche' proprio in
// Uttanasana e Chaturanga braccio e avambraccio sono DUE rette distinte,
// cioe' due note diverse, e devono vedersi separate.
//
// Di ikSetup.js resta l'uso per cui e' insostituibile: e' il modulo della
// cartella yoga che conosce i nomi degli ossi di nathan.fbx, trova la
// SkinnedMesh e verifica che il rig abbia davvero tutte le catene.
//
// Il punto delicato e' il profilo. Nel Saluto al Sole il corpo e' di taglio:
// i dati 2D descrivono la linea mediana del corpo, non due lati distinti.
// Se si spingessero i bersagli sinistro e destro a due x diverse sullo stesso
// piano, l'avatar si torcerebbe. Percio' in profilo i bersagli prendono la
// posizione mediana dai dati e riprendono dal modello stesso la propria
// distanza laterale a riposo: il corpo resta largo quanto e', e ruota tutto
// verso la telecamera come nelle tavole del saluto al sole.

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { setupIK } from '../vendor/ikSetup.js';

const UP = new THREE.Vector3(0, 1, 0);

// Nomi dei versori usati dalla minianimazione iniziale, per catena.
const DIRECTION_KEYS = {
    leftArm: ['upperArmL', 'foreArmL'],
    rightArm: ['upperArmR', 'foreArmR'],
    leftLeg: ['thighL', 'shinL'],
    rightLeg: ['thighR', 'shinR']
};

// Catene degli arti, guidate in cinematica diretta.
// `root`/`mid`/`tip` sono gli ossi, `joints` i landmark a cui puntarli.
const LIMBS = {
    leftArm:  { bones: ['upperarm_l', 'lowerarm_l', 'hand_l'], joints: ['lElbow', 'lWrist'] },
    rightArm: { bones: ['upperarm_r', 'lowerarm_r', 'hand_r'], joints: ['rElbow', 'rWrist'] },
    leftLeg:  { bones: ['upperleg_l', 'lowerleg_l', 'foot_l'], joints: ['lKnee', 'lAnkle'] },
    rightLeg: { bones: ['upperleg_r', 'lowerleg_r', 'foot_r'], joints: ['rKnee', 'rAnkle'] }
};

// Quanto ogni catena sta fuori dalla linea mediana, in profilo.
//
// NON si prende dalla posizione a riposo dell'estremita': il modello e' in
// T-pose, quindi la mano a riposo sta larga quanto tutto il braccio disteso.
// Forzare li' il bersaglio spalancherebbe le braccia di lato. La larghezza
// giusta e' quella della RADICE della catena — spalla per le braccia, anca
// per le gambe — perche' in profilo ogni arto lavora nel piano sagittale
// della propria radice.
const LATERAL_ROOT = {
    leftArm: 'upperarm_l', rightArm: 'upperarm_r',
    leftLeg: 'upperleg_l', rightLeg: 'upperleg_r',
    head: null   // la testa sta sulla linea mediana
};

export class GuideAvatar {
    constructor(scene) {
        this.scene = scene;
        this.rig = new THREE.Group();
        this.rig.visible = false;
        scene.add(this.rig);

        this.model = null;
        this.skinnedMesh = null;
        this.ikTargets = {};     // solo per sapere quali catene ikSetup ha trovato
        this.limbs = {};         // ossi degli arti, puntati a mano
        this.ready = false;
        this.failed = false;

        this.forward = new THREE.Vector3(0, 0, 1);   // in spazio rig
        this.lateral = new THREE.Vector3(1, 0, 0);
        this.restLateral = {};      // catena -> distanza laterale a riposo
        this.restTorso = 1;         // anca -> spalle, sulla mediana
        this.restHead = 1;          // spalle -> osso della testa
        this.restStanding = 1;      // caviglie -> testa, in piedi
        this.hipBone = null;

        // scratch riusati a ogni frame: posare l'avatar non deve allocare
        this._v = new THREE.Vector3();
        this._w = new THREE.Vector3();
        this._a = new THREE.Vector3();
        this._b = new THREE.Vector3();
        this._c = new THREE.Vector3();
        this._d = new THREE.Vector3();
        this._e = new THREE.Vector3();
        this._f = new THREE.Vector3();
        this._q1 = new THREE.Quaternion();
        this._q2 = new THREE.Quaternion();
        this._q3 = new THREE.Quaternion();
    }

    async load(url, onProgress) {
        const loader = new FBXLoader();
        const object = await new Promise((resolve, reject) => {
            loader.load(url, resolve, onProgress, reject);
        });

        this.model = object;
        this.model.position.set(0, 0, 0);
        this.model.scale.setScalar(1);
        this.rig.add(this.model);

        this.model.traverse(child => {
            if (child.isMesh) this._makeGhostMaterial(child);
        });

        // ikSetup crea le sfere bersaglio nella scena: servono le catene IK,
        // non i controlli interattivi, quindi le sfere restano invisibili
        const intermediateBones = { spines: [] };
        const intermediateOffsets = {
            leftWrist: new THREE.Vector3(), rightWrist: new THREE.Vector3(),
            leftAnkle: new THREE.Vector3(), rightAnkle: new THREE.Vector3()
        };
        const intermediateLengths = {};

        this.rig.updateMatrixWorld(true);
        const result = setupIK(
            this.model, this.scene, null, null,
            this.ikTargets, intermediateBones, intermediateOffsets, intermediateLengths
        );

        this.skinnedMesh = result.skinnedMesh;
        if (!this.skinnedMesh || !result.iks || !result.iks.length) {
            this.failed = true;
            throw new Error('Scheletro o catene IK non trovati in ' + url);
        }
        // le sfere di controllo di ikSetup servono a trascinare l'avatar col
        // mouse: qui la posa viene dai dati, quindi restano invisibili
        for (const key in this.ikTargets) {
            const sphere = this.ikTargets[key];
            if (sphere) sphere.visible = false;
        }

        this._measureRestPose();
        this.ready = true;
        return this;
    }

    /** Materiale "guida": corpo di luce semitrasparente, non un personaggio solido. */
    _makeGhostMaterial(mesh) {
        const src = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const made = src.map(m => new THREE.MeshStandardMaterial({
            color: new THREE.Color(0x9fb8ff),
            emissive: new THREE.Color(0x3a5bd9),
            emissiveIntensity: 0.9,
            metalness: 0.1,
            roughness: 0.6,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
            map: m && m.map ? m.map : null
        }));
        mesh.material = Array.isArray(mesh.material) ? made : made[0];
        mesh.renderOrder = 2;
        mesh.frustumCulled = false;
    }

    /**
     * Misura il modello a riposo: da dove guarda, quanto e' alto, quanto sono
     * larghe le sue estremita'. Serve a posarlo senza numeri magici.
     */
    _measureRestPose() {
        const bones = this.skinnedMesh.skeleton.bones;
        const find = patterns => bones.find(b => {
            const n = b.name.toLowerCase();
            return patterns.some(p => n.includes(p));
        });

        this.hipBone = find(['_hip', 'hips', 'pelvis']) || bones[0];
        const headBone = find(['head']);
        const ankle = find(['foot_l', 'leftfoot']);
        const toe = find(['ball_l', 'toes_l', 'toe_l', 'lefttoe']);

        // L'osso "hip" e' la radice del bacino e sta piu' in alto
        // dell'articolazione dell'anca; il landmark hipMid di MediaPipe cade
        // invece sull'articolazione. Ancorare e misurare sulla radice
        // sposterebbe in alto tutto il corpo. Si usano le due upperleg.
        this.hipJoints = [find(['upperleg_l', 'thigh_l']), find(['upperleg_r', 'thigh_r'])]
            .filter(Boolean);
        if (!this.hipJoints.length) this.hipJoints = [this.hipBone];

        this.shoulderJoints = [find(['upperarm_l']), find(['upperarm_r'])].filter(Boolean);
        if (!this.shoulderJoints.length) this.shoulderJoints = [this.hipBone];

        this.headBone = headBone || null;
        this.neckBone = find(['neck']) || (headBone && headBone.parent) || null;

        this.rig.position.set(0, 0, 0);
        this.rig.quaternion.identity();
        this.rig.scale.setScalar(1);
        this.rig.updateMatrixWorld(true);

        // verso in cui guarda il modello: la punta del piede non mente
        if (ankle && toe) {
            const a = ankle.getWorldPosition(new THREE.Vector3());
            const t = toe.getWorldPosition(new THREE.Vector3());
            const f = t.sub(a);
            f.y = 0;
            if (f.lengthSq() > 1e-8) this.forward.copy(f).normalize();
        } else {
            console.warn('[avatar] nessun osso della punta del piede: assumo che il modello guardi verso +Z');
        }

        // asse laterale: perpendicolare al verso di marcia, sul piano orizzontale
        this.lateral.set(0, 1, 0).cross(this.forward).normalize();

        // Misure sulla MEDIANA, non da un'articolazione laterale: la spalla
        // sta una ventina di unita' fuori asse, e includerla gonfierebbe il
        // busto (61 invece di 58). Le lunghezze dei dati devono essere quelle
        // sagittali, perche' i dati sono una figura di profilo.
        const hipPos = this._hipJointWorld(new THREE.Vector3());
        const shoulderPos = this._shoulderJointWorld(new THREE.Vector3());
        this.restTorso = Math.max(1e-4, hipPos.distanceTo(shoulderPos));

        // L'osso della testa sta alla base del cranio, il landmark 'nose' di
        // MediaPipe parecchio piu' avanti e in alto. Non si insegue il naso:
        // si va nella sua DIREZIONE, alla distanza che l'osso puo' davvero
        // raggiungere (vedi poseTo), cosi' la testa resta sul raggio della
        // spina senza che la catena debba allungarsi.
        const headPos = headBone
            ? headBone.getWorldPosition(new THREE.Vector3())
            : shoulderPos.clone().setY(shoulderPos.y + 1);
        this.restHead = Math.max(1e-4, shoulderPos.distanceTo(headPos));

        // altezza da fermo, per piazzare l'avatar prima che ci sia un asana
        // (l'animazione iniziale gira quando la pratica non e' ancora partita)
        const footPos = ankle ? ankle.getWorldPosition(new THREE.Vector3()) : null;
        this.restStanding = footPos
            ? Math.max(1e-4, headPos.y - footPos.y)
            : this.restTorso * 2.9;

        // larghezza di ogni catena, letta sulla sua radice (vedi LATERAL_ROOT)
        this.restLateral = { head: 0 };
        for (const key in LATERAL_ROOT) {
            const pattern = LATERAL_ROOT[key];
            if (!pattern) { this.restLateral[key] = 0; continue; }
            const root = find([pattern]);
            if (!root) {
                console.warn('[avatar] radice della catena non trovata per ' + key + ': lo tengo sulla mediana');
                this.restLateral[key] = 0;
                continue;
            }
            this.restLateral[key] = root.getWorldPosition(new THREE.Vector3()).dot(this.lateral);
        }

        // Ossa che appartengono davvero al corpo. ikSetup, per costruire le
        // catene, aggiunge alla SCENA sei ossa-bersaglio e poi le infila
        // dentro skeleton.bones: restano dove il modello stava al
        // caricamento, in unita' FBX, e falserebbero qualunque misura
        // d'ingombro (e' quello che sballava l'inquadratura dell'intro).
        this.bodyBones = bones.filter(b => {
            for (let n = b; n.parent; n = n.parent) if (n.parent === this.rig) return true;
            return false;
        });
        if (!this.bodyBones.length) this.bodyBones = bones;

        // ossa degli arti, risolte una volta sola
        this.limbs = {};
        for (const key in LIMBS) {
            const spec = LIMBS[key];
            const bonesFound = spec.bones.map(n => find([n]));
            if (bonesFound.some(b => !b)) {
                console.warn('[avatar] catena incompleta per ' + key + ': la lascio ferma');
                continue;
            }
            this.limbs[key] = { bones: bonesFound, joints: spec.joints, lateral: key };
        }

        // Ossa su cui misurare l'ingombro. Due accortezze:
        //  - fuori la radice dello scheletro, che resta al livello del
        //    pavimento anche da seduti e allungherebbe l'ingombro verso il
        //    basso di mezzo corpo;
        //  - dentro la sommita' del cranio e le punte dei piedi, che sono
        //    gli estremi veri della figura: fermandosi all'osso della testa
        //    e alla caviglia si inquadra piu' stretto del corpo visibile e
        //    la testa esce dal riquadro.
        this.frameBones = [].concat(
            this.hipJoints, this.shoulderJoints,
            [this.headBone, this.neckBone, find(['head_end']), find(['ball_l', 'toes_l']), find(['ball_r', 'toes_r'])],
            ...Object.keys(this.limbs).map(k => this.limbs[k].bones)
        ).filter(Boolean);
        if (!this.frameBones.length) this.frameBones = this.bodyBones;
    }

    /**
     * Orienta e ridimensiona l'avatar sull'asana corrente.
     * @param {object} tPts  punti bersaglio in spazio isotropo, gia' ancorati sul corpo dell'utente
     * @param {string} view  'profile' | 'front'
     * @param {string} facing 'right' | 'left' (solo in profilo)
     */
    fitTo(tPts, view, facing) {
        if (!this.ready || !tPts || !tPts.hipMid) return;

        // La scala viene dal busto, anca->spalle: e' l'unica misura che
        // significa la stessa cosa nei dati e nel modello. Anca->naso no,
        // perche' l'osso della testa non e' il naso.
        if (!tPts.shoulderMid) return;
        const targetTorso = Math.hypot(
            tPts.shoulderMid.x - tPts.hipMid.x,
            tPts.shoulderMid.y - tPts.hipMid.y
        );
        const scale = Math.max(1e-6, targetTorso) / this.restTorso;
        this.rig.scale.setScalar(scale);
        this._scale = scale;

        // la posa guarda sempre la telecamera: di taglio per il saluto al
        // sole (il corpo attraversa lo schermo), di fronte per gli asana frontali
        let dir;
        if (view === 'profile') dir = facing === 'left' ? new THREE.Vector3(-1, 0, 0) : new THREE.Vector3(1, 0, 0);
        else dir = new THREE.Vector3(0, 0, 1);

        const theta = Math.atan2(dir.x, dir.z) - Math.atan2(this.forward.x, this.forward.z);
        this.rig.rotation.set(0, theta, 0);

        // incolla l'anca del modello sull'anca dell'asana
        this.rig.position.set(0, 0, 0);
        this.rig.updateMatrixWorld(true);
        const hipNow = this._hipJointWorld(this._v);
        this.rig.position.set(tPts.hipMid.x - hipNow.x, (1 - tPts.hipMid.y) - hipNow.y, -hipNow.z);
        this.rig.updateMatrixWorld(true);
    }

    /**
     * Mette l'avatar in piedi al centro del riquadro dato, rivolto alla
     * telecamera. Serve prima che ci sia un asana da seguire: durante la
     * minianimazione iniziale la posa la detta l'animazione, non i dati.
     *
     * @param {object} box riquadro visibile {cx, cy, w, h} in coordinate mondo
     */
    placeCentered(box, fill = 0.72) {
        if (!this.ready) return;
        const scale = (fill * box.h) / this.restStanding;
        this.rig.scale.setScalar(scale);
        this._scale = scale;

        // rivolto verso la telecamera: il verso di marcia del modello va su +Z
        const theta = Math.atan2(0, 1) - Math.atan2(this.forward.x, this.forward.z);
        this.rig.rotation.set(0, theta, 0);

        this.rig.position.set(0, 0, 0);
        this.rig.updateMatrixWorld(true);
        const hipNow = this._hipJointWorld(this._v);
        this.rig.position.set(box.cx - hipNow.x, box.cy - hipNow.y, -hipNow.z);
        this.rig.updateMatrixWorld(true);
    }

    /**
     * Posa l'avatar da un fotogramma della minianimazione iniziale.
     *
     * Qui non ci sono landmark: ogni segmento e' dato come DIREZIONE nel
     * sistema del corpo — x verso il fianco sinistro, y in alto, z in
     * avanti. Le lunghezze non servono, perche' _aimVector usa solo la
     * direzione: gli ossi restano lunghi quanto sono. Cosi' un fotogramma
     * chiave si scrive a mano senza dover far tornare le proporzioni.
     *
     * @param {object} d {spine, head, upperArmL, foreArmL, upperArmR,
     *                    foreArmR, thighL, shinL, thighR, shinR}
     */
    poseFromDirections(d) {
        if (!this.ready || !d) return;

        const world = (v, out) => {
            // dal sistema del corpo a quello del rig, poi al mondo
            out.set(0, 0, 0)
               .addScaledVector(this.lateral, v[0])
               .addScaledVector(UP, v[1])
               .addScaledVector(this.forward, v[2]);
            return out.applyQuaternion(this.rig.quaternion);
        };

        if (d.spine && this.hipBone) {
            this._aimVector(this.hipBone, this._shoulderJointWorld(this._b), world(d.spine, this._f));
        }
        if (d.head && this.neckBone && this.headBone) {
            this._aimVector(this.neckBone, this.headBone.getWorldPosition(this._b), world(d.head, this._f));
        }

        for (const key in this.limbs) {
            const limb = this.limbs[key];
            const names = DIRECTION_KEYS[key];
            if (!names) continue;
            for (let i = 0; i < 2; i++) {
                const v = d[names[i]];
                if (!v) continue;
                this._aimVector(limb.bones[i], limb.bones[i + 1].getWorldPosition(this._b), world(v, this._f));
            }
        }
    }

    /**
     * Inquadra l'avatar sulla posa che ha adesso: misura l'ingombro vero
     * degli ossi e ci adatta scala e posizione. Serve perche' una posa
     * seduta occupa poco piu' di meta' dell'altezza in piedi, e una misura
     * fissa la lascerebbe minuscola in mezzo allo schermo.
     *
     * @param {object} box  riquadro visibile {cx, cy, w, h} in coordinate mondo
     * @param {number} fill quota del riquadro da occupare
     */
    frameTo(box, fill = 0.7) {
        if (!this.ready) return;
        const bones = this.frameBones;
        const measure = () => {
            let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
            const p = this._b;
            for (const b of bones) {
                b.getWorldPosition(p);
                if (p.y < minY) minY = p.y;
                if (p.y > maxY) maxY = p.y;
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
            }
            return { minY, maxY, minX, maxX };
        };

        let b = measure();
        const k = Math.min(
            (fill * box.h) / Math.max(1e-6, b.maxY - b.minY),
            (fill * box.w) / Math.max(1e-6, b.maxX - b.minX)
        );
        this.rig.scale.multiplyScalar(k);
        this._scale = this.rig.scale.x;
        this.rig.updateMatrixWorld(true);

        b = measure();
        this.rig.position.x += box.cx - (b.minX + b.maxX) / 2;
        this.rig.position.y += box.cy - (b.minY + b.maxY) / 2;
        this.rig.updateMatrixWorld(true);
    }

    /** Punto medio fra le due articolazioni dell'anca, in coordinate mondo. */
    _hipJointWorld(out) {
        return this._jointMid(this.hipJoints, out);
    }

    /** Punto medio fra le due spalle, in coordinate mondo. */
    _shoulderJointWorld(out) {
        return this._jointMid(this.shoulderJoints, out);
    }

    _jointMid(bones, out) {
        out.set(0, 0, 0);
        const tmp = new THREE.Vector3();
        for (const b of bones) out.add(b.getWorldPosition(tmp));
        return out.divideScalar(bones.length || 1);
    }

    /**
     * Porta l'avatar nell'asana: IK per il tronco, cinematica diretta per
     * gli arti (vedi la nota in cima al file).
     */
    poseTo(tPts, view) {
        if (!this.ready || !tPts) return;
        const profile = view === 'profile';

        // 1. il tronco, come un pezzo solo: si ruota il bacino finche' le
        //    spalle non finiscono dove l'asana le vuole. I dati descrivono
        //    la spina come una spezzata di due tratti (anca-spalle-naso),
        //    quindi un tronco rigido li riproduce esattamente; il solver
        //    CCD invece, su un piegamento di quasi 180 gradi come quello di
        //    Uttanasana, si ferma prima e si porta dietro anche le spalle.
        const shTarget = this._worldTarget(tPts, 'shoulderMid', profile, 'head');
        if (shTarget && this.hipBone) {
            this._aimPoint(this.hipBone, this._shoulderJointWorld(this._b), shTarget);
        }

        // 2. il collo, perche' la testa segua il secondo tratto della spina
        const headTarget = this._headTarget(tPts);
        if (headTarget && this.neckBone && this.headBone) {
            this._aim(this.neckBone, this.headBone, headTarget);
        }

        // 2. gli arti, ora che spalle e anche sono dove devono stare
        this.skinnedMesh.updateMatrixWorld(true);
        for (const key in this.limbs) {
            const limb = this.limbs[key];
            for (let i = 0; i < 2; i++) {
                const target = this._worldTarget(tPts, limb.joints[i], profile, limb.lateral);
                if (target) this._aim(limb.bones[i], limb.bones[i + 1], target);
            }
        }
    }

    /**
     * Bersaglio del tronco: sulla retta spalle->naso dei dati, ma alla
     * distanza che l'osso della testa raggiunge davvero. Inseguire il naso
     * lascerebbe la catena tesa e il tronco piegato meno del dovuto.
     */
    _headTarget(tPts) {
        const sh = tPts.shoulderMid, nose = tPts.nose;
        if (!sh || !nose) return null;
        const dx = nose.x - sh.x, dy = nose.y - sh.y;
        const len = Math.hypot(dx, dy);
        if (len < 1e-6) return null;
        const reach = this.restHead * (this._scale || 1);
        const p = { x: sh.x + (dx / len) * reach, y: sh.y + (dy / len) * reach };
        return this.rig.localToWorld(
            this.rig.worldToLocal(this._w.set(p.x, 1 - p.y, 0))
        );
    }

    /**
     * Landmark dell'asana -> punto nel mondo a cui puntare un osso.
     * In profilo prende la mediana fra lato sinistro e destro e la riporta
     * alla larghezza propria della catena.
     */
    _worldTarget(tPts, joint, profile, lateralKey) {
        let p = tPts[joint];
        if (profile) {
            const other = joint[0] === 'l' ? 'r' + joint.slice(1)
                        : joint[0] === 'r' ? 'l' + joint.slice(1)
                        : null;
            const a = tPts[joint];
            const b = other ? tPts[other] : null;
            if (!a) return null;
            p = b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a;
        }
        if (!p) return null;

        const local = this.rig.worldToLocal(this._w.set(p.x, 1 - p.y, 0));
        const lat = this.restLateral[lateralKey];
        if (profile && lat !== undefined) {
            local.addScaledVector(this.lateral, lat - local.dot(this.lateral));
        }
        return this.rig.localToWorld(local);
    }

    /**
     * Ruota `bone` finche' `child` non guarda verso `target`, lasciando
     * intatta la posizione dell'osso. Il calcolo passa per lo spazio mondo e
     * torna in locale, perche' il bersaglio arriva in coordinate mondo.
     */
    _aim(bone, child, target) {
        this._aimPoint(bone, child.getWorldPosition(this._b), target);
    }

    /**
     * Come _aim, ma il punto da orientare non e' un osso figlio: e' un punto
     * qualsiasi solidale con l'osso (per il tronco, il punto medio fra le
     * spalle, che non ha un osso proprio).
     */
    _aimPoint(bone, currentWorld, target) {
        const want = this._d.copy(target).sub(bone.getWorldPosition(this._a));
        this._aimVector(bone, currentWorld, want);
    }

    /**
     * Variante che prende una direzione invece di un punto: e' quella che
     * serve alla minianimazione iniziale, dove i fotogrammi chiave sono
     * versori di segmento e non posizioni di giunti.
     */
    _aimVector(bone, currentWorld, want) {
        const bPos = bone.getWorldPosition(this._a);
        const cur = this._c.copy(currentWorld).sub(bPos);
        if (cur.lengthSq() < 1e-12 || want.lengthSq() < 1e-12) return;
        cur.normalize();
        const dir = this._e.copy(want).normalize();

        const delta = this._q1.setFromUnitVectors(cur, dir);
        const worldQ = bone.getWorldQuaternion(this._q2).premultiply(delta);
        const parentQ = bone.parent
            ? bone.parent.getWorldQuaternion(this._q3).invert()
            : this._q3.identity();
        bone.quaternion.copy(parentQ.multiply(worldQ));
        bone.updateMatrixWorld(true);
    }

    setOpacity(v) {
        if (!this.model) return;
        this.model.traverse(child => {
            if (!child.isMesh) return;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const m of mats) m.opacity = v;
            child.visible = v > 0.01;
        });
    }

    set visible(v) { this.rig.visible = v && this.ready; }
    get visible() { return this.rig.visible; }
}
