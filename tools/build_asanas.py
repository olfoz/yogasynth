#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genera i landmark degli asana in data/asanas.json.

Un asana non si scrive a mano coordinata per coordinata: cosi' le lunghezze
dei segmenti finirebbero diverse da posa a posa, e l'app userebbe quelle
lunghezze per ancorare l'asana sul corpo dell'utente (anchorTarget divide per
la lunghezza del busto). Un busto piu' corto del dovuto scalerebbe l'intero
asana, raggi compresi.

Qui invece ogni asana e' una catena di ANGOLI su uno scheletro unico, e le
coordinate sono un risultato. Le proporzioni restano identiche in tutte le
pose, per costruzione.

Angoli in gradi, misurati da +x (destra) con y verso il basso, come sullo
schermo: -90 = verso l'alto, +90 = verso il basso, 0 = in avanti (il corpo
guarda verso destra).

    python tools/build_asanas.py          # riscrive data/asanas.json
    python tools/build_asanas.py --check  # stampa e basta
"""

import io
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'data', 'asanas.json')

# ─── Scheletro canonico ──────────────────────────────────────────────────
# Non sono proporzioni inventate: sono quelle misurate su avatars/nathan.fbx,
# fra le ossa che corrispondono ai landmark di MediaPipe (upperleg = anca,
# upperarm = spalla, lowerarm = gomito, hand = polso, lowerleg = ginocchio,
# foot = caviglia, head = naso).
#
# Devono combaciare, altrimenti l'avatar guida non riesce a stare sui raggi:
# con un busto piu' corto del suo, la spalla del modello finisce piu' in alto
# del landmark, le braccia risultano gia' tese e la mano non arriva mai al
# bersaglio. Misurate col banco di prova tools/banco-avatar.html.
PROPORTIONS = {
    'torso':    0.3486,   # anca -> spalla, misurata sulla mediana
    'head':     0.1322,   # spalla -> naso, proporzione umana (vedi sotto)
    'upperArm': 0.1603,   # spalla -> gomito
    'foreArm':  0.1553,   # gomito -> polso
    'thigh':    0.2669,   # anca -> ginocchio
    'shin':     0.2523,   # ginocchio -> caviglia
}
# Il busto va misurato sulla MEDIANA: l'osso della spalla sta una ventina di
# unita' fuori asse, e prendere la distanza diretta anca->spalla lo gonfierebbe
# (61 invece di 58 unita' FBX), alzando la spalla del modello rispetto al
# landmark. Di conseguenza le braccia risulterebbero gia' tese e la mano non
# arriverebbe mai al bersaglio.
#
# 'head' e' l'unica voce che NON viene dal modello: l'osso della testa sta alla
# base del cranio, mentre il landmark 'nose' di MediaPipe — quello che l'app
# legge da una persona vera — sta molto piu' avanti. I dati devono somigliare a
# una persona, non al rig; a rimettere in bolla il modello ci pensa
# _headTarget() in js/render/avatar.js.

# Lunghezza della catena caviglia -> naso da corpo disteso, in frazione del
# riquadro. Conta solo la forma (l'app riancora tutto sul corpo dell'utente):
# serve a far stare le pose dentro 0..1.
CHAIN = 0.76
SEG = dict((k, v * CHAIN) for k, v in PROPORTIONS.items())

# Distanza fra il lato sinistro e il destro nei dati. Di profilo i due lati
# quasi si sovrappongono: e' l'avatar 3D a riprendere la propria larghezza
# vera (vedi js/render/avatar.js), qui serve solo a non far coincidere i punti.
HALF_WIDTH = 0.010


def chain(origin, steps):
    """Concatena segmenti: [(lunghezza, angolo), ...] -> lista di punti."""
    x, y = origin
    pts = [(x, y)]
    for length, angle in steps:
        r = math.radians(angle)
        x += length * math.cos(r)
        y += length * math.sin(r)
        pts.append((x, y))
    return pts


def build(pose):
    """Angoli -> i 13 landmark. L'anca e' l'origine, poi si ricentra."""
    a = pose['angles']
    hip = (0.0, 0.0)

    _, shoulder, nose = chain(hip, [
        (SEG['torso'], a['spine']),
        (SEG['head'], a['head']),
    ])
    _, knee, ankle = chain(hip, [
        (SEG['thigh'], a['thigh']),
        (SEG['shin'], a['shin']),
    ])
    _, elbow, wrist = chain(shoulder, [
        (SEG['upperArm'], a['upperArm']),
        (SEG['foreArm'], a['foreArm']),
    ])

    mid = {
        'nose': nose, 'shoulder': shoulder, 'elbow': elbow, 'wrist': wrist,
        'hip': hip, 'knee': knee, 'ankle': ankle,
    }

    # la posa entra nel riquadro: conta solo la forma, perche' l'app riancora
    # tutto sul bacino dell'utente, ma tenerla dentro 0..1 rende i dati
    # leggibili e il ripiego "centrato" corretto
    xs = [p[0] for p in mid.values()]
    ys = [p[1] for p in mid.values()]
    dx = 0.5 - (min(xs) + max(xs)) / 2
    dy = 0.5 - (min(ys) + max(ys)) / 2

    out = {}
    for name, (x, y) in mid.items():
        x, y = round(x + dx, 4), round(y + dy, 4)
        if name == 'nose':
            out['nose'] = [x, y]
        else:
            key = name[0].upper() + name[1:]
            out['l' + key] = [round(x - HALF_WIDTH, 4), y]
            out['r' + key] = [round(x + HALF_WIDTH, 4), y]

    order = ['nose', 'lShoulder', 'rShoulder', 'lElbow', 'rElbow',
             'lWrist', 'rWrist', 'lHip', 'rHip', 'lKnee', 'rKnee',
             'lAnkle', 'rAnkle']
    return dict((k, out[k]) for k in order)


# ─── Surya Namaskara A, tutto di profilo, corpo rivolto a destra ─────────
POSES = [
    {
        'id': 'tadasana', 'name': 'Tadasana', 'label': 'Montagna',
        'quality': 'major', 'rays': ['spine', 'arms', 'legs'],
        'cue': "Una sola colonna: caviglie, bacino, spalle e testa sullo stesso raggio.",
        # in piedi, braccia lungo i fianchi: tutto a piombo
        'angles': {'spine': -90, 'head': -86, 'upperArm': 92, 'foreArm': 90,
                   'thigh': 90, 'shin': 90},
    },
    {
        'id': 'urdhva-hastasana', 'name': 'Urdhva Hastasana', 'label': 'Braccia al cielo',
        'quality': 'major', 'rays': ['spine', 'arms', 'legs'],
        'cue': "Le braccia prolungano la spina dorsale verso l'alto: un unico raggio dai talloni alle dita.",
        # braccia sopra la testa, leggero slancio all'indietro
        'angles': {'spine': -92, 'head': -84, 'upperArm': -84, 'foreArm': -88,
                   'thigh': 90, 'shin': 90},
    },
    {
        'id': 'uttanasana', 'name': 'Uttanasana', 'label': 'Piegamento in avanti',
        'quality': 'sus2', 'rays': ['spine', 'upperArms', 'legs', 'foreArms'],
        'cue': "Gambe a piombo, busto che cade lungo il loro raggio. Le braccia sono piegate: due raggi distinti, quindi una quarta nota.",
        # busto rovesciato lungo le gambe, mani a terra: i gomiti devono
        # piegarsi molto, ed e' per questo che l'asana ha quattro rette
        'angles': {'spine': 85, 'head': 78, 'upperArm': 108, 'foreArm': 22,
                   'thigh': 90, 'shin': 90},
    },
    {
        'id': 'ardha-uttanasana', 'name': 'Ardha Uttanasana', 'label': 'Mezzo piegamento',
        'quality': 'sus2', 'rays': ['spine', 'arms', 'legs'],
        'cue': "Schiena piatta come un raggio orizzontale, perpendicolare al raggio delle gambe.",
        # schiena piatta e orizzontale, sguardo avanti, dita alle tibie
        'angles': {'spine': 2, 'head': -8, 'upperArm': 108, 'foreArm': 112,
                   'thigh': 90, 'shin': 90},
    },
    {
        'id': 'chaturanga-dandasana', 'name': 'Chaturanga Dandasana', 'label': 'Bastone su quattro appoggi',
        'quality': 'sus2', 'rays': ['spine', 'upperArms', 'legs', 'foreArms'],
        'cue': "Dalla testa ai talloni un raggio solo. Gomiti a novanta gradi: avambracci a piombo, secondo raggio.",
        # corpo teso in diagonale, gomiti a 90 gradi stretti alle costole:
        # braccio all'indietro, avambraccio a piombo
        'angles': {'spine': -8, 'head': -8, 'upperArm': 160, 'foreArm': 82,
                   'thigh': 172, 'shin': 172},
    },
    {
        'id': 'urdhva-mukha-svanasana', 'name': 'Urdhva Mukha Svanasana', 'label': 'Cane a testa in su',
        'quality': 'minor', 'rays': ['spine', 'arms', 'legs'],
        'cue': "Braccia a piombo come colonne. Il busto sale in diagonale, le gambe scendono sulla diagonale opposta.",
        # petto aperto in salita, braccia tese a piombo. Le gambe scendono
        # quel tanto che basta perche' le caviglie tocchino il pavimento
        # all'altezza delle mani: in questa posa sono i due appoggi a terra.
        'angles': {'spine': -30, 'head': -18, 'upperArm': 88, 'foreArm': 90,
                   'thigh': 165, 'shin': 165},
    },
    {
        'id': 'adho-mukha-svanasana', 'name': 'Adho Mukha Svanasana', 'label': 'Cane a testa in giu\'',
        'quality': 'minor', 'rays': ['spine', 'arms', 'legs'],
        'cue': "Braccia e schiena sullo stesso raggio, dalle mani al bacino. Le gambe aprono il secondo lato della V.",
        # La V rovesciata: braccia e schiena su un'unica retta (stesso
        # angolo), gambe sull'altro lato, bacino al vertice. I due lati non
        # sono simmetrici: anca->mano (busto piu' braccio) e' piu' lungo di
        # anca->caviglia, quindi per posare mani e piedi sullo stesso
        # pavimento il lato delle braccia sta piu' disteso di quello delle
        # gambe. Con il bacino a 0.36 dal suolo: asin(0.36/0.537)=42 gradi
        # per le braccia, asin(0.36/0.386)=69 gradi per le gambe.
        'angles': {'spine': 42, 'head': 42, 'upperArm': 42, 'foreArm': 42,
                   'thigh': 111, 'shin': 111},
    },
]

RAY_LIBRARY = {
    "spine": {"label": "Spina dorsale", "joints": ["hipMid", "shoulderMid", "nose"],
              "color": "#7C4DFF", "rgb": "124,77,255"},
    "arms": {"label": "Arti superiori", "joints": ["lWrist", "lElbow", "lShoulder", "rShoulder", "rElbow", "rWrist"],
             "color": "#00E5FF", "rgb": "0,229,255"},
    "legs": {"label": "Arti inferiori", "joints": ["lAnkle", "lKnee", "lHip", "rHip", "rKnee", "rAnkle"],
             "color": "#FFB300", "rgb": "255,179,0"},
    "upperArms": {"label": "Braccia", "joints": ["lElbow", "lShoulder", "rShoulder", "rElbow"],
                  "color": "#00E5FF", "rgb": "0,229,255"},
    "foreArms": {"label": "Avambracci", "joints": ["lWrist", "lElbow", "rElbow", "rWrist"],
                 "color": "#69F0AE", "rgb": "105,240,174"},
}

DOC = {
    "_generato": "Non modificare a mano: questo file lo scrive tools/build_asanas.py a partire dagli angoli delle pose. Cosi' tutte le asana condividono lo stesso scheletro e le stesse lunghezze dei segmenti.",
    "spazio": "Coordinate 2D normalizzate nel riquadro 0..1 x 0..1, y verso il basso (come MediaPipe). Il renderer ancora e scala la posa sul corpo reale, quindi conta la FORMA, non la posizione assoluta.",
    "view": "'profile' = corpo di taglio rispetto alla telecamera (Surya Namaskara), 'front' = corpo frontale. L'avatar viene ruotato di conseguenza, la posa resta sempre rivolta verso la telecamera.",
    "facing": "Solo per view=profile: verso in cui guarda il corpo nei dati. Il matcher prova comunque anche la versione specchiata, quindi l'utente puo' mettersi di profilo da un lato o dall'altro.",
    "rays": "Le rette su cui adagiare il corpo. L'ordine delle note lo impone comunque l'app: spine -> 1a nota (fondamentale, nel basso), arti superiori -> 2a, arti inferiori -> 3a, rette in piu' -> note successive.",
    "quality": "Qualita' dell'accordo dell'asana. La fondamentale non e' qui: viene dal circolo delle quinte, che avanza di una quinta a ogni cambio di asana.",
    "rootMode": "'spiral' (default): il circolo delle quinte non si azzera mai. Con 11 passi e 12 posizioni ogni ripetizione del saluto entra in una tonalita' nuova e si torna a Do dopo dodici saluti. 'perRound': ogni ripetizione riparte da Do.",
}

SEQUENCE_STEPS = [
    'tadasana', 'urdhva-hastasana', 'uttanasana', 'ardha-uttanasana',
    'chaturanga-dandasana', 'urdhva-mukha-svanasana', 'adho-mukha-svanasana',
    'ardha-uttanasana', 'uttanasana', 'urdhva-hastasana', 'tadasana',
]


def main():
    asanas = []
    for pose in POSES:
        asanas.append({
            'id': pose['id'],
            'name': pose['name'],
            'label': pose['label'],
            'view': 'profile',
            'facing': 'right',
            'quality': pose['quality'],
            'rays': pose['rays'],
            'cue': pose['cue'],
            'angles': pose['angles'],
            'landmarks': build(pose),
        })

    doc = {
        '_doc': DOC,
        'rayLibrary': RAY_LIBRARY,
        'asanas': asanas,
        'sequences': {
            'surya-namaskara-a': {
                'name': 'Surya Namaskara A',
                'label': 'Saluto al Sole A',
                'root': 'C',
                'rootMode': 'spiral',
                'steps': SEQUENCE_STEPS,
            }
        },
    }

    report(asanas)
    if '--check' in sys.argv:
        return
    with io.open(OUT, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print('\nscritto ' + os.path.relpath(OUT, ROOT))


def report(asanas):
    """Controllo: le lunghezze devono essere identiche in tutte le pose."""
    def d(p, q):
        return math.hypot(p[0] - q[0], p[1] - q[1])

    print('%-24s %-7s %-7s %-7s %-7s  riquadro y' % ('asana', 'busto', 'coscia', 'braccio', 'testa'))
    for a in asanas:
        L = a['landmarks']
        sh = [(L['lShoulder'][i] + L['rShoulder'][i]) / 2 for i in (0, 1)]
        hp = [(L['lHip'][i] + L['rHip'][i]) / 2 for i in (0, 1)]
        ys = [v[1] for v in L.values()]
        print('%-24s %-7.4f %-7.4f %-7.4f %-7.4f  %.2f..%.2f' % (
            a['id'], d(sh, hp), d(L['lHip'], L['lKnee']),
            d(L['lShoulder'], L['lElbow']), d(sh, L['nose']),
            min(ys), max(ys)))


if __name__ == '__main__':
    main()
