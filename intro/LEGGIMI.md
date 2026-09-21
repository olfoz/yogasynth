# Minianimazione iniziale

Prima che cominci la pratica l'avatar esegue un'animazione. Ce n'è già una
inclusa; questa cartella serve a sostituirla con la tua.

## Quella inclusa

**Sukhasana che porta le mani a giunte** (Anjali Mudra), 8 secondi: seduto a
gambe incrociate con le mani sulle ginocchia, le mani si staccano, si portano
avanti e si uniscono davanti allo sterno; un respiro allunga la colonna.

Non è un file di animazione: è
[`../data/intro-sukhasana.json`](../data/intro-sukhasana.json), una manciata
di fotogrammi chiave dove ogni voce è la **direzione** di un segmento del
corpo (`spine`, `upperArmL`, `thighR`…) nel sistema del corpo — x verso il
fianco sinistro, y in alto, z in avanti. Le lunghezze non servono: gli ossi
restano lunghi quanto sono, quindi un fotogramma si scrive a mano senza dover
far tornare le proporzioni. Fra un fotogramma e l'altro le direzioni vengono
interpolate e addolcite in entrata e in uscita.

Per ritoccarla basta cambiare i numeri nel JSON e ricaricare. Per vedere il
risultato senza webcam, col server locale acceso:

```
/tools/banco-intro.html            vista frontale
/tools/banco-intro.html?view=side  vista di fianco
```

Rende una striscia di sei istanti dell'animazione, uno accanto all'altro.

## Metterne una tua

Metti qui il file dell'animazione, chiamato **`intro.anim`**. Se c'è, ha la
precedenza e quella inclusa non parte.

È un `.anim` di Unity (formato Humanoid, quello che la cartella `yoga`
caricava col tasto 📁 LOAD): viene letto da `js/vendor/unityAnimParser.js` e
applicato all'avatar da `js/vendor/animationPlayer.js`, gli stessi moduli già
usati lì. Non serve convertirlo.

```
intro/
└── intro.anim        ← il tuo file, se ne hai uno
```

## Cosa succede all'avvio

1. La webcam parte, l'avatar viene caricato.
2. L'avatar esegue l'animazione una volta, per la sua durata.
3. Poi sfuma e comincia la pratica.

**Se gli FPS scendono sotto 40** per più di 1,2 secondi durante l'animazione,
questa non viene interrotta di colpo: sfuma in trasparenza (900 ms) e la
pratica comincia subito. La soglia sta in `js/fps.js` (`threshold: 40`), la
durata della dissolvenza in `js/intro.js` (`FADE_OUT_MS`).

## Cambiare percorso o durata

In `js/main.js`:

```js
intro = new Intro(avatar, {
    url: './intro/intro.anim',            // la tua, se c'è
    clipUrl: './data/intro-sukhasana.json' // quella inclusa
});
```

La durata di quella inclusa è il campo `duration` del JSON.
