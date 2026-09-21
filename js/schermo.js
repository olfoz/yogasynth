// Invio al secondo schermo.
//
// Il computer inquadra e il telefono guarda: la webcam deve stare lontana per
// prendere tutto il corpo, lo schermo vicino per poterlo leggere.
//
// Al telefono si mandano POSIZIONI, non immagini. Dove sono i giunti, dove
// passano i raggi, che note suonano: meno di un chilobyte, che il telefono
// ridisegna alla sua risoluzione. Mandare lo schermo intero come JPEG
// costava quaranta volte tanto, dava al telefono un'immagine compressa da
// ingrandire, e obbligava il computer a copiare e comprimere il canvas a
// ogni fotogramma — proprio mentre deve far girare MediaPipe e l'avatar.

// Relativi, non assoluti: cosi' l'app funziona anche se il sito sta in una
// sottocartella (https://tizio.github.io/yogasynth/) e non alla radice.
const STATE_URL = 'live/state';

/** Meno cifre = meno byte. Un millesimo di riquadro e' gia' sotto il pixel. */
function r4(v) {
    return Math.round(v * 10000) / 10000;
}

function packPoints(uPts) {
    if (!uPts) return null;
    const out = {};
    for (const k in uPts) out[k] = [r4(uPts[k].x), r4(uPts[k].y)];
    return out;
}

export class Schermo {
    /** @param {object} opts { hz } quanti aggiornamenti al secondo */
    constructor({ hz = 20 } = {}) {
        this.interval = 1000 / hz;
        this.active = false;
        this.last = 0;
        this.inFlight = false;
        this.sent = 0;
        this.failed = 0;
    }

    start() { this.active = true; this.failed = 0; }
    stop() { this.active = false; this.inFlight = false; }

    /**
     * @param {object} snap tutto quello che serve al telefono per ridisegnare
     */
    send(snap) {
        if (!this.active || this.inFlight) return;
        const now = performance.now();
        if (now - this.last < this.interval) return;
        this.last = now;

        this.inFlight = true;
        fetch(STATE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(snap)
        })
            .then(() => { this.sent++; })
            .catch(() => {
                this.failed++;
                // Se il server non e' quello con il ponte (per esempio
                // `python -m http.server`), non ha senso continuare a
                // bussare: si spegne da solo dopo qualche tentativo.
                if (this.failed > 10 && this.sent === 0) {
                    console.warn('[schermo] nessun ponte attivo: avvia il server con tools/serve.py');
                    this.stop();
                }
            })
            .then(() => { this.inFlight = false; });
    }

    /**
     * Confeziona lo stato corrente.
     *
     * `fits` sono le rette bersaglio gia' ancorate sul corpo: al telefono
     * basta centro e direzione, la lunghezza se la calcola lui per far
     * uscire il raggio dallo schermo.
     */
    static snapshot({ practice, res, uPts, fits, aspect, progress, state, audio, maxHarmonics }) {
        return {
            aspect: r4(aspect),
            asana: practice.current ? practice.current.name : '',
            label: practice.current ? practice.current.label : '',
            cue: practice.current ? practice.current.cue : '',
            chord: practice.chord ? practice.chord.symbol : '',
            chordLabel: practice.chord ? practice.chord.label : '',
            step: practice.progressLabel(),
            progress: r4(progress),
            done: state === 'done',
            body: packPoints(uPts),
            rays: practice.rays.map((ray, i) => {
                const fit = fits[i];
                const note = practice.noteFor(i);
                return {
                    id: ray.id,
                    label: ray.label,
                    color: ray.color,
                    segs: ray.segs,
                    note: note ? note.name : '',
                    score: r4(res.scores[i] || 0),
                    active: !!res.active[i],
                    coverage: r4(res.coverage ? res.coverage[i] : 1),
                    harmonics: audio ? audio.harmonicsOf(i) : 0,
                    maxHarmonics,
                    fit: fit ? {
                        cx: r4(fit.cx), cy: r4(fit.cy),
                        dx: r4(fit.dirx), dy: r4(fit.diry)
                    } : null
                };
            })
        };
    }

    /** Indirizzo da aprire sul telefono, chiesto al server. */
    static async phoneUrl() {
        try {
            const res = await fetch('live/info', { cache: 'no-store' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return (await res.json()).schermo || null;
        } catch (e) {
            return null;
        }
    }
}
