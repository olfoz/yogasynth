// La lezione, lato allievo (lezione.html).
//
// Dal computer dell'insegnante arriva la posa, non l'immagine: dove sono i
// giunti, in 3D, gia' pronti per l'avatar (vedi js/live.js). L'avatar lo
// disegna questa pagina, alla risoluzione di questo schermo. Se l'insegnante
// condivide il video, l'allievo sceglie se vederlo a lato dell'avatar o
// sovrapposto; il video parte solo dopo che l'ha chiesto.
//
// Il collegamento e' quello diretto di js/peer.js: al servizio di incontro
// passano solo le presentazioni, la posa e il video viaggiano da un
// dispositivo all'altro.

import { Stage, MAX_ZOOM } from './render/stage.js';
import { GuideAvatar } from './render/avatar.js';
import { GlowBody } from './render/glowBody.js';
import { buildAsanaRays, addMidpoints } from './pose/rays.js';
import { Inseguitore } from './live.js';
import { caricaPeerJS, caricaIce } from './peer.js';

window.__ysAvviata = true;

const PREFISSO = 'yogasynth-lezione-';
const VISTA_KEY = 'yogasynth.vistaLezione';

// Se l'insegnante non ha ancora aperto la lezione, o la lezione cade, si
// riprova da soli: l'allievo ha gia' fatto la sua parte inquadrando il QR.
const RIPROVA_MS = 4000;
// Oltre questo silenzio la lezione e' "in pausa": collegati, ma non arriva
// niente (l'insegnante e' ancora nella schermata iniziale, o fuori campo).
const SILENZIO_MS = 4000;

// Inquadratura: quanta parte del palco occupa il corpo, e con che calma
// ci si arriva. La misura e' quella del corpo 2D, ma l'avatar sporge un
// poco (la sommita' della testa sta sopra il naso): 0.72 lascia margine.
const RIEMPIMENTO = 0.72;
const SMUSSO_VISTA_S = 0.9;

// Il corpo stilizzato, che si vede mentre l'avatar scarica (24 MB) o se
// l'avatar non arriva affatto: a mezza luce, senza riverbero.
const PUNTI = [0.55, 0.55, 0.55];
const SPENTE = [false, false, false];

const el = id => document.getElementById(id);
const palco = el('palco');
const video = el('video');

// ─── PANNELLO E STATO ────────────────────────────────────────────────────

function pannello(msg, nota, errore, chiediCodice) {
    el('pannelloMsg').textContent = msg;
    el('pannelloNota').textContent = nota || '';
    el('pannelloErr').textContent = errore || '';
    el('rigaCodice').classList.toggle('nascosto', !chiediCodice);
    el('pannello').classList.remove('nascosto');
}

function nascondiPannello() {
    el('pannello').classList.add('nascosto');
}

function stato(testo, dalVivo) {
    const s = el('stato');
    s.textContent = testo;
    s.classList.toggle('dal-vivo', !!dalVivo);
}

window.onerror = (msg, src, riga) => {
    pannello('Errore nella pagina', '', msg + '  (' + (src || '?') + ':' + (riga || '?') + ')');
};

// ─── SCENA ───────────────────────────────────────────────────────────────

const stage = new Stage(palco, video);
// il video dell'insegnante, quando e' sovrapposto, deve leggersi meglio
// della propria webcam velata dell'app: qui e' lui la cosa da guardare
stage.bgMaterial.color.setRGB(0.62, 0.62, 0.68);
stage.setGlow(0.35, 1);

const avatar = new GuideAvatar(stage.scene);
const corpo = new GlowBody(stage.scene);
corpo.visible = false;

function ridimensiona() {
    stage.resize(palco.clientWidth, palco.clientHeight);
}
window.addEventListener('resize', ridimensiona);
window.addEventListener('orientationchange', () => setTimeout(ridimensiona, 200));
video.addEventListener('loadedmetadata', ridimensiona);
ridimensiona();

avatar.load('./avatars/nathan.fbx', e => {
    el('caricamento').textContent = e && e.lengthComputable
        ? 'Avatar in arrivo… ' + Math.round((e.loaded / e.total) * 100) + '%'
        : 'Avatar in arrivo… ' + Math.round(((e && e.loaded) || 0) / 1e6) + ' MB';
})
    .then(() => {
        el('caricamento').textContent = '';
        // qui l'avatar non e' un suggerimento sopra la propria immagine: e'
        // l'insegnante, e deve leggersi pieno
        avatar.setOpacity(0.94);
    })
    .catch(e => {
        console.warn('[lezione] avatar non caricato:', e);
        el('caricamento').textContent = 'Avatar non disponibile: vedi la figura stilizzata.';
    });

fetch('./data/asanas.json')
    .then(r => r.json())
    .then(d => corpo.setRays(buildAsanaRays({ rays: ['spine', 'arms', 'legs'] }, d.rayLibrary)))
    .catch(e => console.warn('[lezione] figura stilizzata senza colori:', e));

// ─── VISTA: SOLO AVATAR, A LATO, SOVRAPPOSTO ─────────────────────────────

let vistaScelta = 'nessuno';
try {
    const v = localStorage.getItem(VISTA_KEY);
    if (v === 'nessuno' || v === 'lato' || v === 'sovrapposto') vistaScelta = v;
} catch (e) { /* archiviazione non disponibile */ }

let videoArrivato = false;
let ultimo = null;          // ultimo stato ricevuto

/** Quella scelta, se il video c'e' davvero; altrimenti solo l'avatar. */
function vistaEffettiva() {
    const condiviso = ultimo && ultimo.video && videoArrivato && video.srcObject;
    return condiviso ? vistaScelta : 'nessuno';
}

function applicaVista() {
    const v = vistaEffettiva();
    const prima = document.body.className;
    document.body.className = 'vista-' + v;
    stage.bgMesh.visible = v === 'sovrapposto';
    for (const b of document.querySelectorAll('#comandi button')) {
        b.classList.toggle('scelto', b.dataset.vista === vistaScelta);
    }
    if (prima !== document.body.className) ridimensiona();
}

for (const b of document.querySelectorAll('#comandi button')) {
    b.addEventListener('click', () => {
        vistaScelta = b.dataset.vista;
        try { localStorage.setItem(VISTA_KEY, vistaScelta); } catch (e) { /* non disponibile */ }
        inviaPreferenza();
        applicaVista();
        aggiornaStato();
    });
}
applicaVista();

// ─── INQUADRATURA ────────────────────────────────────────────────────────

let zoom = 1, zoomT = 1;
let fuoco = null, fuocoT = null;

function riquadro(pts) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const k in pts) {
        if (k === 'shoulderMid' || k === 'hipMid') continue;
        const p = pts[k];
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
 * L'insegnante sta dove sta nel suo fotogramma, magari piccolo e in un
 * angolo: qui la camera si stringe su di lui, come fa "Zoom auto" sul
 * computer. Senza video e' tutto guadagno; con il video sovrapposto
 * ingrandisce anche quello, che resta allineato all'avatar.
 */
function inquadra(pts, dt) {
    const box = pts ? riquadro(pts) : null;
    if (box) {
        fuocoT = { x: box.cx, y: box.cy };
        zoomT = Math.max(1, Math.min(MAX_ZOOM, Math.min(
            (stage.baseW * RIEMPIMENTO) / box.w,
            (stage.baseH * RIEMPIMENTO) / box.h
        )));
    }
    if (!fuocoT) fuocoT = { x: stage.viewport.aspect / 2, y: 0.5 };
    if (!fuoco) fuoco = { x: fuocoT.x, y: fuocoT.y };
    const k = 1 - Math.exp(-dt / SMUSSO_VISTA_S);
    zoom += (zoomT - zoom) * k;
    fuoco.x += (fuocoT.x - fuoco.x) * k;
    fuoco.y += (fuocoT.y - fuoco.y) * k;
    stage.setView(zoom, fuoco.x, fuoco.y);
}

// ─── RICEZIONE ───────────────────────────────────────────────────────────

const inseguitore = new Inseguitore();
let ultimoT = 0;
let ultimoArrivo = 0;
let posato = false;

function accetta(dati) {
    if (!dati || dati.modo !== 'lezione') return;
    // sul canale diretto l'ordine non e' garantito: uno stato piu' vecchio
    // di quello gia' ricevuto si butta (vedi js/peer.js)
    if (dati.t) {
        if (dati.t < ultimoT) return;
        ultimoT = dati.t;
    }
    const videoPrima = ultimo && ultimo.video;
    ultimo = dati;
    ultimoArrivo = performance.now();

    if (dati.aspect && Math.abs(dati.aspect - stage.frameAspect) > 1e-3) {
        stage.frameAspect = dati.aspect;
        ridimensiona();
    }
    inseguitore.imposta({ body: dati.body || null, live: dati.live || null });

    nascondiPannello();
    if (!!videoPrima !== !!dati.video) applicaVista();
    aggiornaStato();
}

function aggiornaStato() {
    if (!collegato) return;
    if (!ultimo || performance.now() - ultimoArrivo > SILENZIO_MS) {
        stato(ultimo ? "in pausa — l'insegnante non sta trasmettendo" : 'collegato, in attesa');
        return;
    }
    let testo = 'dal vivo';
    if (vistaScelta !== 'nessuno') {
        if (!ultimo.video) testo += ' · il video non è condiviso';
        else if (!videoArrivato) testo += ' · video in arrivo…';
    }
    stato(testo, true);
}

function puntiCorpo(body) {
    if (!body) return null;
    const out = {};
    let qualcuno = false;
    for (const k in body) {
        out[k] = { x: body[k][0], y: body[k][1] };
        qualcuno = true;
    }
    return qualcuno ? addMidpoints(out) : null;
}

let precedente = 0;
function fotogramma(ora) {
    requestAnimationFrame(fotogramma);
    const dt = precedente ? Math.min(0.1, (ora - precedente) / 1000) : 0.016;
    precedente = ora;

    const s = inseguitore.passo(dt);
    const pts = s ? puntiCorpo(s.body) : null;
    inquadra(pts, dt);

    if (avatar.ready && s && s.live) {
        avatar.poseLive(s.live);
        posato = true;
    }
    avatar.visible = avatar.ready && posato;

    // la figura stilizzata solo finche' l'avatar non c'e'
    const figura = !avatar.ready && !!pts;
    corpo.visible = figura;
    if (figura) corpo.update(pts, PUNTI, SPENTE, ora / 1000, dt);

    stage.setGlow(0.35, dt);
    stage.render();
}
requestAnimationFrame(fotogramma);
setInterval(aggiornaStato, 1000);

// ─── COLLEGAMENTO ────────────────────────────────────────────────────────

let peer = null;
let conn = null;
let codice = '';
let collegato = false;
let riprova = null;

function inviaPreferenza() {
    if (!conn || !conn.open) return;
    try { conn.send({ tipo: 'video', vuole: vistaScelta !== 'nessuno' }); }
    catch (e) { /* connessione morente: se ne accorge 'close' */ }
}

function chiudiPeer() {
    collegato = false;
    if (conn) { try { conn.close(); } catch (e) { /* gia' chiusa */ } }
    if (peer) { try { peer.destroy(); } catch (e) { /* gia' distrutto */ } }
    conn = null;
    peer = null;
}

function riprovaFra(msg, nota) {
    chiudiPeer();
    pannello(msg, nota, '', true);
    stato('non collegato');
    clearTimeout(riprova);
    riprova = setTimeout(() => collega(codice), RIPROVA_MS);
}

async function collega(c) {
    codice = String(c || '').trim().toLowerCase();
    if (!codice) {
        pannello("Ti serve il codice della lezione.",
            "Inquadra il QR che ti mostra l'insegnante, oppure scrivi qui il codice.", '', true);
        return;
    }
    clearTimeout(riprova);
    el('codice').value = codice;
    if (location.hash.replace('#', '') !== codice) history.replaceState(null, '', '#' + codice);
    chiudiPeer();
    stato('collegamento…');
    if (!ultimo) pannello('Collegamento alla lezione…', 'codice ' + codice);

    let Peer, ice;
    try {
        Peer = await caricaPeerJS();
        ice = await caricaIce();
    } catch (e) {
        pannello('Non riesco a collegarmi alla lezione.', 'Serve una connessione a internet.', e.message, true);
        return;
    }

    const mio = new Peer(null, { debug: 0, config: ice });
    peer = mio;

    mio.on('open', () => {
        if (peer !== mio) return;
        const c2 = mio.connect(PREFISSO + codice, {
            // dal vivo: meglio perdere un aggiornamento che accodarne di vecchi
            reliable: false,
            serialization: 'json'
        });
        conn = c2;
        c2.on('open', () => {
            collegato = true;
            inviaPreferenza();
            if (!ultimo) {
                pannello("Sei dentro la lezione.", "Appena l'insegnante comincia, qui compare il suo avatar.");
            }
            aggiornaStato();
        });
        c2.on('data', accetta);
        c2.on('close', () => {
            if (conn !== c2) return;
            riprovaFra('La lezione si è interrotta.', 'Riprovo a collegarmi da solo…');
        });
    });

    // il video arriva come chiamata dell'insegnante, a senso unico
    mio.on('call', chiamata => {
        chiamata.answer();
        chiamata.on('stream', stream => {
            video.srcObject = stream;
            const p = video.play();
            if (p && p.catch) p.catch(() => {});
            videoArrivato = true;
            applicaVista();
            aggiornaStato();
        });
        const fine = () => {
            videoArrivato = false;
            video.srcObject = null;
            applicaVista();
            aggiornaStato();
        };
        chiamata.on('close', fine);
        chiamata.on('error', fine);
    });

    mio.on('error', err => {
        if (peer !== mio) return;
        const tipo = (err && err.type) || '';
        if (tipo === 'peer-unavailable') {
            riprovaFra("La lezione non è ancora aperta.",
                "Aspetto che l'insegnante prema «Invita gli allievi»: riprovo da solo ogni pochi secondi. "
                + 'Se il codice è sbagliato, correggilo qui sotto.');
        } else if (tipo === 'negotiation-failed') {
            riprovaFra("Ho trovato l'insegnante, ma non riusciamo a parlarci.",
                'Capita con alcune reti aziendali o di albergo. Riprovo da solo; se non passa, prova un’altra rete.');
        } else {
            riprovaFra('Collegamento non riuscito.', (err && err.message) || String(err));
        }
    });
}

el('collega').addEventListener('click', () => collega(el('codice').value));
el('codice').addEventListener('keydown', e => {
    if (e.key === 'Enter') collega(el('codice').value);
});

// schermo sempre acceso, dove si puo': in mezzo a una posizione non si ha
// una mano libera per risvegliarlo
if (navigator.wakeLock && navigator.wakeLock.request) {
    const tieni = () => navigator.wakeLock.request('screen').catch(() => {});
    tieni();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') tieni();
    });
}

collega((location.hash || '').replace('#', ''));
