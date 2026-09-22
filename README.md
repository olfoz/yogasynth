# yogasynth

Far suonare il proprio corpo attraverso lo yoga.

Unisce le due app precedenti: il motore di rette + drone di `dronasana/` e
l'avatar rigged di `yoga/`. Le due cartelle originali restano dove
sono, intatte: questa app vive nella radice e non le usa a runtime (i moduli
condivisi sono copiati in `js/vendor/`).

---

## L'idea

Ogni asana proietta delle **rette**. Le rette si vedono come **raggi cosmici**
che attraversano tutto lo schermo: il corpo ci si adagia sopra.

Ogni retta è una nota dell'accordo dell'asana, **sempre in quest'ordine**:

| retta | nota | dove sta |
|---|---|---|
| spina dorsale (`spine`) | 1ª — fondamentale | nel basso, Do2–Si2 |
| arti superiori (`arms` / `upperArms`) | 2ª | Do3 in su |
| arti inferiori (`legs`) | 3ª | sopra la precedente |
| rette in più (`foreArms`, …) | 4ª, 5ª… | sopra ancora |

Tre cose muovono il suono:

- **allineamento** → la nota si accende quando la retta è a posto;
- **correttezza** → più la posizione è giusta, più la nota è *armonica*: i
  parziali sono stirati e battono quando sei approssimativo, e rientrano sui
  multipli esatti quando sei preciso (`js/music/synth.js`, `applyPurity`);
- **tenuta** → **un armonico in più per ogni secondo** in cui mantieni.

Quale nota tocchi a quale retta **non dipende dalla parte del corpo**: la
prende chi arriva. La prima retta che va in posizione suona la più grave, la
seconda quella di mezzo, la terza l'acuta, così l'accordo si costruisce
sempre dal basso ([`js/music/voiceOrder.js`](js/music/voiceOrder.js)). Prima
l'altezza era legata alla retta — spina grave, braccia media, gambe acuta — e
chi sistemava le gambe per prime sentiva partire l'acuto da solo, senza
fondamenta sotto. Se il corpo va a posto tutto insieme si torna comunque alla
disposizione naturale.

Quando tutte le rette tengono insieme per 3 secondi l'asana è superato.
Se non ci riesci entro 15 secondi si passa avanti con una campana. La voce
annuncia **il prossimo** asana appena quello corrente si chiude, non dopo il
cambio: quando la posa nuova compare sai già cos'è. È dentro quella pausa che
parla, e la pausa si sceglie nella schermata iniziale (0,8 / 1,5 / 3 / 5
secondi) — chi conosce la sequenza la accorcia, chi vuole ascoltare con calma
la allunga.

### Come si pronuncia

I nomi sono sanscriti e una voce italiana ci mette l'accento sulla penultima
sillaba: dice *asàna* dove va *àsana*, cioè ta‑DA‑sa‑na e non ta‑da‑SA‑na.
Ogni posa porta quindi un campo `spoken` con l'accento scritto
(`Tadasana` → `Tadàsana`): è l'unica cosa che la sintesi vocale del browser
capisce, perché SSML e i fonemi non sono affidabili nelle Web Speech API. Per
lo stesso motivo la *c* di Chaturanga diventa `Cia`: in italiano *cha* si
legge *ka*.

### Perché l'accordo non stona

Con gli armonici al completo l'accordo diventava ruvido, e la causa non erano
le qualità (minore, sus2…) ma il **registro**. Misurando la ruvidezza
(Plomp‑Levelt) sulla sequenza intera, le coppie peggiori erano sempre fra le
*fondamentali* delle voci — Si2 contro Re3 in Si minore, Mi3 contro Sol3 in Do
maggiore — non fra gli armonici alti: le tre voci stavano tutte fra 130 e
200 Hz, e lì una terza è fangosa. È il vecchio limite di registro, intervalli
stretti in alto e larghi in basso.

Tre correzioni, misurate sulla sequenza intera a posizione perfetta:

| | ruvidezza |
|---|---|
| prima | 1.563 |
| voci superiori da Do3 a **Do4** | −51% |
| armonici solo su **ottave e quinte** (1, 2, 3, 4, 6, 8, 12, 16) | −13% |
| residuo di scordatura diviso per l'ordine del parziale | −2% |
| **tutte insieme** | **0.537 (−66%)** |

Gli armonici contano meno del registro ma non sono innocenti: il quinto
armonico è una terza maggiore e il settimo una settima minore, e impongono un
colore all'accordo *qualunque colore avesse* — in Si minore il quinto armonico
del basso è un Re♯ che batte contro il Re della terza. Ottave e quinte non
prendono posizione, quindi la qualità resta quella scritta nell'asana. E i tre
centesimi di tono di scordatura residua sono un luccichio lento sulla
fondamentale (0,2 Hz) ma otto battiti al secondo sul sedicesimo armonico:
vanno divisi per l'ordine del parziale.

**La sequenza di accordi non è cambiata**: C, G, Dsus2, Asus2, Esus2, Bm, F♯m…
È rimasta quella, perché il problema non era lì.

Anche il **bagliore** segue l'accordo, invece di restare sempre acceso. La
forza del bloom cresce con le note che stanno suonando davvero (`setGlow` in
`js/render/stage.js`): 0 note → 0.10, una → 0.22, due → 0.43, l'accordo
completo → **0.70**. La curva è più che lineare apposta, così a metà delle
note il bagliore è ancora chiaramente parziale; e il massimo si ferma a 0.7
perché più in su l'alone si mangiava la scena, mentre quello che si deve
vedere sotto è il corpo.

Il pulsante **Ricomincia**, in basso, riporta la sequenza a Tadasana e il
basso alla tonalità di partenza. Non ricarica la pagina apposta: webcam,
avatar e soprattutto il telefono collegato restano dove sono, e non c'è da
rifare il QR a ogni giro.

## La progressione

Il basso segue il **circolo delle quinte** e avanza di una quinta a **ogni
cambio di asana**. La qualità dell'accordo e il numero di note vengono invece
dall'asana: tante note quante sono le sue rette.

```
 1 Tadasana                C      C2 E3 G3
 2 Urdhva Hastasana        G      G2 B3 D4
 3 Uttanasana              Dsus2  D2 E3 A3 D4     ← braccia piegate: 4 rette
 4 Ardha Uttanasana        Asus2  A2 B3 E4
 5 Chaturanga Dandasana    Esus2  E2 F#3 B3 E4    ← braccia piegate: 4 rette
 6 Urdhva Mukha Svanasana  Bm     B2 D3 F#3
 7 Adho Mukha Svanasana    F#m    F#2 A3 C#4
 8 Ardha Uttanasana        C#sus2
 9 Uttanasana              G#sus2
10 Urdhva Hastasana        D#
11 Tadasana                A#
```

Il Saluto al Sole ha **11 passi**, il circolo **12 posizioni**: il circolo si
chiude un passo dopo la fine del saluto, quindi ogni ripetizione entra in una
tonalità nuova e si torna a Do dopo dodici saluti. È una spirale voluta. Se
preferisci che ogni saluto riparta da Do, in `data/asanas.json`:

```json
"rootMode": "perRound"
```

## Le pose sono di profilo

Nel Saluto al Sole il corpo è **di taglio** rispetto alla telecamera, come
nelle tavole classiche. I dati 2D di un asana `view: "profile"` descrivono la
**linea mediana** del corpo, non due lati distinti: l'avatar riprende da sé la
propria larghezza e ruota tutto verso la telecamera
(`js/render/avatar.js`, `poseTo`). Un asana frontale si dichiara
`view: "front"` e i landmark sinistro/destro vengono usati tali e quali.

Il matcher prova sia l'asana sia la sua versione specchiata, con isteresi:
puoi metterti di profilo rivolto da una parte o dall'altra.

## Struttura

```
index.html              guscio: DOM, importmap three, popup iniziale
.gitignore              tiene fuori dronasana/ e yoga/ dalla pubblicazione
schermo.html            pagina per il telefono: guarda e basta
css/styles.css
data/asanas.json        asana di profilo, rette per asana, sequenza, accordi
data/intro-sukhasana.json  l'animazione iniziale inclusa
data/ice.json           server di appoggio per il collegamento diretto
avatars/nathan.fbx      l'avatar della cartella yoga
intro/                  ci va il tuo intro.anim (vedi intro/LEGGIMI.md)

js/
  main.js               orchestrazione e ciclo principale
  sequence.js           quale asana, quale accordo, quando si cambia
  fps.js                media mobile degli FPS + soglia sostenuta
  intro.js              minianimazione iniziale e sua dissolvenza
  poseClip.js           fotogrammi chiave di direzioni, interpolati
  schermo.js            confeziona e manda le posizioni al secondo schermo
  schermoView.js        disegno della scena sul telefono (non e' un modulo)
  peer.js               collegamento diretto WebRTC, lato computer
  qr.js                 codice QR dell'indirizzo, disegnato nel browser
  music/
    theory.js           circolo delle quinte, accordi, registri
    synth.js            drone per retta: armonici nel tempo, purezza dal punteggio
  pose/
    tracker.js          webcam + MediaPipe Pose
    rays.js             rette, punteggio (allineamento + rettitudine), isteresi
  render/
    stage.js            scena three.js, camera ortografica agganciata al video
    raysView.js         i raggi cosmici (shader additivo)
    glowBody.js         il corpo dell'utente, un arto per segmento + riverbero
    avatar.js           FBX di yoga, posa 2D → posa 3D
    hud.js              pentagramma, barra di stato, nome, barra perimetrale
  vendor/               copiati da yoga/js, non modificati
    ikSetup.js  animationPlayer.js  unityAnimParser.js
    humanoidBoneMapper.js  humanoidMuscleConverter.js  orbitControls.js

tools/
  serve.py              server locale + ponte verso il telefono
  prova-turn.py         chiede al TURN di assegnare un relay: credenziali buone?
  apri-firewall.cmd     apre la porta 8941 verso la rete locale, una volta sola
  build_asanas.py       genera data/asanas.json dagli angoli delle pose
  banco-logica.html     accordi, ordine delle note, punteggi delle rette
  banco-pose.html       disegna tutte le pose: pavimento, rette, scheletro
  banco-avatar.html     quanto l'avatar cade vicino ai giunti dell'asana
  banco-intro.html      rende l'animazione iniziale in una striscia di istanti
  banco-schermo.html    disegna una posa finta come la vedrebbe il telefono
  banco-sintassi.html   controlla che tutto il codice compili, pagine incluse
  banco-rete.html       WebRTC, STUN e WebSocket funzionano da qui?
  banco-peer.html       giro completo del collegamento diretto
  banco-qr.html         la scheda "Apri sul telefono", QR riletto e confrontato
  banco-app.html        avvia l'app intera in un iframe e racconta cosa fa
```

### L'animazione iniziale

Parte prima della pratica. Due strade, in quest'ordine: se esiste
`intro/intro.anim` (un `.anim` Humanoid di Unity, come quelli che la cartella
yoga caricava col tasto LOAD) vince quello; altrimenti va quella inclusa,
**Sukhasana che porta le mani a giunte**, 8 secondi.

Quella inclusa non è un file di animazione ma
[`data/intro-sukhasana.json`](data/intro-sukhasana.json): fotogrammi chiave
in cui ogni voce è la *direzione* di un segmento nel sistema del corpo. Le
lunghezze non servono — `_aimVector` usa solo la direzione, gli ossi restano
lunghi quanto sono — quindi un fotogramma si scrive a mano senza far tornare
le proporzioni. È lo stesso meccanismo con cui l'app posa gli asana.

In entrambi i casi l'animazione **sfuma in trasparenza** se gli FPS scendono
sotto 40, invece di continuare a scattare.

### Come si posa l'avatar

Non con un solver IK, anche se il rig di `ikSetup.js` c'è ed è quello della
cartella yoga. L'IK serve quando si conosce solo il punto d'arrivo e bisogna
indovinare le articolazioni in mezzo; qui i dati dell'asana danno ogni
giunto, gomiti e ginocchia comprese, quindi ogni osso si punta direttamente
dove l'asana lo vuole.

Un'asana non è solo geometricamente corretta: deve anche essere **fattibile**.
Uttanasana nasceva con il busto a 5 gradi dalle gambe, cioè praticamente
parallelo: un piegamento completo che non fa nessuno, e la nota della spina
non si sarebbe accesa mai. Adesso resta un angolo di **26 gradi**. Si regola
da `spine` in [`tools/build_asanas.py`](tools/build_asanas.py) — `head` gli
sta due gradi dietro, perché il raggio della spina arriva fino al naso e deve
restare dritto.

Attenzione a cosa dimostra quella misura. L'avatar segue i dati con scarti
sotto l'uno per cento **anche quando i dati sono sbagliati**: in Uttanasana il
polso finiva tre centesimi sotto il pavimento e la mano sporgeva in
orizzontale davanti ai piedi, e lo scarto avatar‑dati restava 0.000. Nessun
confronto avatar‑contro‑dati può accorgersene. Per questo ogni posa dichiara
`ground`, cioè quali giunti poggiano a terra, e
[`tools/banco-pose.html`](tools/banco-pose.html) disegna tutte le pose e
verifica che gli appoggi siano alla stessa altezza e che niente finisca sotto
il pavimento. È in 2D e non usa né three.js né l'FBX: controlla i dati, che
sono il posto dove l'errore stava.

Misurato su tutti e sette gli asana con `tools/banco-avatar.html`:

| | col solver CCD | puntando gli ossi |
|---|---|---|
| mani | 0,016 – 0,115 | 0,000 – 0,006 |
| gomiti | 0,002 – 0,099 | 0,000 – 0,001 |
| piedi | 0,000 – 0,069 | 0,000 – 0,005 |

(in frazioni dell'altezza del corpo). Il gomito, nel rig, può ruotare solo
attorno all'asse fissato in `ikSetup.js` e nelle pose molto piegate non
arriva; la spina, su un piegamento di quasi 180° come quello di Uttanasana,
si ferma prima e si porta dietro anche le spalle. Conta, perché proprio in
Uttanasana e Chaturanga braccio e avambraccio sono **due rette distinte**,
cioè due note diverse, e devono vedersi separate.

Di `ikSetup.js` resta l'uso per cui è insostituibile: conosce i nomi degli
ossi di `nathan.fbx`, trova la `SkinnedMesh` e verifica che il rig abbia
tutte le catene.

L'errore residuo sulla testa (~0,04, costante) non è un errore: l'osso della
testa sta alla base del cranio, il landmark `nose` di MediaPipe molto più
avanti. L'avatar punta nella direzione del naso, non il naso.

### Distanza dalla webcam e inquadratura

Per farsi inquadrare in piedi bisogna allontanarsi parecchio: su un portatile
tipico (campo verticale ~36 gradi) servono circa **2,7 m**. E' il campo
visivo dell'obiettivo, non un difetto dell'app, ma quattro cose lo rendono
sopportabile.

**1. Si chiede 4:3, non 16:9.** Molte webcam hanno un sensore 4:3 e, quando si
chiede un 16:9, lo *ritagliano*: stesso campo orizzontale, un quarto di campo
verticale in meno. Siccome e' il lato corto a decidere la distanza, quel
quarto si pagava in circa il 25% di distanza in piu'. Ora
`js/pose/tracker.js` chiede 1280x960 e, se la webcam offre un formato ancora
piu' vicino al quadrato, ci si sposta (`_widenField`), zoom sempre al minimo.

**2. Niente piu' ritagli.** Prima, su schermo verticale, l'immagine veniva
ritagliata per riempire lo schermo: si vedeva mezzo corpo e veniva naturale
arretrare ancora. Adesso a zoom 1 si vede sempre tutto il fotogramma.

**3. Inquadratura automatica.** Il riquadro della camera ortografica si
stringe attorno al corpo, che occupa sempre circa l'82% dello schermo
qualunque sia la distanza (`updateView` in `js/main.js`). E' ingrandimento
digitale — l'immagine perde definizione — ma corpo, raggi e avatar diventano
leggibili. Di serie e' **spento**: a chi e' gia' inquadrato bene la scena
sembrerebbe muoversi da sola, senza ricavarne niente. Lo accende
l'interruttore **Zoom auto**; rotella e pizzico regolano lo zoom a mano (e
spengono l'automatico). La messa a fuoco segue il corpo in ogni caso.

**4. Arti fuori bordo tollerati.** Prima un giunto non visto azzerava la sua
retta, quindi bastava un piede oltre il bordo per non poter piu' suonare
quella nota. Adesso ogni segmento pesa quanto ci si fida dei suoi estremi e
la media e' pesata: una retta vista per tre quarti prende un voto pieno se
quei tre quarti sono a posto. Sotto il 40% di retta visibile si smette di
giudicarla e la barra di stato dice "fuori campo". Le soglie stanno in cima a
`js/pose/rays.js`.

La barra di stato avvisa anche quando arretrare (stai uscendo) o quando ti
conviene avvicinarti (sei cosi' lontano che lo zoom e' al massimo).

### Come si incastra lo spazio

Tutto ragiona in **spazio isotropo**: `x = (1 - nx) * aspect`, `y = ny`, cioè i
landmark MediaPipe specchiati per l'effetto selfie e corretti per l'aspect,
così gli angoli fra i segmenti sono angoli veri.

`Stage` mappa quello spazio sul mondo three.js con una camera **ortografica**.
Il canvas riempie sempre lo schermo; il fotogramma della webcam sta in scena
come un quad alto 1 e largo `aspect`, e quanto se ne vede lo decidono zoom e
messa a fuoco (`setView`). La webcam è un quad di fondo dentro la scena, non
un `<video>` dietro al canvas, così il bloom compone i raggi sopra l'immagine
reale.

## Prestazioni

L'avatar è la parte pesante (FBX da 24 MB, riposato a ogni frame, insieme a
MediaPipe). Tre difese, in ordine:

1. l'animazione iniziale **sfuma** se gli FPS stanno sotto 40 (richiesta
   esplicita);
2. durante la pratica, se gli FPS restano sotto 40 per più di 1,2 s l'avatar
   **si spegne da solo** — rette e suono devono restare fluidi. Rimettendo
   l'interruttore "Avatar" su acceso si riprova;
3. l'interruttore "Avatar" lo toglie comunque di mezzo: l'app funziona
   benissimo con i soli raggi.

Se l'FBX non carica, l'app prosegue senza avatar invece di fermarsi.

## Farla girare

Serve un server locale (i moduli ES e `fetch` non funzionano col doppio clic
sul file):

```
python tools/serve.py
```

poi `http://localhost:8941/`. Usa **localhost**, non l'indirizzo di rete: le
webcam funzionano solo in contesto sicuro, e per il browser `localhost` lo e'
mentre `192.168.x.x` in http no.

Va bene anche `python -m http.server 8941`, ma senza il ponte per il telefono
(sotto).

## Guardare da un telefono

La webcam deve stare lontana per prendere tutto il corpo; lo schermo vicino
per poterlo leggere. Sono due posti diversi, quindi servono due dispositivi:
il computer inquadra, il telefono lo appoggi davanti a te e guarda.

1. sul computer apri l'app e, **nella schermata iniziale**, premi
   *Collega un telefono*: compaiono un QR e un indirizzo;
2. sul telefono inquadra il QR, oppure scrivi l'indirizzo;
3. appoggia il telefono davanti a te e **solo adesso** premi INIZIA.

Il collegamento si fa prima di cominciare proprio per questo: si sistema il
telefono con calma, senza la pratica gia' avviata. Durante la sessione la
scheda si sposta in basso a destra e l'interruttore **Telefono** la
accende e la spegne.

Al telefono serve **una cosa sola**: un indirizzo che contenga gia' il
codice, tipo `.../schermo.html#orso-7133`. Da li' si collega da solo per la
strada che trova aperta — il ponte sulla rete locale se c'e', altrimenti il
collegamento diretto. Per questo la scheda mostra un indirizzo e non due
strade fra cui scegliere.

Il QR si disegna nel browser (`js/qr.js`): nessuna immagine chiesta a un
servizio esterno, quindi l'indirizzo di casa non esce da qui. Il giro
encode-decode e' verificato in `/tools/banco-qr.html`, che rilegge il QR
appena disegnato con un decodificatore indipendente e controlla che ne esca
esattamente l'indirizzo di partenza.

### Si mandano posizioni, non immagini

Il telefono riceve **dove sono i giunti, dove passano i raggi e che note
suonano** — circa un chilobyte per aggiornamento — e ridisegna la scena da
solo, alla sua risoluzione ([`js/schermoView.js`](js/schermoView.js)).

La prima versione mandava lo schermo intero come JPEG, circa 40 000 byte per
fotogramma: trentatre volte tanto, un'immagine compressa da ingrandire sul
telefono, e il computer costretto a copiare e comprimere il canvas a ogni
fotogramma proprio mentre fa girare MediaPipe e l'avatar. Mandare i dati
costa meno da tutte le parti.

Sul telefono il corpo si disegna **bianco** e i raggi colorati (sul computer
e' il contrario, perche' li' gli arti devono spiccare sopra l'immagine della
webcam). Senza la webcam sotto, arti dello stesso colore dei raggi si
confondevano con i raggi stessi; bianco sopra colorato si legge a colpo
d'occhio: il corpo e' dentro il fascio, oppure no. L'inquadratura si stringe
sul corpo come fa il computer, con lo stesso tetto di ingrandimento.

### Da che parte sei rivolto

Di profilo ci si può mettere rivolti a destra o a sinistra, e l'app confronta
la posa con il bersaglio dritto o specchiato scegliendo quello che va meglio.
Quella scelta però si fa **una volta sola** e poi si blocca (`RayTracker` in
[`js/pose/rays.js`](js/pose/rays.js)): prima veniva riconsiderata a ogni
fotogramma e azzerata a ogni cambio di asana, così a metà della pratica il
bersaglio poteva ribaltarsi e ci si ritrovava la posa da imitare girata
dall'altra parte.

Serve uno scarto netto fra le due ipotesi, ripetuto per mezzo secondo: le
pose simmetriche come Tadasana non dicono niente sul verso ed è giusto che
non decidano, decide la prima posa che un verso ce l'ha. Nemmeno
**Ricomincia** lo rimette in discussione — rifà la sequenza, non rigira la
persona. Per riconsiderarlo si ricarica la pagina.

### La posa da raggiungere

Sul telefono si vede anche **la figura da raggiungere**, azzurra, dietro al
proprio corpo bianco. Le rette da sole dicono *dove* stendersi ma non che
posa assumere, e sul telefono non c'e' l'avatar guida del computer: senza,
chi guarda lo schermo appoggiato per terra deve indovinare. E' disegnata
piu' spessa del corpo apposta — quando la posa e' giusta il bianco le entra
dentro e resta solo un alone azzurro attorno.

Non si mandano le coordinate gia' messe in scala, che cambierebbero a ogni
fotogramma insieme a chi si muove. Si manda la posa **normalizzata**:
origine sul bacino, unita' di misura la lunghezza del busto. Cosi' per tutta
la durata di un asana e' ferma, e viaggia solo quando cambia (piu' una
ripetizione ogni otto messaggi, per chi si collega a meta' asana): in media
cinquanta byte per aggiornamento, il 4% in piu'. E' il telefono a rimetterla
in scala sul corpo che sta gia' ricevendo, quindi la guida segue chi pratica
a ogni fotogramma senza costare niente.

Quella rimessa in scala e' la stessa aritmetica che fa il computer
(`anchorTarget`, in [`js/pose/rays.js`](js/pose/rays.js) — sta li' e non in
`main.js` proprio perche' ora la usano in due). Due copie che si allontanano
darebbero una guida leggermente fuori posto sul solo telefono, e non si
noterebbe guardando il computer: `tools/banco-logica.html` confronta le due
strade a ogni giro e vuole meno di 2·10⁻⁴ di scarto.

Se nessuno e' ancora inquadrato la figura si mostra lo stesso, centrata: e'
proprio il momento in cui serve, per sapere che posa assumere. Si prova con
`tools/banco-schermo.html?nessuno=1`.

### Due strade per ricevere

Il telefono prova nell'ordine:

**1. Il ponte sulla rete locale.** Veloce, senza internet, ma il telefono
deve poter *bussare* al computer — ed e' proprio quello che il firewall di
Windows impedisce su una rete "Public" (vedi sotto).

**2. Il collegamento diretto (WebRTC).** Qui succede il contrario: i due
dispositivi si chiamano l'un l'altro verso l'esterno, e il firewall lascia
passare le risposte al traffico uscito da li'. **Nessuna regola da
aggiungere**: e' lo stesso meccanismo per cui una videochiamata funziona
senza configurare niente.

Sul computer, accendendo **Telefono**, compare anche un codice tipo
`luna-7413`; sul telefono si scrive quel codice, oppure si apre direttamente
`…/schermo.html#luna-7413`.

Il prezzo: perche' due dispositivi si trovino, qualcuno deve presentarli (il
*signalling*). Se lo facesse il computer saremmo punto e a capo, quindi le
presentazioni passano da un servizio esterno (il broker pubblico di PeerJS) e
**serve internet**, anche se i due dispositivi sono a mezzo metro. Al broker
passano solo le presentazioni: le posizioni del corpo viaggiano dirette e non
toccano nessun server.

**Verificato**, con `/tools/banco-peer.html` in un browser vero: broker
raggiunto in 644 ms, canale diretto aperto in 2,1 s, aggiornamenti arrivati
interi e in ordine. Chrome headless non serve a niente per questa prova — ha
WebRTC disattivato e non raccoglie nemmeno i candidati locali.

Su una rete nuova conviene cominciare da `/tools/banco-rete.html`, sempre nel
browser vero: dice in pochi secondi se WebRTC, STUN e il WebSocket verso il
broker funzionano da li'.

**Nota sul canale.** Il telefono lo apre con `reliable: false`, che in PeerJS
1.5 non significa quello che sembra: quel valore finisce solo in
`ordered: !!reliable` sul DataChannel, quindi il canale resta affidabile ma
NON ordinato. Va bene (niente blocco in testa alla coda), ma un aggiornamento
puo' sorpassare il precedente: per questo ogni stato porta una marca
temporale e il telefono scarta quelli superati.

I primissimi aggiornamenti dopo che un telefono si collega possono andare
persi: il lato computer registra la connessione un attimo dopo il telefono.
A venti aggiornamenti al secondo non si nota.

### Quando il collegamento diretto fallisce

Se il telefono dice **"Negotiation of connection to ... failed"**, non e' il
servizio di incontro: nel codice di PeerJS quel messaggio esce quando
`iceConnectionState === 'failed'`. Vuol dire che i due dispositivi **si sono
trovati** ma non c'e' una strada per farli parlare. Succede quando:

- stanno su reti diverse (uno in wi-fi, l'altro sotto rete mobile), e le NAT
  dei due lati non si lasciano attraversare;
- stanno sulla stessa wi-fi ma il router ha l'**isolamento client** acceso, e
  impedisce ai dispositivi di parlarsi fra loro. Sulle reti ospiti e' di serie.

La via di scorta si chiama **TURN**: un server che fa da ponte quando quella
diretta non c'e'. Si configura in [`data/ice.json`](data/ice.json), che
leggono sia il computer sia il telefono.

**Ma non ce n'e' uno gia' pronto, ed e' voluto.** I server pubblici con
credenziali libere sono finiti: `openrelay.metered.ca` e' spento (muto su UDP
80, 443 e 3478, TCP 443 chiude subito), e `freeturn`, `anyfirewall`,
`viagenie` non risolvono piu' nemmeno il nome. Gli unici due ancora vivi —
`relay.metered.ca` e `turn.cloudflare.com` — vogliono un account gratuito che
ti da' username e password da incollare in `data/ice.json`. Chi ha un server
suo puo' installarci coturn.

Lasciare un TURN morto nel file non aiuta: allunga la raccolta dei candidati
e fa dire al banco "TURN elencato ma irraggiungibile".

> **Due avvertenze.** Finche' il collegamento e' diretto, le posizioni del
> corpo non toccano nessun server; con il TURN ci passano attraverso — un
> motivo in piu' per preferire il ponte quando si e' in casa. E le credenziali
> stanno in chiaro in un repository pubblico, quindi chiunque le trovi puo'
> consumare la quota: su un sito statico non c'e' modo di evitarlo, perche' il
> browser deve riceverle e non c'e' un server che ne generi di temporanee. Il
> danno e' limitato (piano di prova, nessun addebito oltre il limite: il TURN
> smette e basta) e le credenziali si rigenerano dal pannello.

### E se sono sulla stessa wi-fi?

Puo' fallire lo stesso. I browser nascondono l'indirizzo locale dietro un
nome `.local` risolto via **mDNS**: se il router non lascia passare il
multicast — cosa comune sulle reti classificate "Public" e sulle reti ospiti
— i due dispositivi non riescono a trovarsi nemmeno stando a mezzo metro.
`/tools/banco-rete.html` lo segnala quando succede.

**In casa la risposta giusta e' il ponte**, non il collegamento diretto: una
volta data la regola del firewall e' piu' veloce, non dipende da nessun
servizio esterno e non manda niente fuori dalla tua rete. Il collegamento
diretto serve per quando sei fuori casa, o dal sito pubblicato.

**Quale scegliere.** Se sei a casa e puoi dare una volta il comando del
firewall, il ponte e' piu' semplice e non dipende da nessuno. Il collegamento
diretto serve quando il firewall non si puo' toccare, o quando l'app e'
pubblicata sul web e un ponte tuo non c'e'.

### Il trasporto

`tools/serve.py` sostituisce `python -m http.server`: serve i file **e** fa
da ponte. Il telefono chiede `GET /live/state?after=<numero>` e il server
tiene la richiesta appesa finche' non c'e' qualcosa di piu' nuovo (long
polling): latenza da streaming, senza WebSocket e senza dipendenze.

> La primissima versione usava MJPEG (`multipart/x-mixed-replace`) dentro un
> `<img>`. Funziona su Chrome e Firefox, **ma non su Safari**: su iPhone e
> iPad si vedeva una pagina bianca.

`schermo.html` e' scritta apposta senza moduli ES, senza import map e senza
CSS recente, perche' deve aprirsi anche su un iPad vecchio; e qualunque
errore, invece di lasciare la pagina bianca, finisce in un pannello che dice
cosa non va.

### Se il telefono non raggiunge il sito

Quasi sempre e' il **firewall di Windows**. Dal computer sembra tutto a
posto — `localhost` e anche l'indirizzo di rete rispondono, perche' il
traffico verso se stessi non passa dal firewall — ma da un altro dispositivo
la connessione viene rifiutata in silenzio. Succede sempre se la Wi-Fi e'
classificata **Public** (Windows la mette cosi' di suo su molte reti), perche'
su quel profilo blocca in ingresso praticamente tutto.

`serve.py` se ne accorge da solo e all'avvio stampa il comando. Il modo piu'
sbrigativo e' [`tools/apri-firewall.ps1`](tools/apri-firewall.ps1): tasto
destro -> *Esegui con PowerShell come amministratore*. Senza privilegi non
combina niente e lo dice.

Oppure a mano, una volta sola, in un PowerShell aperto **come
amministratore**:

```powershell
New-NetFirewallRule -DisplayName "yogasynth" -Direction Inbound `
  -Protocol TCP -LocalPort 8941 -Action Allow -Profile Any `
  -RemoteAddress LocalSubnet
```

`-RemoteAddress LocalSubnet` limita l'apertura alla tua rete locale. Per
toglierla: `Remove-NetFirewallRule -DisplayName "yogasynth"`.

Se dopo la regola ancora non va, in ordine:

1. **telefono e computer sulla stessa rete?** Le reti a 2,4 e 5 GHz dello
   stesso router a volte sono separate, e la rete "ospiti" quasi sempre lo e';
2. **isolamento dei client** (AP isolation / "isolamento AP" nelle
   impostazioni del router): impedisce ai dispositivi di parlarsi fra loro.
   Sulle reti ospiti e' acceso di serie;
3. **indirizzo sbagliato**: con VPN o schede virtuali, il computer ne ha piu'
   di uno. All'avvio `serve.py` elenca anche gli altri: provali;
4. **l'indirizzo e' cambiato**: il router rinnova il contratto DHCP e il
   computer prende un numero diverso. Un indirizzo annotato ieri oggi puo'
   essere di un altro dispositivo, e il telefono dice "impossibile
   raggiungere il sito" pur essendo tutto acceso e funzionante. Per questo
   conviene **inquadrare il QR** invece di ricordarsi l'indirizzo: viene
   rigenerato ogni volta e non puo' essere vecchio.

> Mentre `serve.py` gira, la cartella del progetto e' raggiungibile da
> chiunque sia sulla tua rete locale. Su una rete di casa va bene; su una
> rete pubblica no.

## Pubblicare sul web

**L'app funziona su un host statico**, e in un paio di aspetti funziona
meglio che in locale. Tutti i percorsi sono relativi: provato servendo una
copia sotto `/yogasynth/`, con dati e moduli caricati senza errori, quindi
va bene anche un indirizzo tipo `https://tizio.github.io/yogasynth/`.

Serve **HTTPS**, perche' senza contesto sicuro la webcam non parte. Lo danno
gia' fatto GitHub Pages, Netlify, Cloudflare Pages, Vercel. E con HTTPS cade
il vincolo di `localhost`: l'app si puo' aprire anche direttamente dal
telefono o dall'iPad. Sparisce anche tutta la faccenda del firewall.

**Il secondo schermo no, non cosi' com'e'.** `tools/serve.py` e' un processo
Python che tiene lo stato in memoria e le richieste appese: un host statico
non esegue processi. Tre strade, dalla piu' corta:

1. **mettere il Python dove gira**: Render, Fly.io, Railway, un VPS. Il
   codice e' gia' quello, non cambia niente;
2. **WebRTC fra i due dispositivi**: il computer parla direttamente al
   telefono, il server serve solo a farli incontrare. Latenza minore e i dati
   non passano da nessuna parte. E' la strada che consiglierei;
3. **un servizio realtime gia' pronto** (Firebase, Supabase, Ably,
   PartyKit): poche righe, piani gratuiti, ma i dati passano di li'.

Su un host statico la pagina del telefono non resta muta: prova quattro
volte e poi dice chiaramente che a quell'indirizzo il ponte non c'e'.

### Come pubblicarlo

Il sito e' **445 KB** piu' l'avatar, che si scarica a parte e non blocca
l'avvio (vedi sotto). Serve solo un host statico con HTTPS: senza contesto
sicuro la webcam non parte.

Il repository e' gia' pronto: `dronasana/` e `yoga/` sono escluse dal
`.gitignore` — sono un giga di materiale di riferimento e l'app non le usa.

**GitHub Pages.** Crea un repository vuoto su github.com, poi:

```bash
git remote add origin https://github.com/TUONOME/yogasynth.git
git push -u origin main
```

Poi nelle impostazioni del repository, *Pages* -> *Deploy from a branch* ->
`main` / `root`. Il sito esce su `https://tuonome.github.io/yogasynth/`, cioe'
in una sottocartella: funziona, i percorsi sono tutti relativi (provato).

> **Dopo un push, il browser puo' mostrarti ancora la versione vecchia.**
> GitHub Pages manda `Cache-Control: max-age=600`, quindi `index.html` e i
> moduli restano in cache fino a dieci minuti. Il sito e' gia' aggiornato: sei
> tu che vedi la copia vecchia. Ricarica forzando (Ctrl+Shift+R, su Mac
> Cmd+Shift+R); su iPhone usa una scheda privata. Chi apre il sito per la
> prima volta non se ne accorge. Per controllare cosa sta servendo davvero:
>
> ```bash
> curl -s https://TUONOME.github.io/yogasynth/js/main.js | grep -c mostraQr
> ```
>
> I banchi `banco-rete.html` e `banco-peer.html` si difendono da soli: al
> primo caricamento rimbalzano su un indirizzo con un parametro mai visto,
> che per forza non e' in cache. Per le altre pagine basta aggiungere a mano
> un `?1` all'indirizzo.

**Netlify o Cloudflare Pages.** Collega lo stesso repository, oppure trascina
la cartella nella loro pagina. Nessun comando di build, nessuna cartella di
output: il sito e' la cartella.

Quale che sia l'host, il **secondo schermo** funziona solo con il
collegamento diretto: il ponte e' un processo Python e un host statico non
esegue processi. Sul telefono si apre lo stesso sito, `…/schermo.html`, e si
scrive il codice che compare sul computer.

### Cose da sapere prima

- **`avatars/nathan.fbx` pesa 24 MB**, contro i 445 KB di tutto il resto.
  Per questo non blocca piu' l'avvio: parte in sottofondo e l'avatar compare
  quando e' pronto, mentre raggi e suono funzionano gia' (`caricaAvatar` in
  `js/main.js`). Chi spegne l'interruttore "Avatar" prima di cominciare non
  lo scarica affatto.
- **Le import map vogliono Safari 16.4** (iOS 16.4, marzo 2023). Su un iPad
  piu' vecchio l'app resta nera. `schermo.html` invece e' scritta apposta
  senza moduli, quindi quella si apre comunque.
- **Privacy**: oggi non esce niente dal computer, tutto il rilevamento e'
  locale. Con un ponte ospitato da terzi ci passerebbero le posizioni del
  corpo di chi pratica. Per un'app di yoga vale la pena pensarci: la strada
  WebRTC evita il problema in partenza.
- three.js e MediaPipe arrivano da jsdelivr: pubblicando, l'app dipende da
  quel CDN.

## Una dimostrazione fuori casa

Fuori casa il ponte sulla rete locale non serve a niente: sei su una rete che
non controlli, e le reti ospiti hanno quasi sempre l'isolamento client. Serve
il **collegamento diretto**, e perche' funzioni ovunque serve un **TURN**.

### Prima di uscire (dieci minuti, una volta sola)

1. **Prendi un TURN.** [metered.ca](https://www.metered.ca/) ne da' uno
   gratuito. Il piano di prova e' da **500 MB al mese**, non di piu': dal
   pannello si copiano indirizzo, `username` e `credential`.

   Quanto durano 500 MB: sul collegamento diretto si mandano circa 1,2 kB
   dodici volte al secondo, cioe' **~50 MB l'ora**. Bastano per una decina
   di ore al mese, piu' che abbastanza per una dimostrazione, ma non per
   praticarci tutti i giorni. E il consumo c'e' **solo quando il TURN entra
   in gioco**: se i due dispositivi si parlano direttamente, e in casa sulla
   stessa rete succede spesso, il contatore non si muove.
2. **Incollali in [`data/ice.json`](data/ice.json)**, accanto alle voci
   `stun:` che ci sono gia'. Non serve toccare il codice.
3. **`git push`**, e aspetta un minuto che il sito si aggiorni.
4. **Controlla le credenziali senza browser**: `python tools/prova-turn.py`
   parla STUN/TURN direttamente e chiede al server di assegnare un relay. Se
   risponde `credenziali valide, relay assegnato ...`, sono buone. E'
   piu' netto del browser, che davanti a un fallimento non distingue fra
   credenziali sbagliate, server spento e rete che filtra.
5. **Verifica su tutti e due i dispositivi**, con il browser vero, aprendo
   `.../tools/banco-rete.html`. Deve dire **`SI TURN raggiungibile`**. Se
   dice "elencato ma irraggiungibile", le credenziali sono sbagliate: e'
   meglio scoprirlo adesso che davanti alla gente.
6. **Fai una prova generale**: apri il sito sul computer, INIZIA, interruttore
   **Telefono**, inquadra il QR. Provalo anche con il telefono **sotto rete
   mobile** invece che in wi-fi: e' la condizione piu' simile a quella che
   troverai.

### Quale piano TURN

metered ne ha due gratuiti, e la differenza non e' solo la quota:

| | Free Trial Global 500MB | Free 20GB |
|---|---|---|
| quota mensile | 500 MB (~10 ore) | 20 GB (~400 ore) |
| rete di server | globale, instradamento al piu' vicino | non dichiarata |
| accesso API | completo | no |

Per una dimostrazione singola 500 MB bastano e avanzano, e la rete globale
tiene bassa la latenza ovunque. Per usarlo con continuita' servono i 20 GB,
accettando che il server possa essere piu' lontano.

Non serve indovinare quanto costi in ritardo: si misura. In
`tools/banco-peer.html` ci sono due pulsanti, e quello **FORZA il TURN**
impone `iceTransportPolicy: 'relay'` — nessuna scorciatoia diretta — e
stampa il tempo di andata e ritorno. Provalo con un piano, cambia piano,
riprova.

La modalita' si sceglie con un pulsante e non con un parametro
nell'indirizzo per un motivo imparato sul campo: un parametro basta un
rimbalzo di troppo per perderlo, e la prova gira in modalita' normale
mentre sembra di star misurando il TURN. Numero sbagliato, nessun avviso.

Come leggere il numero: lo yoga e' fatto di movimenti lenti, e il telefono
guarda soltanto. Fino a un centinaio di millisecondi di sola andata non si
nota; oltre i duecento si comincia a vedere il corpo che insegue.

Quella modalita' e' anche la prova piu' onesta che il TURN funzioni davvero:
`banco-rete.html` dice che il server risponde, `?relay=1` dice che ci passa
un collegamento vero.

### Sul posto

Computer: apri il sito, INIZIA, accendi **Telefono**. Telefono: inquadra il
QR. Non c'e' altro da configurare, e non importa su che rete siete.

### Se la rete del posto non collabora

Piano B, senza dipendere da nessuno: **accendi l'hotspot del telefono** e fai
collegare il computer a quello. Adesso siete su una rete che controlli tu,
senza isolamento client, e torna a funzionare il ponte — piu' veloce e senza
TURN. Serve la regola del firewall (`tools/apri-firewall.cmd`, doppio clic) e
il sito servito in locale con `python tools/serve.py`.

> Un avvertimento: three.js e MediaPipe arrivano da un CDN, quindi **al primo
> avvio serve una connessione**. Se l'app non parte per questo motivo la
> barra di stato lo dice, invece di restare muta — in una dimostrazione una
> pagina nera senza spiegazione e' lo scenario peggiore.

### Parametri URL

| parametro | effetto |
|---|---|
| `?sequence=surya-namaskara-a` | sceglie la sequenza |
| `?mode=random` | asana a caso invece della sequenza |
| `?asana=chaturanga-dandasana` | blocca un solo asana, utile per tarare i dati |

## Aggiungere un asana

In `data/asanas.json`, dentro `asanas`:

```json
{
  "id": "…", "name": "…", "label": "…",
  "view": "profile", "facing": "right",
  "quality": "sus2",
  "rays": ["spine", "upperArms", "legs", "foreArms"],
  "cue": "una riga che dice dove mettere il corpo",
  "landmarks": { "nose": [x, y], "lShoulder": [x, y], … }
}
```

Servono tutti e 13 i landmark. `rays` sceglie dalla `rayLibrary` in cima al
file; l'ordine delle note lo impone comunque l'app (spina → arti superiori →
arti inferiori → il resto), quindi puoi elencarle come ti è comodo. Poi
aggiungi l'`id` in `sequences[…].steps`.

Per tarare i numeri: `?asana=<id>` mostra solo quello e non passa mai avanti.

**Non modificare `data/asanas.json` a mano.** Lo genera
`tools/build_asanas.py` da una catena di *angoli*, su uno scheletro le cui
proporzioni sono misurate su `nathan.fbx`. Scrivere le coordinate a mano fa
venire lunghezze diverse da posa a posa, e l'app usa la lunghezza del busto
per ancorare l'asana sul corpo: un busto più corto del dovuto scala l'intero
asana, raggi compresi. Si cambia un asana toccando i suoi angoli in `POSES`,
poi `python tools/build_asanas.py` (che ristampa anche il controllo delle
lunghezze).

## Banchi di prova

Con il server locale acceso (`python tools/serve.py`) stanno sotto
`http://localhost:8941/tools/`. Dal **sito pubblicato** l'indirizzo e' lo
stesso con il prefisso del sito, per esempio
`https://TUONOME.github.io/yogasynth/tools/banco-rete.html` — la cartella
`tools/` fa parte del sito, non e' la radice.

| pagina | cosa verifica |
|---|---|
| `/tools/banco-logica.html` | accordi del giro di quinte, ordine delle note, punteggio pieno su ogni asana esatto e crollo su una posa sbagliata, limiti dello zoom |
| `/tools/banco-avatar.html` | carica `nathan.fbx`, lo posa in tutti gli asana e stampa lo scarto di mani, gomiti, piedi e testa |
| `/tools/banco-intro.html` | rende sei istanti dell'animazione iniziale; `?view=side` la guarda di fianco |
| `/tools/banco-schermo.html` | la vista del telefono su una posa finta, senza rete (schermo.html tiene sempre una richiesta appesa, e una pagina che aspetta la rete headless non la fotografa) |
| `/tools/banco-sintassi.html` | compila ogni modulo, script e script-dentro-la-pagina. In italiano gli apostrofi sono ovunque e dentro apici singoli spezzano la stringa: in un modulo l'errore si vede subito, in uno script dentro una pagina no — la pagina si carica, non esegue niente e resta muta |
| `/tools/banco-rete.html` | da aprire nel **browser vero**: dice se WebRTC, STUN e il WebSocket verso il broker funzionano su questa rete |
| `/tools/banco-peer.html` | il giro completo del collegamento diretto: codice, presentazioni, canale, dati. Con `?relay=1` obbliga il passaggio dal TURN e misura il tempo di andata e ritorno |
| `/tools/banco-qr.html` | la scheda "Apri sul telefono" nei due casi (sito pubblicato e ponte locale), col QR riletto da un decodificatore indipendente |
| `/tools/banco-app.html` | apre l'app in un iframe, preme INIZIA e riporta stato ed errori |

`banco-app.html` ha bisogno della webcam: da browser normale funziona, in
Chrome headless `getUserMedia` non si risolve mai e il test si ferma
sull'attivazione.
