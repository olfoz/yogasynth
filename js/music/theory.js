// Teoria musicale di yogasynth.
//
// Due sorgenti indipendenti decidono l'accordo di un asana:
//   - la FONDAMENTALE viene dal circolo delle quinte, che avanza di un passo
//     a ogni cambio di asana e non dipende da quale asana sia;
//   - la QUALITA' (maggiore / minore / sus2 / sus4) e il NUMERO DI NOTE
//     vengono dall'asana: tante note quante sono le rette su cui si adagia
//     il corpo.
// Cosi' il Saluto al Sole partito da Do da' esattamente C, G, Dsus2, Asus2,
// Esus2, Bm, F#m... e continua a girare anche dopo il primo giro.

export const CIRCLE_OF_FIFTHS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'];

const PITCH_CLASS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Nomi "da leggere" delle fondamentali: il circolo sale per quinte, quindi
// dopo F# conviene continuare con i diesis invece di passare ai bemolli.
const ROOT_LABEL = {
    'C': 'Do', 'G': 'Sol', 'D': 'Re', 'A': 'La', 'E': 'Mi', 'B': 'Si',
    'F#': 'Fa#', 'C#': 'Do#', 'G#': 'Sol#', 'D#': 'Re#', 'A#': 'La#', 'F': 'Fa'
};

const QUALITY = {
    major: { suffix: '', label: 'maggiore', intervals: [0, 4, 7] },
    minor: { suffix: 'm', label: 'minore', intervals: [0, 3, 7] },
    sus2:  { suffix: 'sus2', label: 'sus2', intervals: [0, 2, 7] },
    sus4:  { suffix: 'sus4', label: 'sus4', intervals: [0, 5, 7] }
};

// Registri fissi, uno per "fascia" di voci. Senza questo ancoraggio il
// circolo delle quinte, salendo di una quinta a ogni asana, farebbe scappare
// l'accordo verso l'acuto giro dopo giro: qui invece ogni voce ricade sempre
// nella propria ottava, e l'accordo si muove per giro di basso restando
// nello stesso registro (e' il "armonizzando" della progressione).
const BASS_OCTAVE_MIDI = 36;    // Do2: la fondamentale, cioe' la spina dorsale
const CHORD_OCTAVE_MIDI = 48;   // Do3: pavimento delle voci superiori

export function noteToMidi(name) {
    const m = /^([A-G])([#b]?)(-?\d+)$/.exec(String(name).trim());
    if (!m) return 60;
    const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
    return (parseInt(m[3], 10) + 1) * 12 + PITCH_CLASS[m[1]] + acc;
}

export function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

const MIDI_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToName(midi) {
    return MIDI_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

function rootPitchClass(root) {
    const m = /^([A-G])([#b]?)$/.exec(root);
    if (!m) return 0;
    const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
    return (PITCH_CLASS[m[1]] + acc + 12) % 12;
}

/**
 * Costruisce l'accordo di un asana.
 *
 * @param {string} root      fondamentale dal circolo delle quinte ('C', 'G', ...)
 * @param {string} quality   'major' | 'minor' | 'sus2' | 'sus4'
 * @param {number} noteCount quante note servono = quante rette ha l'asana
 * @returns {{root, quality, symbol, label, notes: Array<{midi, name, freq, degree}>}}
 */
export function buildChord(root, quality, noteCount) {
    const q = QUALITY[quality] || QUALITY.major;
    const pc = rootPitchClass(root);

    const notes = [];
    let prev = -Infinity;
    for (let i = 0; i < noteCount; i++) {
        // Oltre la triade si riparte dai suoi stessi gradi: la 4a nota di un
        // sus2 e' la fondamentale acuta, la 5a la seconda, e cosi' via.
        // L'accordo si allarga senza cambiare colore.
        const degree = q.intervals[i % q.intervals.length];
        const target = (pc + degree) % 12;

        let midi;
        if (i === 0) {
            midi = BASS_OCTAVE_MIDI + target;          // la fondamentale sta nel basso
        } else {
            // ogni voce e' la piu' grave con la classe di altezza giusta che
            // stia sopra la precedente: l'accordo risulta sempre disposto per
            // voci ascendenti invece che rimescolato dentro un'ottava fissa
            midi = CHORD_OCTAVE_MIDI + target;
            while (midi <= prev) midi += 12;
        }
        prev = midi;
        notes.push({ midi, name: midiToName(midi), freq: midiToFreq(midi), degree });
    }

    return {
        root,
        quality,
        symbol: root + q.suffix,
        label: ROOT_LABEL[root] + ' ' + q.label,
        notes
    };
}

/**
 * Progressione: la fondamentale avanza di una quinta a ogni cambio di asana.
 * `step` e' il numero di cambi avvenuti dall'inizio della sessione, quindi
 * continua a girare anche quando la sequenza ricomincia da capo.
 */
export function rootForStep(startRoot, step) {
    const base = CIRCLE_OF_FIFTHS.indexOf(startRoot);
    const i = (base < 0 ? 0 : base) + step;
    return CIRCLE_OF_FIFTHS[((i % 12) + 12) % 12];
}
