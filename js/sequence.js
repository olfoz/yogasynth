// Stato della pratica: quale asana e' in corso, che accordo suona, quando
// si passa al prossimo.
//
// Il giro di basso non e' scritto nei dati asana per asana: avanza di una
// quinta a OGNI cambio, quindi la stessa sequenza fisica continua a girare
// per il circolo delle quinte anche alla seconda ripetizione. Con gli 11
// passi del Saluto al Sole il circolo (12 posizioni) si chiude esattamente
// all'inizio del secondo giro, che riparte da Do.

import { buildChord, rootForStep } from './music/theory.js';
import { asanaPoints, mirrorPoints, buildAsanaRays } from './pose/rays.js';

export class Practice {
    /**
     * @param {object} data     contenuto di data/asanas.json
     * @param {object} opts     { sequenceId, mode: 'sequence'|'random', forcedAsana }
     */
    constructor(data, opts = {}) {
        this.data = data;
        this.rayLibrary = data.rayLibrary;
        this.asanas = data.asanas;
        this.sequences = data.sequences || {};

        this.mode = opts.mode || 'sequence';
        this.sequenceId = opts.sequenceId || Object.keys(this.sequences)[0];
        this.forcedAsana = opts.forcedAsana || null;

        const seq = this.sequences[this.sequenceId];
        this.startRoot = (seq && seq.root) || 'C';

        // Come si comporta il giro di basso quando la sequenza ricomincia.
        //   'spiral'   (default) il circolo delle quinte non si azzera mai:
        //              il Saluto al Sole ha 11 passi e il circolo 12 posizioni,
        //              quindi ogni ripetizione entra in una tonalita' nuova e
        //              si torna a Do dopo dodici saluti.
        //   'perRound' ogni ripetizione riparte dalla fondamentale iniziale:
        //              il primo asana e' sempre Do.
        this.rootMode = (seq && seq.rootMode) || 'spiral';

        this.stepIndex = -1;     // posizione nella sequenza fisica
        this.changeCount = -1;   // cambi totali: e' questo a muovere il circolo delle quinte

        this.current = null;     // asana corrente
        this.rays = [];
        this.chord = null;
        this.targetPts = null;
        this.targetPtsMirror = null;
    }

    /**
     * Riporta la pratica al primo passo, come appena costruita.
     *
     * Azzera anche changeCount, quindi il giro di basso riparte dalla
     * fondamentale della sequenza: "ricomincia" deve voler dire davvero
     * daccapo, non riprendere il circolo delle quinte da dove era.
     */
    reset() {
        this.stepIndex = -1;
        this.changeCount = -1;
        this.current = null;
        this.rays = [];
        this.chord = null;
        this.targetPts = null;
        this.targetPtsMirror = null;
    }

    get steps() {
        const seq = this.sequences[this.sequenceId];
        return (seq && seq.steps && seq.steps.length) ? seq.steps : null;
    }

    get sequenceLabel() {
        const seq = this.sequences[this.sequenceId];
        return seq ? (seq.label || seq.name) : '';
    }

    findAsana(id) {
        return this.asanas.find(a => a.id === id) || this.asanas[0];
    }

    /** Prossimo asana; con commit=false serve solo per l'anteprima "poi: ...". */
    peek(commit) {
        if (this.forcedAsana) {
            return { asana: this.findAsana(this.forcedAsana), stepIndex: 0 };
        }
        if (this.mode === 'sequence' && this.steps) {
            const ni = (this.stepIndex + 1) % this.steps.length;
            if (commit) this.stepIndex = ni;
            return { asana: this.findAsana(this.steps[ni]), stepIndex: ni };
        }
        let pool = this.asanas;
        if (this.asanas.length > 1 && this.current) {
            pool = this.asanas.filter(a => a.id !== this.current.id);
        }
        const asana = pool[Math.floor(Math.random() * pool.length)];
        return { asana, stepIndex: -1 };
    }

    peekLabel() {
        const { asana } = this.peek(false);
        return asana ? (asana.label || asana.name) : 'un nuovo asana';
    }

    /** Passa al prossimo asana e al prossimo accordo del circolo delle quinte. */
    advance() {
        const { asana } = this.peek(true);
        this.changeCount++;
        this.current = asana;
        this.rays = buildAsanaRays(asana, this.rayLibrary);
        this.targetPts = asanaPoints(asana);
        this.targetPtsMirror = mirrorPoints(asanaPoints(asana));

        const useStep = (this.rootMode === 'perRound' && this.mode === 'sequence' && this.steps)
            ? this.stepIndex
            : this.changeCount;
        const root = rootForStep(this.startRoot, useStep);
        this.chord = buildChord(root, asana.quality || 'major', this.rays.length);
        return this.current;
    }

    /** Etichetta di avanzamento, es. "Passo 3/11 - Uttanasana". */
    progressLabel() {
        if (!this.current) return '—';
        const name = this.current.label || this.current.name;
        if (this.mode === 'sequence' && this.steps && !this.forcedAsana) {
            return `Passo ${this.stepIndex + 1}/${this.steps.length} · ${this.current.name}`;
        }
        return this.current.name + (name !== this.current.name ? ' · ' + name : '');
    }

    /** Nota associata a una retta (l'indice della retta e' l'indice della nota). */
    noteFor(rayIndex) {
        return this.chord ? this.chord.notes[rayIndex] : null;
    }

    /** Definizioni passate al motore audio quando cambia l'accordo. */
    noteDefs() {
        if (!this.chord) return [];
        return this.chord.notes.map((n, i) => ({
            freq: n.freq,
            midi: n.midi,
            name: n.name,
            color: this.rays[i] ? this.rays[i].color : '#ffffff'
        }));
    }
}
