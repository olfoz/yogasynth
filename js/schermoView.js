/*
 * Il disegno della scena sul secondo schermo.
 *
 * Sta in un file suo, e non e' un modulo ES: si carica con un normale
 * <script src>. Due motivi. Il primo e' che questa pagina deve aprirsi anche
 * su un iPad vecchio, dove i moduli e le import map non ci sono. Il secondo
 * e' che tenendo il disegno separato dal trasporto si puo' provare da solo,
 * dandogli uno stato finto (tools/banco-schermo.html): una pagina che sta
 * sempre in attesa di rete non si riesce a fotografare.
 *
 * Il telefono riceve POSIZIONI, non immagini: qui si ricostruisce la scena.
 */
(function (global) {
    'use strict';

    // tratti che tengono insieme il busto: esistono anche sul computer, e
    // non appartengono a nessuna retta
    var NEUTRAL = [
        ['lShoulder', 'rShoulder'], ['lHip', 'rHip'],
        ['shoulderMid', 'hipMid'], ['lShoulder', 'lHip'], ['rShoulder', 'rHip']
    ];

    // Quanta parte dello schermo deve occupare il corpo. Il resto serve ai
    // raggi, che devono vedersi entrare e uscire dai bordi.
    var FILL = 0.62;

    // Ingrandimento massimo rispetto al fotogramma intero. Serve un tetto:
    // una posa raccolta come Uttanasana ha un ingombro piccolo, e riempire
    // comunque lo schermo con quella la porterebbe a cinque volte il vero,
    // trasformando gli arti in macchie e facendo perdere di vista i raggi.
    // Stesso tetto che usa il computer (MAX_ZOOM in js/render/stage.js).
    var MAX_ZOOM = 2.6;

    // Quanto lentamente l'inquadratura insegue il corpo. Lento apposta: un
    // inseguimento nervoso, su uno schermo appoggiato per terra, da' fastidio.
    var FOLLOW = 0.06;

    function View(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.w = 1;
        this.h = 1;
        this.view = null;      // {s, cx, cy} smussati fra un fotogramma e l'altro
    }

    View.prototype.resize = function (w, h) {
        var dpr = Math.min(global.devicePixelRatio || 1, 2);
        this.w = w;
        this.h = h;
        this.canvas.width = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    /** Riquadro occupato dal corpo, nello spazio dei landmark. */
    function bodyBox(body) {
        if (!body) { return null; }
        var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, any = false;
        for (var k in body) {
            if (!body.hasOwnProperty(k)) { continue; }
            if (k === 'shoulderMid' || k === 'hipMid') { continue; }
            var p = body[k];
            if (p[0] < minX) { minX = p[0]; }
            if (p[0] > maxX) { maxX = p[0]; }
            if (p[1] < minY) { minY = p[1]; }
            if (p[1] > maxY) { maxY = p[1]; }
            any = true;
        }
        if (!any) { return null; }
        return {
            cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
            w: Math.max(0.02, maxX - minX), h: Math.max(0.02, maxY - minY)
        };
    }

    /*
     * Dallo spazio dei landmark (x da 0 ad `aspect`, y da 0 a 1) ai pixel.
     *
     * Stessa scala sui due assi, altrimenti gli angoli del corpo si
     * deformerebbero e un'asana dritta sembrerebbe storta.
     *
     * E l'inquadratura si stringe sul corpo, come fa il computer: senza,
     * una persona ripresa da tre metri resterebbe un francobollo in mezzo
     * allo schermo del telefono, che e' esattamente il problema che questo
     * secondo schermo dovrebbe risolvere.
     */
    View.prototype._mapper = function (snap) {
        var a = (snap && snap.aspect) || 4 / 3;
        var fitAll = Math.min(this.w / a, this.h);

        var s = fitAll, cx = a / 2, cy = 0.5;
        var box = bodyBox(snap && snap.body);
        if (box) {
            s = Math.min(this.w * FILL / box.w, this.h * FILL / box.h);
            // ne' piu' piccolo del fotogramma intero, ne' talmente stretto da
            // perdere di vista i raggi quando il rilevamento traballa
            s = Math.max(fitAll * 0.9, Math.min(s, fitAll * MAX_ZOOM));
            cx = box.cx;
            cy = box.cy;
        }

        if (!this.view) {
            this.view = { s: s, cx: cx, cy: cy };      // primo fotogramma: ci si mette subito
        } else {
            this.view.s += (s - this.view.s) * FOLLOW;
            this.view.cx += (cx - this.view.cx) * FOLLOW;
            this.view.cy += (cy - this.view.cy) * FOLLOW;
        }

        var v = this.view;
        var ox = this.w / 2 - v.cx * v.s;
        var oy = this.h / 2 - v.cy * v.s;
        return {
            x: function (t) { return ox + t * v.s; },
            y: function (t) { return oy + t * v.s; },
            s: v.s
        };
    };

    View.prototype._background = function () {
        var ctx = this.ctx, W = this.w, H = this.h;
        ctx.fillStyle = '#05060b';
        ctx.fillRect(0, 0, W, H);
        var g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.max(W, H) * 0.7);
        g.addColorStop(0, 'rgba(40,28,80,0.55)');
        g.addColorStop(1, 'rgba(5,6,11,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    };

    /** Un raggio cosmico: centro e direzione, la lunghezza esce dallo schermo. */
    View.prototype._ray = function (ray, m, time) {
        if (!ray.fit) { return; }
        var ctx = this.ctx;
        var cx = m.x(ray.fit.cx), cy = m.y(ray.fit.cy);
        var L = Math.sqrt(this.w * this.w + this.h * this.h);
        var x1 = cx - ray.fit.dx * L, y1 = cy - ray.fit.dy * L;
        var x2 = cx + ray.fit.dx * L, y2 = cy + ray.fit.dy * L;

        var score = ray.score || 0;
        var pulse = ray.active ? 1 + 0.12 * Math.sin(time * 3.4) : 1;

        ctx.save();
        ctx.lineCap = 'round';

        // alone largo e morbido
        ctx.globalAlpha = (0.07 + score * 0.15) * pulse;
        ctx.strokeStyle = ray.color;
        ctx.lineWidth = m.s * (0.04 + score * 0.025);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

        // nucleo, che si stringe e si accende man mano che la posa e' giusta
        ctx.globalAlpha = 0.35 + score * 0.65;
        ctx.lineWidth = Math.max(1, m.s * (0.011 - score * 0.004));
        ctx.shadowBlur = 18 + score * 26;
        ctx.shadowColor = ray.color;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.restore();
    };

    View.prototype._seg = function (body, a, b, m, color, width, alpha, glow, glowColor) {
        var p = body[a], q = body[b];
        if (!p || !q) { return; }
        var ctx = this.ctx;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = width;
        if (glow) { ctx.shadowBlur = glow; ctx.shadowColor = glowColor || color; }
        ctx.beginPath();
        ctx.moveTo(m.x(p[0]), m.y(p[1]));
        ctx.lineTo(m.x(q[0]), m.y(q[1]));
        ctx.stroke();
        ctx.restore();
    };

    View.prototype._body = function (snap, m) {
        var body = snap.body;
        if (!body) { return; }
        var ctx = this.ctx, i, j;

        // tutto proporzionato al busto, come sul computer: cosi' lo spessore
        // resta giusto sia da vicino sia da lontano
        var torso = 0.2;
        if (body.shoulderMid && body.hipMid) {
            torso = Math.sqrt(
                Math.pow(body.shoulderMid[0] - body.hipMid[0], 2) +
                Math.pow(body.shoulderMid[1] - body.hipMid[1], 2)
            );
        }
        // Il corpo si disegna BIANCO, con il colore della retta solo come
        // alone. Sul computer gli arti sono colorati e spessi, perche' devono
        // spiccare sopra l'immagine della webcam; qui la webcam non c'e', e
        // arti dello stesso colore dei raggi si confondevano con i raggi
        // stessi. Bianco sopra colorato si legge a colpo d'occhio: il corpo
        // e' dentro il fascio, oppure no.
        var limb = Math.max(2.5, torso * 0.075 * m.s);

        for (i = 0; i < NEUTRAL.length; i++) {
            this._seg(body, NEUTRAL[i][0], NEUTRAL[i][1], m, '#ffffff', limb * 0.8, 0.55, 8, '#8fa0ff');
        }

        // ogni arto prende il colore della retta che genera: si vede a occhio
        // quale parte del corpo sta facendo suonare quale nota
        var rays = snap.rays || [];
        for (i = 0; i < rays.length; i++) {
            var ray = rays[i];
            var score = ray.score || 0;
            for (j = 0; j < (ray.segs || []).length; j++) {
                var a = ray.segs[j][0], b = ray.segs[j][1];
                // i tratti che attraversano il corpo chiudono la catena della
                // retta, non sono arti: non vanno disegnati
                if ((a.charAt(0) === 'l' && b.charAt(0) === 'r') ||
                    (a.charAt(0) === 'r' && b.charAt(0) === 'l')) { continue; }
                // tratto bianco, alone del colore della retta: piu' acceso
                // quanto piu' la posizione e' corretta
                this._seg(body, a, b, m, '#ffffff', limb,
                    0.55 + score * 0.45, ray.active ? 20 + score * 20 : 10, ray.color);
            }
        }

        // un punto su ogni giunto: aiuta a capire dove sta il corpo quando
        // gli arti si sovrappongono
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.9;
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#ffffff';
        for (var key in body) {
            if (!body.hasOwnProperty(key)) { continue; }
            if (key === 'nose' || key === 'shoulderMid' || key === 'hipMid') { continue; }
            ctx.beginPath();
            ctx.arc(m.x(body[key][0]), m.y(body[key][1]), limb * 0.85, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        if (body.nose) {
            ctx.save();
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = 0.9;
            ctx.shadowBlur = 16;
            ctx.shadowColor = '#ffffff';
            ctx.beginPath();
            ctx.arc(m.x(body.nose[0]), m.y(body.nose[1]), Math.max(3, torso * 0.13 * m.s), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    };

    /** Barra di avanzamento lungo il perimetro, come sul computer. */
    View.prototype._progress = function (snap) {
        var frac = snap.progress || 0;
        if (frac <= 0) { return; }
        var ctx = this.ctx, W = this.w, H = this.h;
        var total = 2 * (W + H), inset = 3;
        var tB = W / total, tR = (W + H) / total, tT = (2 * W + H) / total;
        function part(a, b) {
            return frac <= a ? 0 : frac >= b ? 1 : (frac - a) / (b - a);
        }
        ctx.save();
        ctx.strokeStyle = '#FFB300';
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#FFB300';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        function line(x1, y1, x2, y2) {
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        }
        var f;
        f = part(0, tB);  if (f > 0) { line(inset, H - inset, inset + (W - 2 * inset) * f, H - inset); }
        f = part(tB, tR); if (f > 0) { line(W - inset, H - inset, W - inset, H - inset - (H - 2 * inset) * f); }
        f = part(tR, tT); if (f > 0) { line(W - inset, inset, W - inset - (W - 2 * inset) * f, inset); }
        f = part(tT, 1);  if (f > 0) { line(inset, inset, inset, inset + (H - 2 * inset) * f); }
        ctx.restore();
    };

    /** Disegna tutto. `time` in secondi, serve alla pulsazione dei raggi. */
    View.prototype.render = function (snap, time) {
        this._background();
        if (!snap) { return; }
        var m = this._mapper(snap);
        var rays = snap.rays || [];
        for (var i = 0; i < rays.length; i++) { this._ray(rays[i], m, time || 0); }
        this._body(snap, m);
        this._progress(snap);
    };

    /** Aggiorna le scritte. `els` raccoglie gli elementi della pagina. */
    View.prototype.text = function (snap, els) {
        if (!snap) { return; }
        els.asana.textContent = snap.asana || '—';
        els.chord.textContent = snap.chord || '';
        els.step.textContent = snap.step || '';
        els.cue.textContent = snap.done ? 'Completato.' : (snap.cue || '');

        var rays = snap.rays || [];
        if (els.notes.childElementCount !== rays.length) {
            els.notes.innerHTML = '';
            for (var i = 0; i < rays.length; i++) {
                els.notes.appendChild(document.createElement('span'));
            }
        }
        for (var k = 0; k < rays.length; k++) {
            var ray = rays[k];
            var el = els.notes.children[k];
            el.className = 'note' + (ray.active ? ' on' : '');
            el.style.color = ray.color;
            // un puntino per ogni armonico guadagnato tenendo la posizione
            var dots = '';
            for (var d = 0; d < Math.min(ray.harmonics || 0, 8); d++) { dots += '·'; }
            el.textContent = ray.note + (dots ? ' ' + dots : '');
        }
    };

    global.SchermoView = View;
}(window));
