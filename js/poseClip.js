// Lettore della minianimazione iniziale scritta in casa.
//
// Un "clip" e' una manciata di fotogrammi chiave, e ogni fotogramma e' un
// elenco di direzioni di segmento (vedi data/intro-sukhasana.json). Fra un
// fotogramma e l'altro le direzioni vengono interpolate e addolcite in
// entrata e in uscita: e' poco piu' di niente, ma basta per un gesto lento
// come portare le mani a giunte, ed evita di dover produrre un .anim di
// Unity per una cosa che l'app sa gia' fare.
//
// Chi fornisce un proprio intro.anim non passa di qui: quello ha la
// precedenza e lo suona AnimationPlayer (vedi js/intro.js).

/** Partenza e arrivo dolci, andatura piena in mezzo. */
function ease(t) {
    return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
}

export class PoseClip {
    /** @param {object} data contenuto del file del clip */
    constructor(data) {
        this.name = data.name || 'clip';
        this.base = data.base || {};
        this.keys = (data.keys || []).slice().sort((a, b) => a.t - b.t);
        this.duration = data.duration
            || (this.keys.length ? this.keys[this.keys.length - 1].t : 0);
        this._out = {};
    }

    static async load(url) {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return new PoseClip(await res.json());
    }

    /**
     * Direzioni al tempo `t`, pronte per GuideAvatar.poseFromDirections.
     * L'oggetto restituito viene riusato: va consumato subito.
     */
    sample(t) {
        const keys = this.keys;
        if (!keys.length) return this.base;

        const time = Math.max(0, Math.min(this.duration, t));
        let i = 0;
        while (i < keys.length - 1 && keys[i + 1].t <= time) i++;

        const a = keys[i];
        const b = keys[Math.min(i + 1, keys.length - 1)];
        const span = b.t - a.t;
        const k = span > 1e-6 ? ease((time - a.t) / span) : 1;

        // si parte dalla base e si sovrascrive solo cio' che i due
        // fotogrammi dichiarano: le gambe, ferme, restano scritte una volta
        const out = this._out;
        for (const key in this.base) out[key] = this.base[key];

        for (const key in a) {
            if (key === 't' || key[0] === '_') continue;
            const va = a[key];
            const vb = (b[key] !== undefined) ? b[key] : va;
            out[key] = [
                va[0] + (vb[0] - va[0]) * k,
                va[1] + (vb[1] - va[1]) * k,
                va[2] + (vb[2] - va[2]) * k
            ];
        }
        // cio' che compare solo nel fotogramma d'arrivo entra da li'
        for (const key in b) {
            if (key === 't' || key[0] === '_' || a[key] !== undefined) continue;
            const vb = b[key];
            const va = out[key] || vb;
            out[key] = [
                va[0] + (vb[0] - va[0]) * k,
                va[1] + (vb[1] - va[1]) * k,
                va[2] + (vb[2] - va[2]) * k
            ];
        }

        return out;
    }
}
