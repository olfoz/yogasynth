// Le rette dell'asana: come si costruiscono, come si misura quanto il corpo
// ci si e' adagiato sopra.
//
// Un raggio vale due cose insieme:
//   - ALLINEAMENTO: i segmenti del corpo puntano nella direzione che l'asana
//     chiede (e' questo asana e non un altro);
//   - RETTITUDINE: i giunti di quel raggio stanno davvero su una retta
//     (il corpo e' adagiato sul raggio, non piegato attraverso).
// Il punteggio combinato pilota sia il colore del raggio sia la purezza
// della nota corrispondente.

// Soglia di visibilita' sotto la quale un giunto si considera perso.
//
// Tenuta bassa apposta. MediaPipe continua a stimare i giunti che escono dal
// bordo, e quelle stime sono buone finche' l'arto e' appena fuori: scartarle
// costringerebbe a stare piu' lontani dalla webcam solo per far entrare le
// caviglie nell'inquadratura. Il punteggio pesa comunque ogni segmento per
// quanto ci si puo' fidare (vedi rayScore).
const MIN_VISIBILITY = 0.25;

// Sotto questa quota di retta effettivamente vista, la retta non si giudica
// affatto: meglio dire "fuori campo" che dare un voto a un'ipotesi.
const MIN_COVERAGE = 0.4;

// Nomi dei giunti -> indici dei landmark MediaPipe Pose.
export const LM_MAP = {
    nose: 0,
    lShoulder: 11, rShoulder: 12,
    lElbow: 13, rElbow: 14,
    lWrist: 15, rWrist: 16,
    lHip: 23, rHip: 24,
    lKnee: 25, rKnee: 26,
    lAnkle: 27, rAnkle: 28
};

// Ordine delle note imposto dall'app, indipendente da come l'asana elenca
// le sue rette: la spina dorsale e' sempre la prima nota (la fondamentale
// nel basso), gli arti superiori la seconda, gli inferiori la terza. Le
// rette in piu' richieste dall'asana vengono dopo, nell'ordine dei dati.
const NOTE_ORDER = ['spine', 'arms', 'upperArms', 'legs'];

export function orderRaysForNotes(rayIds) {
    const known = NOTE_ORDER.filter(id => rayIds.includes(id));
    const extra = rayIds.filter(id => !NOTE_ORDER.includes(id));
    return known.concat(extra);
}

/** Quanto ci si puo' fidare di un punto: 1 se non e' detto altrimenti. */
function conf(p) {
    return (p && p.conf !== undefined) ? p.conf : 1;
}

export function addMidpoints(pts) {
    if (pts.lShoulder && pts.rShoulder) {
        pts.shoulderMid = {
            x: (pts.lShoulder.x + pts.rShoulder.x) / 2,
            y: (pts.lShoulder.y + pts.rShoulder.y) / 2,
            conf: Math.min(conf(pts.lShoulder), conf(pts.rShoulder))
        };
    }
    if (pts.lHip && pts.rHip) {
        pts.hipMid = {
            x: (pts.lHip.x + pts.rHip.x) / 2,
            y: (pts.lHip.y + pts.rHip.y) / 2,
            conf: Math.min(conf(pts.lHip), conf(pts.rHip))
        };
    }
    return pts;
}

/** Landmark dell'asana (gia' in spazio isotropo) -> punti nominati. */
export function asanaPoints(asana) {
    const pts = {};
    for (const k in asana.landmarks) {
        pts[k] = { x: asana.landmarks[k][0], y: asana.landmarks[k][1] };
    }
    return addMidpoints(pts);
}

/** Versione specchiata: l'utente puo' mettersi di profilo da un lato o dall'altro. */
export function mirrorPoints(pts) {
    const out = {};
    for (const k in pts) {
        const mk = k.startsWith('l') ? 'r' + k.slice(1)
                 : k.startsWith('r') ? 'l' + k.slice(1)
                 : k;
        out[mk] = { x: 1 - pts[k].x, y: pts[k].y };
    }
    return addMidpoints(out);
}

/**
 * Landmark MediaPipe -> punti nominati in spazio isotropo (x specchiata per
 * l'effetto selfie e moltiplicata per l'aspect, cosi' gli angoli sono reali).
 */
export function userPoints(landmarks, aspect) {
    if (!landmarks) return null;
    const pts = {};
    let any = false;
    for (const k in LM_MAP) {
        const l = landmarks[LM_MAP[k]];
        const v = (l && l.visibility !== undefined) ? l.visibility : 1;
        if (l && v > MIN_VISIBILITY) {
            pts[k] = { x: (1 - l.x) * aspect, y: l.y, conf: v };
            any = true;
        }
    }
    return any ? addMidpoints(pts) : null;
}

/**
 * Porta l'asana sul corpo dell'utente: stessa origine sul bacino, stessa
 * scala del busto. Senza questo, i raggi finirebbero dove l'utente non e'.
 *
 * Sta qui, e non in main.js dov'e' nata, perche' non la usa piu' solo il
 * computer: anche il telefono deve rimettere in scala la posa guida che
 * riceve, e lo fa con questa stessa aritmetica (`_anchorTarget` in
 * js/schermoView.js). Due copie che si allontanano darebbero una figura
 * guida leggermente fuori posto sul solo telefono, ed e' il genere di
 * sbaglio che non si nota finche' non e' tardi: tools/banco-logica.html
 * confronta le due strade a ogni giro.
 */
export function anchorTarget(tPts, uPts, aspect) {
    let fn;
    if (uPts && uPts.hipMid && uPts.shoulderMid && tPts.hipMid && tPts.shoulderMid) {
        const uT = Math.hypot(uPts.shoulderMid.x - uPts.hipMid.x, uPts.shoulderMid.y - uPts.hipMid.y);
        const tT = Math.hypot(tPts.shoulderMid.x - tPts.hipMid.x, tPts.shoulderMid.y - tPts.hipMid.y);
        const s = tT > 1e-6 ? uT / tT : 1;
        fn = p => ({
            x: (p.x - tPts.hipMid.x) * s + uPts.hipMid.x,
            y: (p.y - tPts.hipMid.y) * s + uPts.hipMid.y
        });
    } else {
        // nessuno inquadrato: l'asana si mostra comunque, centrato
        let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
        for (const k in tPts) {
            minY = Math.min(minY, tPts[k].y); maxY = Math.max(maxY, tPts[k].y);
            minX = Math.min(minX, tPts[k].x); maxX = Math.max(maxX, tPts[k].x);
        }
        const s = 0.66 / Math.max(1e-6, maxY - minY);
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        fn = p => ({ x: (p.x - cx) * s + aspect / 2, y: (p.y - cy) * s + 0.5 });
    }

    const out = {};
    for (const k in tPts) out[k] = fn(tPts[k]);
    return out;
}

/**
 * Retta ai minimi quadrati (PCA) su un insieme di punti.
 * @returns {{collinearity, cx, cy, dirx, diry, tMin, tMax}|null}
 */
export function fitLine(points) {
    const valid = points.filter(Boolean);
    if (valid.length < 2) return null;

    const n = valid.length;
    const mx = valid.reduce((s, p) => s + p.x, 0) / n;
    const my = valid.reduce((s, p) => s + p.y, 0) / n;

    let Sxx = 0, Syy = 0, Sxy = 0;
    for (const p of valid) {
        const dx = p.x - mx, dy = p.y - my;
        Sxx += dx * dx; Syy += dy * dy; Sxy += dx * dy;
    }
    Sxx /= n; Syy /= n; Sxy /= n;

    const tr = Sxx + Syy;
    const det = Sxx * Syy - Sxy * Sxy;
    const disc = Math.max(0, tr * tr / 4 - det);
    const L1 = tr / 2 + Math.sqrt(disc);
    const L2 = Math.max(0, tr / 2 - Math.sqrt(disc));
    if (L1 < 1e-9) return null;

    let dirx, diry;
    if (Math.abs(Sxy) > 1e-12) {
        dirx = L1 - Syy; diry = Sxy;
    } else {
        dirx = Sxx >= Syy ? 1 : 0;
        diry = Sxx >= Syy ? 0 : 1;
    }
    const mag = Math.hypot(dirx, diry) || 1;
    dirx /= mag; diry /= mag;

    // quanto i punti si stringono sulla retta: 1 = perfettamente allineati
    const collinearity = Math.max(0, 1 - Math.sqrt(L2 / L1) * 2.2);

    let tMin = Infinity, tMax = -Infinity;
    for (const p of valid) {
        const t = (p.x - mx) * dirx + (p.y - my) * diry;
        if (t < tMin) tMin = t;
        if (t > tMax) tMax = t;
    }

    return { collinearity, cx: mx, cy: my, dirx, diry, tMin, tMax };
}

/** Accordo angolare fra due direzioni, senza verso: 1 = parallele, 0 oltre 60 gradi. */
function dirAgreement(ax, ay, bx, by) {
    const dot = Math.abs(ax * bx + ay * by);
    const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
    return Math.max(0, 1 - ang / (Math.PI / 3));
}

/** Accordo angolare fra due segmenti, con verso. */
function segAgreement(uPts, tPts, a, b) {
    const ua = uPts[a], ub = uPts[b], ta = tPts[a], tb = tPts[b];
    if (!ua || !ub || !ta || !tb) return null;
    const uAng = Math.atan2(ub.y - ua.y, ub.x - ua.x);
    const tAng = Math.atan2(tb.y - ta.y, tb.x - ta.x);
    let d = Math.abs(uAng - tAng);
    if (d > Math.PI) d = 2 * Math.PI - d;
    return Math.max(0, 1 - d / (Math.PI / 3));
}

/**
 * Costruisce le rette di un asana nell'ordine in cui diventano note.
 * @returns {Array<{id, label, color, rgb, joints, segs, noteIndex}>}
 */
export function buildAsanaRays(asana, rayLibrary) {
    const ids = orderRaysForNotes(asana.rays || ['spine', 'arms', 'legs']);
    return ids.map((id, noteIndex) => {
        const def = rayLibrary[id];
        if (!def) throw new Error('Retta sconosciuta nei dati: ' + id);
        const joints = def.joints;
        const segs = [];
        for (let i = 0; i < joints.length - 1; i++) segs.push([joints[i], joints[i + 1]]);
        return { id, label: def.label, color: def.color, rgb: def.rgb, joints, segs, noteIndex };
    });
}

/**
 * Punteggio di una retta: allineamento all'asana + rettitudine del corpo.
 *
 * Ogni segmento pesa quanto ci si fida dei suoi estremi, e la media e' pesata
 * invece che divisa per il numero di segmenti. Cosi' una retta vista per tre
 * quarti prende comunque un voto pieno se quei tre quarti sono a posto: e'
 * quello che permette di stare vicini alla webcam con un piede che sbuca dal
 * bordo, invece di dover arretrare finche' non ci sta tutto.
 */
export function rayScore(ray, uPts, tPts) {
    const none = { score: 0, alignment: 0, straightness: 0, coverage: 0 };
    if (!uPts) return none;

    let sum = 0, weight = 0;
    for (const [a, b] of ray.segs) {
        const s = segAgreement(uPts, tPts, a, b);
        if (s === null) continue;
        const w = Math.min(conf(uPts[a]), conf(uPts[b]));
        sum += w * s;
        weight += w;
    }

    const coverage = weight / ray.segs.length;
    if (coverage < MIN_COVERAGE) return Object.assign({}, none, { coverage });
    const alignment = sum / weight;

    // rettitudine, misurata sul bersaglio: le rette che l'asana stesso non
    // ha dritte (la spina in Uttanasana, per esempio) non devono chiedere
    // all'utente piu' di quanto chieda l'asana
    const uFit = fitLine(ray.joints.map(j => uPts[j]));
    const tFit = fitLine(ray.joints.map(j => tPts[j]));
    let straightness = 0;
    if (uFit && tFit) {
        const deficit = Math.max(0, tFit.collinearity - uFit.collinearity);
        straightness = Math.max(0, 1 - deficit / 0.35);
        // e comunque la retta dell'utente deve avere la giacitura giusta
        straightness *= dirAgreement(uFit.dirx, uFit.diry, tFit.dirx, tFit.diry);
    }

    return {
        score: 0.6 * alignment + 0.4 * straightness,
        alignment,
        straightness,
        coverage,
        fit: uFit,
        targetFit: tFit
    };
}

// Quanto deve staccare una delle due ipotesi (dritta o specchiata) perche'
// il confronto conti come prova, e per quanti fotogrammi deve ripetersi
// prima di diventare definitiva. Quindici fotogrammi sono circa mezzo
// secondo: il tempo di escludere un'inquadratura presa a meta' di un giro.
const MIRROR_MARGIN = 0.15;
const MIRROR_FRAMES = 15;

/**
 * Smussa i punteggi nel tempo, decide l'isteresi acceso/spento e sceglie da
 * che parte e' rivolta la persona — una volta sola, all'inizio, e poi non
 * cambia piu' (vedi il costruttore).
 */
export class RayTracker {
    constructor() {
        // Il verso e' della persona, non dell'asana: si sceglie una volta e
        // poi si blocca. Prima veniva riconsiderato a ogni fotogramma e
        // azzerato a ogni cambio di asana, quindi il bersaglio poteva
        // ribaltarsi da destra a sinistra in mezzo alla pratica — e chi la
        // sta facendo si ritrova la posa da imitare girata dall'altra parte.
        // Le pose simmetriche (Tadasana) non danno scarto fra dritto e
        // specchiato: e' giusto che non decidano niente, decide la prima
        // posa che ha un verso.
        this.mirrored = false;
        this.mirrorVotes = 0;
        this.mirrorLocked = false;
        this.setRays([]);
    }

    setRays(rays) {
        this.rays = rays;
        this.smooth = rays.map(() => 0);
        this.active = rays.map(() => false);
    }

    reset() {
        this.smooth = this.rays.map(() => 0);
        this.active = this.rays.map(() => false);
        // il verso resta quello: "ricomincia" rifa' la sequenza, non rigira
        // la persona. Per riconsiderarlo si ricarica la pagina.
    }

    update(uPts, tPts, tPtsMirror) {
        const n = this.rays.length;
        let raw = new Array(n).fill(0);
        let details = new Array(n).fill(null);

        if (uPts && n) {
            const dir = this.rays.map(r => rayScore(r, uPts, tPts));
            const mir = this.rays.map(r => rayScore(r, uPts, tPtsMirror));
            if (!this.mirrorLocked) {
                const totD = dir.reduce((s, r) => s + r.score, 0);
                const totM = mir.reduce((s, r) => s + r.score, 0);
                // solo uno scarto netto conta come prova; sotto, la posa non
                // sta dicendo niente sul verso
                const scelto = totM > totD + MIRROR_MARGIN ? true
                             : totD > totM + MIRROR_MARGIN ? false
                             : null;
                if (scelto === null) {
                    this.mirrorVotes = 0;
                } else if (scelto === this.mirrored) {
                    // la stessa risposta per mezzo secondo: non e' un
                    // fotogramma preso mentre la persona si sta girando
                    if (++this.mirrorVotes >= MIRROR_FRAMES) this.mirrorLocked = true;
                } else {
                    this.mirrored = scelto;
                    this.mirrorVotes = 1;
                }
            }
            details = this.mirrored ? mir : dir;
            raw = details.map(d => d.score);
        }

        for (let i = 0; i < n; i++) {
            this.smooth[i] = this.smooth[i] * 0.72 + raw[i] * 0.28;
            const s = this.smooth[i];
            if (!this.active[i] && s > 0.72) this.active[i] = true;
            if (this.active[i] && s < 0.58) this.active[i] = false;
        }

        return {
            scores: this.smooth,
            active: this.active,
            mirrored: this.mirrored,
            mirrorLocked: this.mirrorLocked,
            details,
            coverage: details.map(d => (d ? d.coverage : 0))
        };
    }
}
