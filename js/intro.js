// Minianimazione iniziale.
//
// Prima che cominci la pratica l'avatar esegue un'animazione. Due strade, in
// quest'ordine:
//
//   1. intro/intro.anim — un .anim Humanoid di Unity, letto dal parser e dal
//      player gia' scritti per la cartella yoga. E' la strada per chi porta
//      la propria animazione: se il file c'e', vince lui.
//
//   2. altrimenti quella inclusa: Sukhasana che porta le mani a giunte
//      (data/intro-sukhasana.json), suonata da PoseClip sullo stesso
//      meccanismo con cui l'app posa gli asana.
//
// Se la macchina non regge, l'animazione non viene interrotta di colpo:
// sfuma in trasparenza e lascia il posto alla sessione, che e' la parte che
// deve girare fluida.

import { UnityAnimParser } from './vendor/unityAnimParser.js';
import { AnimationPlayer } from './vendor/animationPlayer.js';
import { PoseClip } from './poseClip.js';
import { GUIDE_OPACITY } from './render/avatar.js';

const FADE_OUT_MS = 900;

export class Intro {
    /**
     * @param {GuideAvatar} avatar
     * @param {object} opts { url, clipUrl, baseOpacity, aspect }
     */
    constructor(avatar, opts = {}) {
        this.avatar = avatar;
        this.url = opts.url || './intro/intro.anim';
        this.clipUrl = opts.clipUrl || './data/intro-sukhasana.json';
        this.baseOpacity = opts.baseOpacity !== undefined ? opts.baseOpacity : GUIDE_OPACITY;
        this.stage = opts.stage || null;

        this.state = 'idle';   // idle | playing | fading | done
        this.mode = null;      // 'anim' | 'clip'
        this.player = null;
        this.clip = null;
        this.duration = 0;
        this.startedAt = 0;
        this.fadeFrom = 1;
        this.fadeStart = 0;
        this.fade = 1;
        this.reason = '';
        this.label = '';
    }

    get finished() { return this.state === 'done'; }

    /** Carica e avvia. Restituisce false se non c'e' nulla da suonare. */
    async start() {
        if (!this.avatar || !this.avatar.ready) { this._finish('avatar non disponibile'); return false; }

        if (await this._startAnim()) return true;
        if (await this._startClip()) return true;

        this._finish('nessuna animazione');
        return false;
    }

    /** Animazione fornita dall'utente, in formato .anim di Unity. */
    async _startAnim() {
        try {
            const res = await fetch(this.url, { cache: 'no-cache' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const parser = new UnityAnimParser();
            const animData = parser.parse(await res.text());

            this.player = new AnimationPlayer(this.avatar.model, animData, parser);
            this.duration = parser.getDuration() || 0;
            if (!this.duration) throw new Error('durata nulla');

            this.mode = 'anim';
            this.label = (animData.animationClip && animData.animationClip.m_Name) || 'intro.anim';
            this.avatar.placeCentered(this._box());
            this._begin();
            this.player.play();
            return true;
        } catch (e) {
            console.info('[intro] nessun intro.anim (' + e.message + '): uso l\'animazione inclusa.');
            this.player = null;
            return false;
        }
    }

    /** Sukhasana inclusa: fotogrammi chiave di direzioni, nessun file esterno. */
    async _startClip() {
        try {
            this.clip = await PoseClip.load(this.clipUrl);
            this.duration = this.clip.duration;
            if (!this.duration) throw new Error('durata nulla');

            this.mode = 'clip';
            this.label = this.clip.name;

            // l'inquadratura si fissa una volta sola, sulla posa a mani
            // giunte: rifarla a ogni fotogramma farebbe ballare la scala
            this.avatar.placeCentered(this._box());
            this.avatar.poseFromDirections(this.clip.sample(this.duration * 0.6));
            this.avatar.frameTo(this._box(), 0.7);

            this._begin();
            return true;
        } catch (e) {
            console.warn('[intro] animazione inclusa non caricata:', e);
            this.clip = null;
            return false;
        }
    }

    /** Riquadro visibile su cui inquadrare l'avatar. */
    _box() {
        return this.stage ? this.stage.viewBox : { cx: 0.5, cy: 0.5, w: 1, h: 1 };
    }

    _begin() {
        this.avatar.visible = true;
        this.avatar.setOpacity(this.baseOpacity);
        this.state = 'playing';
        this.startedAt = performance.now();
    }

    /**
     * @param {number} now performance.now()
     * @param {FpsMeter} fps
     */
    update(now, fps) {
        if (this.state === 'idle' || this.state === 'done') return;

        const elapsed = now - this.startedAt;

        if (this.mode === 'clip' && this.clip) {
            this.avatar.poseFromDirections(this.clip.sample(elapsed / 1000));
        }

        if (this.state === 'playing') {
            // la richiesta e' esplicita: sotto i 40 fps l'animazione svanisce
            // invece di continuare a scattare
            if (fps && fps.isSlow) {
                this._beginFade('fps sotto ' + fps.threshold);
            } else if (elapsed >= this.duration * 1000) {
                this._beginFade('animazione conclusa');
            }
        }

        if (this.state === 'fading') {
            const t = (now - this.fadeStart) / FADE_OUT_MS;
            this.fade = Math.max(0, this.fadeFrom * (1 - t));
            this.avatar.setOpacity(this.baseOpacity * this.fade);
            if (t >= 1) {
                if (this.player) this.player.stop();
                this._finish(this.reason);
            }
        }
    }

    _beginFade(reason) {
        this.state = 'fading';
        this.reason = reason;
        this.fadeStart = performance.now();
        this.fadeFrom = this.fade;
    }

    /** Salta l'intro subito. */
    skip() {
        if (this.state === 'done') return;
        if (this.player) this.player.stop();
        this._finish('saltata');
    }

    _finish(reason) {
        this.state = 'done';
        this.reason = reason || this.reason;
        this.fade = 0;
        if (this.player) {
            this.player.dispose();
            this.player = null;
        }
        this.clip = null;
        if (this.avatar) this.avatar.setOpacity(this.baseOpacity);
    }
}
