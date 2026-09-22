// Quale altezza tocca a quale retta.
//
// Le note dell'accordo sono sempre disposte dal grave all'acuto, ma quale
// retta ne prende una non dipende piu' dalla parte del corpo: la prende chi
// arriva. La prima retta che va in posizione suona la nota piu' grave, la
// seconda quella di mezzo, la terza l'acuta. Cosi' l'accordo si costruisce
// sempre dal basso, qualunque pezzo del corpo si sistemi per primo.
//
// Prima l'altezza era legata alla retta — spina grave, braccia media, gambe
// acuta — e chi sistemava le gambe per prime sentiva partire l'acuto da
// solo: un suono senza fondamenta, che non dava l'idea di un accordo che
// cresce.
//
// Un'assegnazione, una volta data, non si tocca finche' quella retta resta
// in posizione: rimescolare le altezze sotto le dita di chi pratica
// produrrebbe salti a meta' di una nota tenuta.

export class VoiceOrder {
    constructor() {
        this.n = 0;
        this.of = [];       // retta -> voce assegnata, -1 se spenta
        this.show = [];     // retta -> voce da MOSTRARE, sempre valida
    }

    /** Da chiamare al cambio di asana: il numero di rette puo' cambiare. */
    setSize(n) {
        this.n = n;
        this.of = new Array(n).fill(-1);
        this.show = new Array(n).fill(0).map((_, i) => i);
    }

    /**
     * @param {boolean[]} active  quali rette sono in posizione adesso
     * @returns {number[]} retta -> voce, -1 per le rette spente
     */
    update(active) {
        if (!this.n) return this.of;

        // chi e' uscito di posizione libera la sua voce
        for (let i = 0; i < this.n; i++) {
            if (!active[i]) this.of[i] = -1;
        }

        const presa = new Array(this.n).fill(false);
        for (let i = 0; i < this.n; i++) {
            if (this.of[i] >= 0) presa[this.of[i]] = true;
        }

        // chi e' appena entrato prende la voce libera piu' grave. A parita'
        // di fotogramma decide l'ordine delle rette, che e' quello delle
        // note: se il corpo va a posto tutto insieme si torna alla
        // disposizione naturale, spina in basso.
        for (let i = 0; i < this.n; i++) {
            if (!active[i] || this.of[i] >= 0) continue;
            for (let v = 0; v < this.n; v++) {
                if (!presa[v]) { this.of[i] = v; presa[v] = true; break; }
            }
        }

        // Cosa scrivere accanto a una retta ancora spenta: la voce che le
        // toccherebbe se entrasse adesso. Serve a non lasciare un buco al
        // posto della nota, e a far leggere in anticipo "se sistemo questa,
        // sentiro' questa".
        const libere = [];
        for (let v = 0; v < this.n; v++) if (!presa[v]) libere.push(v);
        let k = 0;
        for (let i = 0; i < this.n; i++) {
            this.show[i] = this.of[i] >= 0 ? this.of[i] : (libere[k++] ?? 0);
        }

        return this.of;
    }

    /** Quale retta tiene una certa voce, o -1. */
    rayOf(voice) {
        return this.of.indexOf(voice);
    }
}
