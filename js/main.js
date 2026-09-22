// yogasynth — far suonare il proprio corpo attraverso lo yoga.
//
// Il ciclo e' questo: un asana propone delle rette; le rette compaiono come
// raggi cosmici su cui adagiare il corpo; ogni retta e' una nota dell'accordo
// dell'asana; la nota si accende quando la retta e' allineata, si fa piu'
// pura quanto piu' la posizione e' corretta, e guadagna un armonico per ogni
// secondo di tenuta. Quando tutte le rette tengono insieme, si passa
// all'asana successivo e il basso avanza di una quinta.

import { Stage, MAX_ZOOM } from './render/stage.js';
import { RaysView } from './render/raysView.js';
import { GlowBody } from './render/glowBody.js';
import { GuideAvatar } from './render/avatar.js';
import { Hud } from './render/hud.js';
import { PoseTracker } from './pose/tracker.js';
import { RayTracker, userPoints, fitLine, addMidpoints } from './pose/rays.js';
import { AudioEngine, MAX_HARMONICS } from './music/synth.js';
import { Practice } from './sequence.js';
import { FpsMeter } from './fps.js';
import { Intro } from './intro.js';
import { Schermo } from './schermo.js';
import { PeerHost } from './peer.js';
import { mostraQr } from './qr.js';

const HOLD_SECONDS = 6;            // tenuta dell'asana completo per superarlo
const POSITION_TIMEOUT_MS = 30000; // oltre questo tempo si passa comunque avanti
const NAME_REVEAL_MS = 2400;
const DONE_PAUSE_MS = 3200;

// Inquadratura automatica: quanta parte dello schermo deve occupare il corpo,
// e quanto lentamente ci si arriva. Lento apposta — un inseguimento nervoso
// e' peggio di un'inquadratura larga.
const FRAME_FILL = 0.82;
const VIEW_SMOOTH_S = 1.1;

const params = new URLSearchParams(location.search);

// ─── DOM ─────────────────────────────────────────────────────────────────
const el = id => document.getElementById(id);
const video = el('vid');
const stageEl = el('stage');
const hudCanvas = el('hudCanvas');

const hud = new Hud({
    canvas: hudCanvas,
    staff: el('chordStaff'),
    status: el('statusBar'),
    badge: el('asanaBadge')
});

// ─── STATO ───────────────────────────────────────────────────────────────
let data = null;
let practice = null;
let stage = null;
let raysView = null;
let glowBody = null;
let avatar = null;
let audio = null;
let tracker = null;
let poseTracker = null;
let intro = null;
let schermo = null;
let peer = null;
const fps = new FpsMeter({ threshold: 40 });

let running = false;
let showAvatar = true;
let showBody = true;
let showRays = true;
let avatarAutoDisabled = false;

let state = 'matching';    // matching | done
let holdStart = 0;
let doneUntil = 0;
let asanaChangedAt = 0;
let completed = 0;
let lastFrame = 0;

// vista: zoom e messa a fuoco, smussati
// Spento di serie: l'inquadratura che insegue il corpo aiuta chi sta
// lontano, ma a chi e' gia' inquadrato bene da' solo l'impressione che
// la scena si muova da sola. Si accende dall'interruttore.
let autoZoom = false;
let viewZoom = 1, targetZoom = 1;
let viewFocus = null, targetFocus = null;

// ─── DATI ────────────────────────────────────────────────────────────────
async function loadData() {
    const res = await fetch('./data/asanas.json');
    if (!res.ok) throw new Error('data/asanas.json non raggiungibile (HTTP ' + res.status + ')');
    return res.json();
}

/**
 * Porta l'asana sul corpo dell'utente: stessa origine sul bacino, stessa
 * scala del busto. Senza questo, i raggi finirebbero dove l'utente non e'.
 */
function anchorTarget(tPts, uPts, aspect) {
    let fn;
    if (uPts && uPts.hipMid && uPts.shoulderMid && tPts.hipMid && tPts.shoulderMid) {
        const uT = Math.hypot(uPts.shoulderMid.x - uPts.hipMid.x, uPts.shoulderMid.y - uPts.hipMid.y);
        const tT = Math.hypot(tPts.shoulderMid.x - tPts.hipMid.x, tPts.shoulderMid.y - tPts.hipMid.y);
        const s = tT > 1e-6 ? uT / tT : 1;
        fn = p => ({
            x: (p.x - tPts.hipMid.x) * s + uPts.hipMid.x,
            y: (p.y - tPts.hipMid.y) * s + uPts.hipMid.y
        });
    } else {
        // nessuno inquadrato: l'asana si mostra comunque, centrato
        let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
        for (const k in tPts) {
            minY = Math.min(minY, tPts[k].y); maxY = Math.max(maxY, tPts[k].y);
            minX = Math.min(minX, tPts[k].x); maxX = Math.max(maxX, tPts[k].x);
        }
        const s = 0.66 / Math.max(1e-6, maxY - minY);
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        fn = p => ({ x: (p.x - cx) * s + aspect / 2, y: (p.y - cy) * s + 0.5 });
    }

    const out = {};
    for (const k in tPts) out[k] = fn(tPts[k]);
    return out;
}

/** Riquadro occupato dal corpo, in spazio isotropo. */
function bodyBox(uPts) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const k in uPts) {
        if (k === 'shoulderMid' || k === 'hipMid') continue;
        const p = uPts[k];
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    if (minX === Infinity) return null;
    return {
        cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
        w: Math.max(1e-3, maxX - minX), h: Math.max(1e-3, maxY - minY)
    };
}

/**
 * Tiene il corpo grande e centrato qualunque sia la distanza dalla webcam.
 *
 * La webcam ha il campo visivo che ha: per starci dentro in piedi bisogna
 * mettersi lontani, e da lontano ci si vede piccoli. Qui si rimedia dove si
 * puo', cioe' a valle: il riquadro della camera ortografica si stringe
 * attorno al corpo. E' ingrandimento digitale, quindi l'immagine perde
 * definizione, ma il corpo, i raggi e l'avatar diventano leggibili.
 *
 * La messa a fuoco segue il corpo anche a zoom manuale: ingrandire e
 * guardare da un'altra parte non servirebbe a niente.
 */
function updateView(uPts, dt) {
    const box = uPts ? bodyBox(uPts) : null;
    if (box) {
        targetFocus = { x: box.cx, y: box.cy };
        if (autoZoom) {
            targetZoom = Math.max(1, Math.min(MAX_ZOOM, Math.min(
                (stage.baseW * FRAME_FILL) / box.w,
                (stage.baseH * FRAME_FILL) / box.h
            )));
        }
    }
    if (!targetFocus) targetFocus = { x: stage.viewport.aspect / 2, y: 0.5 };
    if (!viewFocus) viewFocus = { x: targetFocus.x, y: targetFocus.y };

    const k = 1 - Math.exp(-dt / VIEW_SMOOTH_S);
    viewZoom += (targetZoom - viewZoom) * k;
    viewFocus.x += (targetFocus.x - viewFocus.x) * k;
    viewFocus.y += (targetFocus.y - viewFocus.y) * k;
    stage.setView(viewZoom, viewFocus.x, viewFocus.y);
}

/** Avviso sulla distanza, quando l'inquadratura da sola non basta. */
function distanceHint(uPts) {
    const box = uPts ? bodyBox(uPts) : null;
    if (!box) return '';
    if (box.h > 0.97 || box.w > stage.viewport.aspect * 0.97) return "  ·  esci dall'inquadratura: arretra un po'";
    if (viewZoom >= MAX_ZOOM - 0.05 && box.h < 0.34) return '  ·  sei molto lontano: avvicinati se puoi';
    return '';
}

// ─── CAMBIO ASANA ────────────────────────────────────────────────────────
function goToNextAsana(announce) {
    practice.advance();

    tracker.setRays(practice.rays);
    raysView.setRays(practice.rays);
    glowBody.setRays(practice.rays);
    audio.setChord(practice.noteDefs());
    hud.setChord(practice.chord, practice.rays);
    hud.setBadge(practice.progressLabel() + '  ·  ' + practice.chord.symbol);

    asanaChangedAt = performance.now();
    state = 'matching';
    holdStart = 0;

    if (announce) speak(practice.current.name);
}

function speak(name) {
    if (!name || !('speechSynthesis' in window)) return;
    try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(name);
        u.lang = 'it-IT';
        u.rate = 0.95;
        u.volume = 0.9;
        speechSynthesis.speak(u);
    } catch (e) {
        console.warn('Sintesi vocale non disponibile:', e);
    }
}

// ─── STATO A SCHERMO ─────────────────────────────────────────────────────
function describe(uPts, res) {
    if (state === 'done') {
        return `\u{1F9D8} Asana completato (${completed}) — poi: ${practice.peekLabel()}...`;
    }
    if (!uPts) {
        return 'Mettiti davanti alla webcam, di profilo, con tutto il corpo inquadrato...';
    }
    const allOn = res.active.every(Boolean);
    if (allOn) {
        return `${practice.chord.symbol} completo — mantieni, ogni secondo aggiunge un armonico`;
    }
    return practice.rays.map((r, i) => {
        const note = practice.noteFor(i);
        const n = note ? note.name : '';
        const cov = res.coverage ? res.coverage[i] : 1;
        if (cov < 0.4) return `${r.label} — fuori campo`;
        const partial = cov < 0.85 ? '·' : '';
        return res.active[i]
            ? `${r.label} ✓ ${n}${partial}`
            : `${r.label} ${Math.round((res.scores[i] || 0) * 100)}%${partial}`;
    }).join('  ·  ') + distanceHint(uPts);
}

// ─── CICLO ───────────────────────────────────────────────────────────────
function loop(now) {
    if (!running) return;
    requestAnimationFrame(loop);

    fps.tick(now);
    const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0.016;
    lastFrame = now;
    const time = now / 1000;

    // durante l'intro l'avatar balla per conto suo: niente IK, niente rette
    if (intro && !intro.finished) {
        intro.update(now, fps);
        hud.clear();
        hud.setStatus(intro.state === 'fading'
            ? `${intro.label} — dissolvenza (${intro.reason})...`
            : `${intro.label}...`);
        stage.render();
        if (schermo && schermo.active) {
            const snap = { asana: intro.label, cue: 'Animazione iniziale', rays: [], body: null, progress: 0 };
            schermo.send(snap);
            if (peer && peer.collegati) peer.send(snap);
        }
        if (intro.finished) startPractice();
        return;
    }

    const vp = stage.viewport;
    const uPts = userPoints(poseTracker.landmarks, vp.aspect);
    updateView(uPts, dt);

    // stato e punteggi si calcolano insieme: se in questo stesso fotogramma
    // si cambia asana, il punteggio viene subito rifatto sul nuovo bersaglio
    let res, holdFrac = 0;
    if (state === 'matching') {
        res = tracker.update(uPts, practice.targetPts, practice.targetPtsMirror);
        if (res.active.length && res.active.every(Boolean)) {
            if (!holdStart) holdStart = now;
            holdFrac = Math.min(1, (now - holdStart) / (HOLD_SECONDS * 1000));
            if (holdFrac >= 1) {
                completed++;
                state = 'done';
                doneUntil = now + DONE_PAUSE_MS;
                holdStart = 0;
                audio.playChime(true);
            }
        } else {
            holdStart = 0;
        }

        if (state === 'matching' && now - asanaChangedAt >= POSITION_TIMEOUT_MS) {
            audio.playChime(false);
            goToNextAsana(true);
            res = tracker.update(uPts, practice.targetPts, practice.targetPtsMirror);
        }
    } else {
        res = {
            scores: tracker.smooth,
            active: tracker.active.map(() => false),
            mirrored: tracker.mirrored,
            details: []
        };
        if (now >= doneUntil) {
            goToNextAsana(false);
            res = tracker.update(uPts, practice.targetPts, practice.targetPtsMirror);
        }
    }

    // audio: la retta accende la nota, il punteggio ne decide la purezza
    for (let i = 0; i < practice.rays.length; i++) {
        audio.setActive(i, res.active[i]);
        audio.setPurity(i, Math.max(0, Math.min(1, ((res.scores[i] || 0) - 0.35) / 0.6)));
    }
    audio.update();

    // bersaglio portato sul corpo: da qui escono sia i raggi sia l'avatar
    const basePts = res.mirrored ? practice.targetPtsMirror : practice.targetPts;
    const anchored = addMidpoints(anchorTarget(basePts, uPts, vp.aspect));

    const fits = practice.rays.map(r => fitLine(r.joints.map(j => anchored[j])));
    const bounds = {
        width: stage.camera.right - stage.camera.left,
        height: stage.camera.top - stage.camera.bottom
    };

    // il bagliore segue l'accordo: quante note stanno suonando davvero
    const accese = res.active.reduce((n, a) => n + (a ? 1 : 0), 0);
    stage.setGlow(practice.rays.length ? accese / practice.rays.length : 0, dt);

    raysView.visible = showRays;
    if (showRays) raysView.update(fits, res.scores, res.active, bounds, time, dt);

    glowBody.visible = showBody;
    if (showBody) glowBody.update(uPts, res.scores, res.active, time, dt);

    // se la macchina non regge, l'avatar e' la prima cosa che si spegne:
    // rette e suono devono restare fluidi
    if (avatar && avatar.ready) {
        if (showAvatar && fps.isSlow && !avatarAutoDisabled) {
            avatarAutoDisabled = true;
            console.info('[yogasynth] avatar disattivato: fps sotto soglia');
        }
        const on = showAvatar && !avatarAutoDisabled;
        avatar.visible = on;
        if (on) {
            const view = practice.current.view || 'front';
            const facing = res.mirrored
                ? (practice.current.facing === 'left' ? 'right' : 'left')
                : (practice.current.facing || 'right');
            avatar.fitTo(anchored, view, facing);
            avatar.poseTo(anchored, view);
        }
    }

    // avanzamento perimetrale: prima meta' = quanto ci si avvicina,
    // seconda meta' = la tenuta finale
    let progress = 0;
    if (state === 'matching') {
        if (res.active.length && res.active.every(Boolean)) {
            progress = 0.5 + 0.5 * holdFrac;
        } else {
            const avg = res.scores.reduce((s, v) => s + v, 0) / Math.max(1, res.scores.length);
            progress = Math.min(0.5, Math.max(0, avg) * 0.7);
        }
    }

    const since = now - asanaChangedAt;
    let nameAlpha = 0;
    if (since >= 0 && since < NAME_REVEAL_MS) {
        const t = since / NAME_REVEAL_MS;
        nameAlpha = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
    }

    hud.clear();
    if (state === 'matching') hud.drawProgressBorder(progress);
    hud.drawBigName(practice.current.name, nameAlpha, practice.chord.symbol + '  ·  ' + practice.current.cue);
    hud.updateNotes(res.scores, res.active, i => audio.harmonicsOf(i), MAX_HARMONICS);
    hud.setStatus(describe(uPts, res));

    stage.render();

    if (schermo && schermo.active) {
        const snap = Schermo.snapshot({
            practice, res, uPts, fits,
            aspect: vp.aspect,
            progress, state, audio,
            maxHarmonics: MAX_HARMONICS
        });
        schermo.send(snap);                       // ponte sulla rete locale
        if (peer && peer.collegati) peer.send(snap);   // collegamento diretto
    }
}

function startPractice() {
    goToNextAsana(false);
    asanaChangedAt = performance.now();
}

/**
 * Riparte da capo senza smontare niente.
 *
 * Ricaricare la pagina sarebbe equivalente per la pratica, ma butterebbe
 * via webcam, avatar e soprattutto il collegamento col telefono, che
 * andrebbe rifatto col QR ogni volta. Qui si azzerano solo i contatori:
 * telefono, ponte e modello restano dove sono.
 */
function ricomincia() {
    if (!running || !practice) return;
    practice.reset();
    completed = 0;
    doneUntil = 0;
    holdStart = 0;
    state = 'matching';
    if (tracker) tracker.reset();
    startPractice();
    hud.setStatus('Si ricomincia da ' + practice.current.name + '.');
}

// ─── AVVIO ───────────────────────────────────────────────────────────────
function resizeAll() {
    const vp = stage.resize();
    hud.resize(vp.width, vp.height);
}

async function start() {
    el('startPopup').classList.add('hidden');
    el('overlay').classList.add('hidden');
    const loading = el('loadingContainer');
    const pbar = el('progressBar');
    const ptext = el('progressText');
    loading.classList.add('active');

    // modalita'
    const modeVal = el('modeSelect').value;
    localStorage.setItem('yogasynth.mode', modeVal);
    const mode = modeVal === 'random' ? 'random' : 'sequence';
    const sequenceId = mode === 'sequence'
        ? (modeVal.split(':')[1] || Object.keys(data.sequences)[0])
        : Object.keys(data.sequences)[0];

    practice = new Practice(data, {
        mode,
        sequenceId,
        forcedAsana: params.get('asana')
    });

    showAvatar = el('avatarCheckbox').checked;

    // webcam
    ptext.textContent = 'Attivazione webcam...';
    poseTracker = new PoseTracker(video);
    try {
        await poseTracker.openCamera(el('cameraSelect').value);
    } catch (e) {
        ptext.textContent = 'Webcam non accessibile: ' + e.message;
        return;
    }

    stage = new Stage(stageEl, video);
    resizeAll();
    setupManualZoom(stageEl);
    // la scheda del telefono lascia il popup e diventa quella fissa in basso
    const scheda = el('castCard');
    if (scheda && scheda.parentElement !== document.body) {
        document.body.appendChild(scheda);
        scheda.classList.remove('in-popup');
    }
    video.addEventListener('loadedmetadata', resizeAll);
    window.addEventListener('resize', resizeAll);

    raysView = new RaysView(stage.scene);
    glowBody = new GlowBody(stage.scene);
    tracker = new RayTracker();

    audio = new AudioEngine();
    audio.init();
    if (audio.ctx.state === 'suspended') audio.ctx.resume();

    // avatar (facoltativo: se non carica, restano raggi e suono)
    // L'avatar NON blocca l'avvio.
    //
    // nathan.fbx pesa 24 MB: tutto il resto dell'app sta in mezzo megabyte.
    // Aspettarlo prima di far cominciare la pratica significherebbe, su una
    // connessione lenta, restare un minuto davanti a una barra di
    // caricamento. Parte in sottofondo e compare quando e' pronto; nel
    // frattempo raggi e suono funzionano gia'.
    if (showAvatar) caricaAvatar();

    pbar.style.width = '70%';
    ptext.textContent = 'Caricamento MediaPipe Pose...';
    poseTracker.onFirstResult = () => {
        pbar.style.width = '100%';
        setTimeout(() => loading.classList.remove('active'), 400);
    };
    await poseTracker.startPose();

    // minianimazione iniziale: vuole l'avatar, che potrebbe essere ancora in
    // viaggio. Gli si concede un attimo, poi si comincia comunque.
    if (showAvatar && caricaAvatar._inCorso) {
        await Promise.race([
            caricaAvatar._inCorso,
            new Promise(r => setTimeout(r, 4000))
        ]);
    }
    if (avatar && avatar.ready) {
        // durante l'intro la posa la detta l'animazione, non un asana:
        // e' Intro a mettere in scala e inquadrare l'avatar
        intro = new Intro(avatar, {
            url: './intro/intro.anim',
            clipUrl: './data/intro-sukhasana.json',
            stage
        });
        const ok = await intro.start();
        if (!ok) startPractice();
    } else {
        startPractice();
    }

    running = true;
    lastFrame = 0;
    requestAnimationFrame(loop);
}

/**
 * Scarica il modello dell'avatar, una volta sola, in sottofondo.
 * Se non arriva, l'app prosegue senza: raggi e suono non ne hanno bisogno.
 */
function caricaAvatar() {
    if (avatar || caricaAvatar._inCorso) return caricaAvatar._inCorso;
    const nota = el('statusBar');
    const candidato = new GuideAvatar(stage.scene);

    caricaAvatar._inCorso = candidato.load('./avatars/nathan.fbx')
        .then(() => {
            avatar = candidato;
            return avatar;
        })
        .catch(e => {
            console.warn('[yogasynth] avatar non caricato, si prosegue senza:', e);
            caricaAvatar._inCorso = null;
            showAvatar = false;
            el('avatarCheckbox').checked = false;
            el('avatarToggle').classList.remove('active');
            if (nota) nota.textContent = 'Avatar non disponibile: si prosegue con i soli raggi.';
            return null;
        });
    return caricaAvatar._inCorso;
}

// ─── UI ──────────────────────────────────────────────────────────────────

/**
 * Rotella e pizzico regolano lo zoom a mano. Toccarlo spegne
 * l'inseguimento automatico: se si e' scelta un'inquadratura, l'app non
 * deve rimetterci mano da sola.
 */
function setupManualZoom(target) {
    const apply = factor => {
        setAutoZoom(false);
        targetZoom = Math.max(1, Math.min(MAX_ZOOM, targetZoom * factor));
    };

    target.addEventListener('wheel', e => {
        e.preventDefault();
        apply(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });

    let pinchStart = 0, zoomStart = 1;
    const spread = t => Math.hypot(
        t[0].clientX - t[1].clientX,
        t[0].clientY - t[1].clientY
    );
    target.addEventListener('touchstart', e => {
        if (e.touches.length !== 2) return;
        pinchStart = spread(e.touches);
        zoomStart = targetZoom;
    }, { passive: true });
    target.addEventListener('touchmove', e => {
        if (e.touches.length !== 2 || !pinchStart) return;
        e.preventDefault();
        setAutoZoom(false);
        targetZoom = Math.max(1, Math.min(MAX_ZOOM, zoomStart * (spread(e.touches) / pinchStart)));
    }, { passive: false });
    target.addEventListener('touchend', () => { pinchStart = 0; }, { passive: true });
}

/**
 * Accende o spegne l'invio al telefono, e mostra l'indirizzo da aprire.
 * L'indirizzo lo sa solo il server (il browser, su localhost, non conosce
 * l'IP di rete di questo computer), quindi glielo si chiede.
 */
/**
 * Accende o spegne l'invio al telefono.
 *
 * Al telefono serve UNA cosa sola: un indirizzo che contenga gia' il codice
 * (`.../schermo.html#orso-7133`). Da li' si collega da solo, per la strada
 * che trova aperta — il ponte sulla rete locale se c'e', altrimenti il
 * collegamento diretto. Percio' la scheda mostra un indirizzo e un QR, non
 * due strade fra cui scegliere.
 */
async function toggleSchermo(on) {
    if (!schermo) return;
    const card = el('castCard');

    if (!on) {
        schermo.stop();
        if (peer) peer.stop();
        card.classList.add('hidden');
        return;
    }

    schermo.start();
    card.classList.remove('hidden');
    el('castUrl').textContent = 'preparo il collegamento…';
    el('castNote').textContent = '';

    // Il ponte c'e' solo se il sito gira da tools/serve.py. Su un sito
    // pubblicato non c'e' e non c'e' niente di sbagliato: il collegamento
    // diretto non ne ha bisogno.
    const urlPonte = await Schermo.phoneUrl();
    const codice = peer ? await peer.start() : null;

    // base dell'indirizzo: quella del ponte se raggiungibile (resta in rete
    // locale, piu' veloce), altrimenti quella del sito da cui siamo aperti
    const base = urlPonte
        ? urlPonte.replace(/schermo\.html.*$/, '')
        : location.href.replace(/[^/]*$/, '');
    const link = base + 'schermo.html' + (codice ? '#' + codice : '');

    el('castUrl').textContent = link;
    el('castNote').innerHTML = codice
        ? 'Inquadra il codice, oppure scrivi l’indirizzo. '
          + 'Se serve a mano, il codice è <span class="codice">' + codice + '</span>.'
        : 'Inquadra il codice, oppure scrivi l’indirizzo.';

    if (!codice) {
        el('castPeer').textContent = urlPonte
            ? 'Collegamento diretto non disponibile: resta il ponte sulla rete locale.'
            : 'Collegamento diretto non disponibile e nessun ponte: il telefono non potra’ collegarsi.';
    }

    mostraQr(el('castQr'), link);
}

function setAutoZoom(on) {
    if (autoZoom === on) return;
    autoZoom = on;
    const cb = el('zoomCheckbox'), sw = el('zoomToggle');
    if (cb) cb.checked = on;
    if (sw) sw.classList.toggle('active', on);
}
function setupToggle(switchId, checkboxId, onChange) {
    const sw = el(switchId), cb = el(checkboxId);
    sw.addEventListener('click', () => {
        cb.checked = !cb.checked;
        sw.classList.toggle('active', cb.checked);
        onChange(cb.checked);
    });
}

function buildModeSelect() {
    const sel = el('modeSelect');
    sel.innerHTML = '';
    for (const id in data.sequences) {
        const s = data.sequences[id];
        const o = document.createElement('option');
        o.value = 'sequence:' + id;
        o.textContent = (s.label || s.name) + ' (in ordine)';
        sel.appendChild(o);
    }
    const o = document.createElement('option');
    o.value = 'random';
    o.textContent = 'Asana a caso';
    sel.appendChild(o);

    const saved = localStorage.getItem('yogasynth.mode');
    if (saved && [...sel.options].some(x => x.value === saved)) sel.value = saved;
    const urlSeq = params.get('sequence');
    if (urlSeq) sel.value = 'sequence:' + urlSeq;
    else if (params.get('mode') === 'random') sel.value = 'random';
}

/** Anteprima dell'accordo nel popup iniziale, prima ancora di partire. */
function fillIntroText() {
    const seqId = Object.keys(data.sequences)[0];
    const preview = new Practice(data, { mode: 'sequence', sequenceId: seqId });
    const rows = [];
    const steps = preview.steps || [];
    for (let i = 0; i < Math.min(steps.length, 6); i++) {
        preview.advance();
        rows.push(`<b>${preview.current.name}</b> → ${preview.chord.symbol}`);
    }
    el('chordPreview').innerHTML = rows.join(' · ') + ' · …';
}

(async function boot() {
    // la rete di sicurezza in index.html aspetta questo segnale
    window.__ysAvviata = true;
    try {
        data = await loadData();
    } catch (e) {
        el('statusBar').textContent =
            'Dati non caricati: ' + e.message + '. Apri la cartella da un server locale, non con doppio clic sul file.';
        console.error(e);
        return;
    }
    buildModeSelect();
    fillIntroText();

    // Esistono gia' prima di INIZIA: il telefono si collega dalla schermata
    // iniziale. Nessuno dei due contatta la rete finche' non lo si accende.
    schermo = new Schermo();
    peer = new PeerHost((testo, dettaglio) => {
        const nota = el('castPeer');
        if (nota) nota.textContent = dettaglio ? testo + ' — ' + dettaglio : testo;
    });
    PoseTracker.listCameras(el('cameraSelect'), false);
    el('camRefresh').addEventListener('click', () => PoseTracker.listCameras(el('cameraSelect'), true));
    el('startButton').addEventListener('click', start);

    setupToggle('avatarToggle', 'avatarCheckbox', v => {
        showAvatar = v;
        avatarAutoDisabled = false;   // scelta esplicita: riprova comunque
        // acceso a sessione avviata: si scarica adesso, se non c'e' gia'
        if (v && stage && !avatar) caricaAvatar();
    });
    setupToggle('zoomToggle', 'zoomCheckbox', v => {
        autoZoom = v;
        if (v) targetZoom = 1;   // riparte dall'inquadratura larga e si richiude da se'
    });
    setupToggle('castToggle', 'castCheckbox', v => toggleSchermo(v));

    // Collegamento al telefono PRIMA di cominciare: si inquadra il QR, si
    // appoggia il telefono davanti a se', e solo dopo si preme INIZIA. Non
    // parte da solo perche' PeerJS sono novanta chilobyte e un giro sul
    // servizio di incontro: chi non usa il secondo schermo non li paga.
    el('pairButton').addEventListener('click', async () => {
        const b = el('pairButton');
        b.disabled = true;
        b.textContent = 'collegamento…';
        el('castCheckbox').checked = true;
        el('castToggle').classList.add('active');
        await toggleSchermo(true);
        b.textContent = 'Telefono collegato? Premi INIZIA';
        // il popup e' piu' alto dello schermo: senza questo il QR compare
        // sotto la piega e sembra che il pulsante non abbia fatto niente
        const card = el('castCard');
        if (card && card.scrollIntoView) {
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });
    setupToggle('bodyToggle', 'bodyCheckbox', v => showBody = v);
    setupToggle('raysToggle', 'raysCheckbox', v => showRays = v);
    el('restartButton').addEventListener('click', ricomincia);
})();
