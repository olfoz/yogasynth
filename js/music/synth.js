// Motore audio di yogasynth: un drone per ogni retta dell'asana.
//
// Due cose distinte fanno "suonare bene" una retta:
//   1. la TENUTA: ogni secondo in cui la retta resta allineata la voce
//      guadagna un armonico, quindi il timbro si arricchisce col tempo;
//   2. la CORRETTEZZA: il punteggio della retta (0..1) pilota la purezza.
//      Sotto, i parziali sono stirati (inarmonici) e le due voci battono
//      l'una contro l'altra; man mano che la posizione si avvicina a quella
//      giusta i parziali rientrano sui multipli esatti e il battimento
//      sparisce. Il suono e' letteralmente tanto piu' armonico quanto piu'
//      la posizione e' corretta.

/**
 * Quali armonici guadagna una voce, nell'ordine in cui li guadagna.
 *
 * Non 1,2,3...8: solo ottave e quinte, cioe' i multipli fatti di 2 e di 3.
 * Il quinto armonico e' una terza maggiore e il settimo una settima minore,
 * e sono loro a imporre un colore all'accordo qualunque colore avesse:
 * in Si minore il quinto armonico del basso e' un Re# che batte contro il
 * Re della terza, in Do maggiore il settimo e' un Si bemolle che batte
 * contro il Si. Ottave e quinte invece non prendono posizione, quindi la
 * qualita' dell'accordo resta quella scritta nell'asana.
 */
const SERIE = [1, 2, 3, 4, 6, 8, 12, 16];

export const MAX_HARMONICS = SERIE.length;
export const HARMONIC_INTERVAL = 1.0;   // un armonico in piu' per ogni secondo di tenuta

class DroneVoice {
    constructor(engine, def) {
        this.engine = engine;
        this.def = def;              // { freq, name, color }
        this.state = 'off';
        this.harmonics = 0;
        this.nextHarmonicAt = 0;
        this.purity = 0;
        this.partials = null;        // [{ oscA, oscB, gain, n }]
        this.voiceGain = null;
        this.tone = null;
    }

    noteOn() {
        if (this.state === 'on') return;
        const ctx = this.engine.ctx;
        const t = ctx.currentTime;

        this.voiceGain = ctx.createGain();
        this.voiceGain.gain.value = 0.0001;
        this.voiceGain.gain.setTargetAtTime(0.22, t, 1.2);

        // filtro per voce: chiuso quando la posizione e' approssimativa,
        // aperto quando e' giusta
        this.tone = ctx.createBiquadFilter();
        this.tone.type = 'lowpass';
        this.tone.frequency.value = this.def.freq * 4;
        this.tone.Q.value = 0.5;

        this.voiceGain.connect(this.tone);
        this.tone.connect(this.engine.voiceBus);

        this.partials = [];
        for (const n of SERIE) {
            const g = ctx.createGain();
            g.gain.value = 0;
            g.connect(this.voiceGain);
            // due oscillatori appena scordati: il loro battimento e' la
            // "sporcizia" che si riassorbe quando la posa diventa corretta
            const oscA = ctx.createOscillator();
            const oscB = ctx.createOscillator();
            oscA.type = 'sine';
            oscB.type = 'sine';
            oscA.connect(g);
            oscB.connect(g);
            oscA.start();
            oscB.start();
            this.partials.push({ oscA, oscB, gain: g, n });
        }

        this.harmonics = 1;
        this.partials[0].gain.gain.setTargetAtTime(0.5, t, 1.4);
        this.nextHarmonicAt = t + HARMONIC_INTERVAL;
        this.state = 'on';
        this.applyPurity(true);
    }

    /**
     * Il punteggio della retta (0..1) diventa timbro.
     * @param {boolean} immediate salta la rampa (usato all'attacco)
     */
    applyPurity(immediate) {
        if (this.state !== 'on') return;
        const ctx = this.engine.ctx;
        const t = ctx.currentTime;
        const tau = immediate ? 0.01 : 0.25;
        const p = this.purity;
        const err = 1 - p;

        for (const part of this.partials) {
            // parziali stirati: l'errore cresce col numero d'ordine, quindi
            // e' il timbro alto a sporcarsi per primo, come in una campana
            const stretch = 1 + err * 0.014 * part.n;
            const f = this.def.freq * part.n * stretch;
            part.oscA.frequency.setTargetAtTime(f, t, tau);
            part.oscB.frequency.setTargetAtTime(f, t, tau);
            // Il battimento si chiude sulla posa giusta. Il residuo va diviso
            // per l'ordine del parziale: tre centesimi di tono sono un
            // luccichio lento sulla fondamentale (0.2 Hz) ma otto battiti al
            // secondo sul sedicesimo armonico, cioe' ruvidezza. La parte
            // dovuta all'errore invece resta piena: e' li' che deve sporcare.
            const det = 3 / part.n + err * 42;
            part.oscA.detune.setTargetAtTime(-det, t, tau);
            part.oscB.detune.setTargetAtTime(det, t, tau);
        }

        this.tone.frequency.setTargetAtTime(this.def.freq * (3 + p * 14), t, tau);
    }

    setPurity(v) {
        const clamped = Math.max(0, Math.min(1, v));
        if (Math.abs(clamped - this.purity) < 0.01) return;
        this.purity = clamped;
        this.applyPurity(false);
    }

    update() {
        if (this.state !== 'on') return;
        const t = this.engine.ctx.currentTime;
        if (this.harmonics < MAX_HARMONICS && t >= this.nextHarmonicAt) {
            const i = this.harmonics;            // il prossimo della serie
            const part = this.partials[i];
            part.gain.gain.setTargetAtTime(0.5 / part.n, t, 0.9);
            this.harmonics = i + 1;
            this.nextHarmonicAt += HARMONIC_INTERVAL;
        }
    }

    noteOff() {
        if (this.state !== 'on') return;
        const ctx = this.engine.ctx;
        const t = ctx.currentTime;
        const vg = this.voiceGain;
        const parts = this.partials;
        vg.gain.cancelScheduledValues(t);
        vg.gain.setTargetAtTime(0.0001, t, 1.6);
        for (const p of parts) { p.oscA.stop(t + 8); p.oscB.stop(t + 8); }
        const tone = this.tone;
        setTimeout(() => { try { vg.disconnect(); tone.disconnect(); } catch (e) { /* gia' scollegato */ } }, 9000);
        this.voiceGain = null;
        this.tone = null;
        this.partials = null;
        this.harmonics = 0;
        this.state = 'off';
    }
}

export class AudioEngine {
    constructor() {
        this.ctx = null;
        this.voices = [];
    }

    init() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = this.ctx;

        this.voiceBus = ctx.createGain();
        this.voiceBus.gain.value = 0.85;

        // respiro lentissimo sul filtro globale: tiene vivo il drone anche
        // quando nessuna posizione cambia
        this.filter = ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 2200;
        this.filter.Q.value = 0.4;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.05;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 600;
        lfo.connect(lfoGain);
        lfoGain.connect(this.filter.frequency);
        lfo.start();

        this.reverb = ctx.createConvolver();
        this.reverb.buffer = this._makeImpulse(3.6, 2.4);
        this.reverbGain = ctx.createGain();
        this.reverbGain.gain.value = 0.5;

        this.comp = ctx.createDynamicsCompressor();
        this.comp.threshold.value = -18;
        this.comp.ratio.value = 6;

        this.master = ctx.createGain();
        this.master.gain.value = 0.7;

        this.voiceBus.connect(this.filter);
        this.filter.connect(this.comp);
        this.filter.connect(this.reverb);
        this.reverb.connect(this.reverbGain);
        this.reverbGain.connect(this.comp);
        this.comp.connect(this.master);
        this.master.connect(ctx.destination);
    }

    _makeImpulse(seconds, decay) {
        const sr = this.ctx.sampleRate;
        const len = Math.floor(sr * seconds);
        const buf = this.ctx.createBuffer(2, len, sr);
        for (let ch = 0; ch < 2; ch++) {
            const d = buf.getChannelData(ch);
            for (let i = 0; i < len; i++) {
                d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
            }
        }
        return buf;
    }

    /**
     * Cambio di accordo al cambio di asana: le voci vecchie sfumano via da
     * sole (la coda del riverbero le lega alle nuove), quelle nuove partono
     * spente e si accendono solo quando la loro retta si allinea.
     */
    setChord(noteDefs) {
        for (const v of this.voices) v.noteOff();
        this.voices = noteDefs.map(def => new DroneVoice(this, def));
    }

    setActive(i, on) {
        const v = this.voices[i];
        if (!v) return;
        if (on) v.noteOn();
        else v.noteOff();
    }

    setPurity(i, p) {
        const v = this.voices[i];
        if (v) v.setPurity(p);
    }

    update() {
        for (const v of this.voices) v.update();
    }

    harmonicsOf(i) {
        const v = this.voices[i];
        return v && v.state === 'on' ? v.harmonics : 0;
    }

    /** Campana breve al cambio di asana, fuori dalla catena del drone. */
    playChime(up = true) {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const freqs = up ? [660, 880] : [880, 660];
        freqs.forEach((freq, i) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sine';
            o.frequency.value = freq;
            o.connect(g);
            g.connect(this.master);
            const start = t + i * 0.2;
            g.gain.setValueAtTime(0.0001, start);
            g.gain.linearRampToValueAtTime(0.3, start + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
            o.start(start);
            o.stop(start + 0.55);
        });
    }
}
