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

Quando tutte le rette tengono insieme per 6 secondi l'asana è superato.
Se non ci riesci entro 30 secondi si passa avanti con una campana e la voce
che annuncia il prossimo.

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
  build_asanas.py       genera data/asanas.json dagli angoli delle pose
  banco-logica.html     accordi, ordine delle note, punteggi delle rette
  banco-avatar.html     quanto l'avatar cade vicino ai giunti dell'asana
  banco-intro.html      rende l'animazione iniziale in una striscia di istanti
  banco-schermo.html    disegna una posa finta come la vedrebbe il telefono
  banco-sintassi.html   controlla che tutto il codice compili, pagine incluse
  banco-rete.html       WebRTC, STUN e WebSocket funzionano da qui?
  banco-peer.html       giro completo del collegamento diretto
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
leggibili. L'interruttore **Zoom auto** lo disattiva; rotella e pizzico
regolano lo zoom a mano (e spengono l'automatico). La messa a fuoco segue il
corpo in ogni caso.

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

1. sul computer, `python tools/serve.py`, apri `http://localhost:8941/`,
   premi INIZIA e accendi l'interruttore **Telefono** (compare l'indirizzo);
2. sul telefono, stessa rete wi-fi, apri quell'indirizzo:
   `http://<ip-del-computer>:8941/schermo.html`.

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

> **Non verificato end-to-end.** Il codice compila e la logica c'e', ma
> l'ambiente di prova di questo progetto (Chrome headless) ha WebRTC
> disattivato — non raccoglie nemmeno i candidati locali — e i WebSocket in
> uscita restano appesi. Per sapere se funziona da te, apri
> **`/tools/banco-rete.html` nel browser vero** (e sul telefono): dice in
> pochi secondi se WebRTC, STUN e il WebSocket verso il broker funzionano.
> Poi `/tools/banco-peer.html` prova il giro completo.
>
> Se il WebSocket verso il broker e' bloccato ma WebRTC e STUN funzionano, la
> strada resta percorribile con un servizio di presentazioni diverso,
> ospitato da te.

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

`serve.py` se ne accorge da solo e all'avvio stampa il comando. Va dato una
volta sola, in un PowerShell aperto **come amministratore**:

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
   di uno. All'avvio `serve.py` elenca anche gli altri: provali.

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

Con il server locale acceso (`python tools/serve.py`):

| pagina | cosa verifica |
|---|---|
| `/tools/banco-logica.html` | accordi del giro di quinte, ordine delle note, punteggio pieno su ogni asana esatto e crollo su una posa sbagliata, limiti dello zoom |
| `/tools/banco-avatar.html` | carica `nathan.fbx`, lo posa in tutti gli asana e stampa lo scarto di mani, gomiti, piedi e testa |
| `/tools/banco-intro.html` | rende sei istanti dell'animazione iniziale; `?view=side` la guarda di fianco |
| `/tools/banco-schermo.html` | la vista del telefono su una posa finta, senza rete (schermo.html tiene sempre una richiesta appesa, e una pagina che aspetta la rete headless non la fotografa) |
| `/tools/banco-sintassi.html` | compila ogni modulo, script e script-dentro-la-pagina. In italiano gli apostrofi sono ovunque e dentro apici singoli spezzano la stringa: in un modulo l'errore si vede subito, in uno script dentro una pagina no — la pagina si carica, non esegue niente e resta muta |
| `/tools/banco-rete.html` | da aprire nel **browser vero**: dice se WebRTC, STUN e il WebSocket verso il broker funzionano su questa rete |
| `/tools/banco-peer.html` | il giro completo del collegamento diretto: codice, presentazioni, canale, dati |
| `/tools/banco-app.html` | apre l'app in un iframe, preme INIZIA e riporta stato ed errori |

`banco-app.html` ha bisogno della webcam: da browser normale funziona, in
Chrome headless `getUserMedia` non si risolve mai e il test si ferma
sull'attivazione.
