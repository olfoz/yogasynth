// Misuratore di fotogrammi al secondo, smussato.
//
// Serve a due cose: far svanire l'animazione iniziale quando la macchina non
// ce la fa, e poter spegnere l'avatar se resta lento anche dopo. Un valore
// istantaneo sfarfalla troppo per decidere, quindi qui si guarda una media
// mobile e si richiede che il calo duri un po' prima di crederci.

export class FpsMeter {
    constructor({ threshold = 40, sustainMs = 1200 } = {}) {
        this.threshold = threshold;
        this.sustainMs = sustainMs;
        this.fps = 60;
        this.lowSince = 0;
        this._last = 0;
    }

    /** @param {number} now timestamp di performance.now() */
    tick(now) {
        if (this._last) {
            const dt = now - this._last;
            if (dt > 0) {
                const inst = 1000 / dt;
                // media mobile esponenziale: ~mezzo secondo di memoria
                this.fps += (inst - this.fps) * 0.08;
            }
        }
        this._last = now;

        if (this.fps < this.threshold) {
            if (!this.lowSince) this.lowSince = now;
        } else {
            this.lowSince = 0;
        }
        return this.fps;
    }

    /** true quando gli fps stanno sotto soglia da abbastanza tempo. */
    get isSlow() {
        return this.lowSince !== 0 && (this._last - this.lowSince) >= this.sustainMs;
    }
}
