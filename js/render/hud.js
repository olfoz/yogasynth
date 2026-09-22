// Sovrimpressioni 2D: pentagramma dell'accordo, barra di stato, nome
// dell'asana e barra di avanzamento lungo il bordo dello schermo.
//
// Vive su un canvas 2D separato sopra quello WebGL: sono elementi piatti,
// legati ai pixel e non alla scena, e tenerli fuori dal render 3D evita di
// pagarli a ogni passata di bloom.

export class Hud {
    constructor({ canvas, staff, status, badge }) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.staffEl = staff;
        this.statusEl = status;
        this.badgeEl = badge;
        this.noteEls = [];
    }

    resize(w, h) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.w = w; this.h = h;
    }

    /**
     * Ridisegna il pentagramma quando cambia accordo. Il numero di note non
     * e' fisso: un asana con le braccia piegate ha una retta in piu', quindi
     * una nota in piu'.
     */
    setChord(chord, rays) {
        if (!this.staffEl || !chord) return;
        const notes = chord.notes;
        const midis = notes.map(n => n.midi);
        const lo = Math.min(...midis), hi = Math.max(...midis);
        const span = Math.max(hi - lo, 3);

        const padY = 9, padX = 11;
        const W = Math.max(84, 26 * notes.length + padX * 2);
        const H = 58;
        const yFor = m => H - padY - ((m - lo) / span) * (H - padY * 2);
        const step = notes.length > 1 ? (W - padX * 2) / (notes.length - 1) : 0;

        let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
        for (let i = 0; i < 5; i++) {
            const y = (padY + i * (H - padY * 2) / 4).toFixed(1);
            svg += `<line x1="3" y1="${y}" x2="${W - 3}" y2="${y}" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>`;
        }
        // Il colore NON si fissa qui. Quale retta tiene quale altezza si
        // decide durante la pratica, in ordine di arrivo: lo dipinge
        // updateNotes, fotogramma per fotogramma.
        notes.forEach((n, i) => {
            const color = '#ffffff';
            const cx = (padX + step * i).toFixed(1);
            const cy = yFor(n.midi).toFixed(1);
            svg += `<circle id="ysNote${i}" cx="${cx}" cy="${cy}" r="5.5" `
                 + `fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="1.6"/>`;
        });
        svg += '</svg>';

        this.staffEl.innerHTML =
            `<div class="staff-chord">${chord.symbol}</div>${svg}`;
        this.staffEl.title = `${chord.label} — ${notes.map(n => n.name).join(' · ')}`;
        this.noteEls = notes.map((_, i) => document.getElementById('ysNote' + i));
    }

    /**
     * Una nota si gonfia e si accende con gli armonici che ha accumulato, e
     * prende il colore della retta che in questo momento la sta tenendo.
     * @param {Array<{on, score, harmonics, color}>} voci una per altezza, dal grave
     */
    updateNotes(voci, maxHarmonics) {
        for (let i = 0; i < this.noteEls.length; i++) {
            const c = this.noteEls[i];
            const v = voci[i];
            if (!c || !v) continue;
            const frac = v.harmonics / maxHarmonics;
            const colore = v.color || 'rgba(255,255,255,0.45)';
            c.setAttribute('stroke', colore);
            c.setAttribute('fill', colore);
            c.setAttribute('r', (5.5 + (v.on ? 1.8 : 0) + frac * 1.6).toFixed(1));
            c.setAttribute('fill-opacity', (0.15 + Math.max(v.score, frac) * 0.85).toFixed(2));
            c.style.filter = v.on
                ? `drop-shadow(0 0 ${(3 + frac * 6).toFixed(1)}px ${colore})`
                : 'none';
        }
    }

    setBadge(text) {
        if (this.badgeEl) this.badgeEl.textContent = text;
    }

    setStatus(text) {
        if (this.statusEl) this.statusEl.textContent = text;
    }

    clear() {
        this.ctx.clearRect(0, 0, this.w, this.h);
    }

    /**
     * Barra che percorre il perimetro: un giro continuo basso -> destro ->
     * alto -> sinistro, con la punta piu' brillante della coda.
     */
    drawProgressBorder(frac, color = '#FFB300') {
        if (frac <= 0) return;
        const { ctx, w: W, h: H } = this;
        const total = 2 * (W + H);
        const tBottom = W / total;
        const tRight = (W + H) / total;
        const tTop = (2 * W + H) / total;

        const segFrac = (start, end) => {
            if (frac <= start) return 0;
            if (frac >= end) return 1;
            return (frac - start) / (end - start);
        };

        const inset = 3;
        const drawSeg = (x1, y1, x2, y2) => {
            if (x1 === x2 && y1 === y2) return;
            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineWidth = 5;
            ctx.shadowBlur = 14;
            ctx.shadowColor = color;
            const grad = ctx.createLinearGradient(x1, y1, x2, y2);
            grad.addColorStop(0, 'rgba(255,179,0,0.18)');
            grad.addColorStop(1, color);
            ctx.strokeStyle = grad;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            ctx.restore();
        };

        const fB = segFrac(0, tBottom);
        if (fB > 0) drawSeg(inset, H - inset, inset + (W - 2 * inset) * fB, H - inset);
        const fR = segFrac(tBottom, tRight);
        if (fR > 0) drawSeg(W - inset, H - inset, W - inset, H - inset - (H - 2 * inset) * fR);
        const fT = segFrac(tRight, tTop);
        if (fT > 0) drawSeg(W - inset, inset, W - inset - (W - 2 * inset) * fT, inset);
        const fL = segFrac(tTop, 1);
        if (fL > 0) drawSeg(inset, inset, inset, inset + (H - 2 * inset) * fL);
    }

    /** Nome del nuovo asana, grande quanto ci sta, che compare e sfuma. */
    drawBigName(text, alpha, sub) {
        if (!text || alpha <= 0.01) return;
        const { ctx, w: W, h: H } = this;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let size = Math.min(H * 0.15, W * 0.12, 104);
        const maxW = W * 0.88;
        const font = s => 'bold ' + Math.round(s) + 'px -apple-system, "Segoe UI", sans-serif';
        ctx.font = font(size);
        while (size > 20 && ctx.measureText(text).width > maxW) {
            size -= 3;
            ctx.font = font(size);
        }

        ctx.shadowBlur = 28;
        ctx.shadowColor = `rgba(124,77,255,${(alpha * 0.9).toFixed(2)})`;
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
        ctx.fillText(text, W / 2, H * 0.46);

        if (sub) {
            ctx.shadowBlur = 12;
            ctx.font = Math.round(Math.max(13, size * 0.24)) + 'px -apple-system, "Segoe UI", sans-serif';
            ctx.fillStyle = `rgba(255,255,255,${(alpha * 0.75).toFixed(2)})`;
            ctx.fillText(sub, W / 2, H * 0.46 + size * 0.75);
        }
        ctx.restore();
    }
}
