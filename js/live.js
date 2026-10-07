// La posa dal vivo: quella dell'insegnante, in 3D, per l'avatar.
//
// In modalita' automatica l'avatar mostra l'asana da raggiungere, che sta
// nei dati. In modalita' libera un asana non c'e': l'insegnante assume la
// posizione che vuole e l'avatar la ripete. Per farlo serve la terza
// dimensione — un braccio teso verso la telecamera, in 2D, e' solo un
// braccio corto — e MediaPipe la calcola gia': `poseWorldLandmarks`, in
// metri, con l'origine fra le anche.
//
// La posa si confeziona gia' pronta per l'avatar, cosi' il computer
// dell'insegnante e la pagina degli allievi fanno lo stesso identico conto:
//
//   - in spazio isotropo (x a destra, y in basso, unita' = altezza del
//     fotogramma) relativa al bacino, piu' z verso chi guarda;
//   - SPECCHIATA come l'immagine della webcam, e con sinistra e destra
//     scambiate.
//
// Lo scambio non e' un vezzo. Specchiare e' un riflesso, e nessuna rotazione
// dell'avatar lo riproduce: la mano destra dell'insegnante, che nello
// specchio sta a destra dello schermo, un avatar rivolto verso di noi la
// raggiunge solo incrociando il braccio davanti al petto. Chiamandola
// "sinistra", riflesso e scambio si annullano e l'avatar diventa l'immagine
// allo specchio dell'insegnante — come in sala, dove chi sta davanti alza la
// sinistra perche' gli allievi alzino la destra.

// Giunti mandati, con l'indice di MediaPipe Pose. Le orecchie servono alla
// testa (il naso sta troppo avanti per dare la direzione del collo), le punte
// dei piedi ai piedi.
const GIUNTI = {
    nose: 0, lEar: 7, rEar: 8,
    lShoulder: 11, rShoulder: 12,
    lElbow: 13, rElbow: 14,
    lWrist: 15, rWrist: 16,
    lHip: 23, rHip: 24,
    lKnee: 25, rKnee: 26,
    lAnkle: 27, rAnkle: 28,
    lToe: 31, rToe: 32
};

// Segmenti su cui si misura il rapporto fra metri e spazio isotropo. Tanti e
// non uno solo: un segmento puntato verso la telecamera e' corto in entrambe
// le misure e da solo darebbe un rapporto a caso; sommandoli il rapporto
// lo decidono quelli che si vedono di taglio.
const SEGMENTI_SCALA = [
    [11, 23], [12, 24], [11, 12], [23, 24],
    [11, 13], [12, 14], [23, 25], [24, 26], [25, 27], [26, 28]
];

// Sotto questa visibilita' il giunto non si manda: l'avatar tiene l'ultima
// direzione buona invece di inseguire un'ipotesi.
const MIN_VISIBILITA = 0.5;

function scambia(nome) {
    if (nome[0] === 'l') return 'r' + nome.slice(1);
    if (nome[0] === 'r') return 'l' + nome.slice(1);
    return nome;
}

function r3(v) { return Math.round(v * 1000) / 1000; }

function visibile(l) {
    return l && (l.visibility === undefined || l.visibility > MIN_VISIBILITA);
}

/**
 * Lato insegnante: dai landmark di MediaPipe alla posa per l'avatar.
 *
 * Tiene una sola cosa fra un fotogramma e l'altro, il rapporto fra metri e
 * spazio isotropo, smussato: misurato fotogramma per fotogramma faceva
 * pulsare l'avatar.
 */
export class LiveSender {
    constructor() {
        this.scala = 0;
    }

    /**
     * @param {Array} world   poseWorldLandmarks (metri, origine fra le anche)
     * @param {Array} lm      poseLandmarks (normalizzati sul fotogramma)
     * @param {number} aspect larghezza / altezza del fotogramma
     * @returns {object|null} { hip: [x, y], j: { nome: [x, y, z] } }
     */
    pack(world, lm, aspect) {
        if (!world || !lm) return null;
        const lH = lm[23], rH = lm[24];
        if (!visibile(lH) || !visibile(rH)) return null;

        let piano = 0, metri = 0;
        for (const [a, b] of SEGMENTI_SCALA) {
            if (!visibile(lm[a]) || !visibile(lm[b]) || !world[a] || !world[b]) continue;
            piano += Math.hypot((lm[a].x - lm[b].x) * aspect, lm[a].y - lm[b].y);
            metri += Math.hypot(world[a].x - world[b].x, world[a].y - world[b].y);
        }
        if (metri > 1e-4) {
            const s = piano / metri;
            this.scala = this.scala ? this.scala + (s - this.scala) * 0.15 : s;
        }
        if (!this.scala) return null;
        const s = this.scala;

        const wl = world[23], wr = world[24];
        const ox = (wl.x + wr.x) / 2, oy = (wl.y + wr.y) / 2, oz = (wl.z + wr.z) / 2;

        const j = {};
        for (const nome in GIUNTI) {
            const w = world[GIUNTI[nome]];
            if (!visibile(w)) continue;
            j[scambia(nome)] = [r3(-(w.x - ox) * s), r3((w.y - oy) * s), r3(-(w.z - oz) * s)];
        }
        return {
            hip: [r3((1 - (lH.x + rH.x) / 2) * aspect), r3((lH.y + rH.y) / 2)],
            j
        };
    }
}

/**
 * Lato allievo: la posa arriva una ventina di volte al secondo, lo schermo
 * si ridisegna sessanta. Senza nulla in mezzo l'avatar andrebbe a scatti;
 * qui ogni valore insegue l'ultimo arrivato, con un ritardo di qualche
 * centesimo di secondo che non si nota.
 *
 * Un giunto che smette di arrivare (fuori campo, poco visibile) resta
 * dov'era: meglio un braccio fermo che un braccio che torna in T.
 */
export class Inseguitore {
    /** @param {number} tau costante di tempo, in secondi */
    constructor(tau = 0.07) {
        this.tau = tau;
        this.bersaglio = null;
        this.ora = null;
    }

    /** @param {object} dati { chiave: [numeri] } oppure { chiave: { sottochiave: [numeri] } } */
    imposta(dati) {
        this.bersaglio = dati;
        if (!this.ora) this.ora = copia(dati);
    }

    passo(dt) {
        if (!this.bersaglio) return null;
        const k = 1 - Math.exp(-Math.max(0, dt) / this.tau);
        insegui(this.ora, this.bersaglio, k);
        return this.ora;
    }
}

function copia(v) {
    if (Array.isArray(v)) return v.slice();
    if (v && typeof v === 'object') {
        const out = {};
        for (const k in v) out[k] = copia(v[k]);
        return out;
    }
    return v;
}

function insegui(ora, bersaglio, k) {
    for (const key in bersaglio) {
        const b = bersaglio[key];
        if (b === null || b === undefined) continue;
        if (Array.isArray(b)) {
            const o = ora[key];
            if (!Array.isArray(o) || o.length !== b.length) { ora[key] = b.slice(); continue; }
            for (let i = 0; i < b.length; i++) o[i] += (b[i] - o[i]) * k;
        } else if (typeof b === 'object') {
            if (!ora[key] || typeof ora[key] !== 'object') ora[key] = {};
            insegui(ora[key], b, k);
        }
    }
}
