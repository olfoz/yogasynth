// Webcam + MediaPipe Pose.
//
// L'helper Camera di MediaPipe aprirebbe da solo la webcam predefinita,
// ignorando quella scelta nel menu: qui lo stream se lo apre l'app e i
// fotogrammi vengono spinti a mano dentro il modello.

const CAM_KEY = 'yogasynth.cameraId';

export class PoseTracker {
    constructor(video) {
        this.video = video;
        this.pose = null;
        this.stream = null;
        this.landmarks = null;
        this.worldLandmarks = null;
        this.running = false;
        this.onFirstResult = null;
    }

    static get storageKey() { return CAM_KEY; }

    /** Elenca le webcam; con permesso concesso il browser ne rivela i nomi. */
    static async listCameras(select, requestPermission) {
        try {
            if (requestPermission) {
                const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
                tmp.getTracks().forEach(t => t.stop());
            }
            const devs = (await navigator.mediaDevices.enumerateDevices())
                .filter(d => d.kind === 'videoinput');
            const saved = localStorage.getItem(CAM_KEY) || '';
            select.innerHTML = '<option value="">Predefinita</option>';
            devs.forEach((d, i) => {
                const o = document.createElement('option');
                o.value = d.deviceId;
                o.textContent = d.label || ('Webcam ' + (i + 1));
                if (d.deviceId && d.deviceId === saved) o.selected = true;
                select.appendChild(o);
            });
        } catch (e) {
            console.warn('Enumerazione webcam fallita:', e);
        }
    }

    async openCamera(deviceId) {
        localStorage.setItem(CAM_KEY, deviceId || '');

        const base = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' };

        // Si chiede 4:3, non 16:9.
        //
        // Molte webcam hanno un sensore 4:3 e, quando si chiede un 16:9,
        // lo RITAGLIANO: stesso campo orizzontale, un quarto di campo
        // verticale in meno. E' il lato corto a decidere quanto lontano ci
        // si deve mettere per starci dentro in piedi, quindi quel quarto si
        // paga in circa il 25% di distanza in piu' del necessario. Sono
        // valori "ideal": se la webcam fa solo 16:9, si prende quello.
        this.stream = await navigator.mediaDevices.getUserMedia({
            video: Object.assign({}, base, { width: { ideal: 1280 }, height: { ideal: 960 } }),
            audio: false
        });
        this.video.srcObject = this.stream;

        // play() puo' restare appeso (scheda in secondo piano, criteri di
        // riproduzione automatica, video non ancora in pagina). Quello che
        // serve davvero e' sapere le dimensioni del fotogramma: si aspetta
        // quelle, con un limite, invece della promessa di play().
        const playing = this.video.play();
        if (playing && playing.catch) playing.catch(e => console.warn('Riproduzione video:', e));
        await this._waitForFrame(8000);

        const track = this.stream.getVideoTracks()[0];
        await this._widenField(track);

        const st = track.getSettings ? track.getSettings() : {};
        console.info('[webcam] ' + (st.width || this.video.videoWidth) + 'x'
            + (st.height || this.video.videoHeight)
            + ' (rapporto ' + ((st.width / st.height) || 0).toFixed(2) + ')');

        return this.stream;
    }

    /**
     * Allarga il campo inquadrato il piu' possibile: zoom al minimo e, se la
     * webcam offre un formato piu' alto di quello che ci ha dato, si chiede
     * quello. Ogni grado di campo in piu' e' distanza in meno da tenere.
     */
    async _widenField(track) {
        let caps = null;
        try { caps = track.getCapabilities ? track.getCapabilities() : null; }
        catch (e) { console.warn('Capacita della webcam non leggibili:', e); }
        if (!caps) return;

        try {
            if (caps.zoom && caps.zoom.min !== undefined) {
                await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min }] });
            }
        } catch (e) {
            console.warn('Zoom camera non regolabile:', e);
        }

        // se il formato ottenuto e' piu' schiacciato di quello che la webcam
        // sa fare, si riprova puntando al modo piu' vicino al quadrato
        try {
            const st = track.getSettings ? track.getSettings() : {};
            const got = (st.width && st.height) ? st.width / st.height : null;
            const maxW = caps.width && caps.width.max;
            const maxH = caps.height && caps.height.max;
            if (got && maxW && maxH && got > (maxW / maxH) + 0.05) {
                await track.applyConstraints({
                    width: { ideal: Math.min(maxW, Math.round(960 * (maxW / maxH))) },
                    height: { ideal: Math.min(maxH, 960) }
                });
                await this._waitForFrame(3000);
            }
        } catch (e) {
            console.warn('Formato piu largo non applicabile:', e);
        }
    }

    /** Aspetta che il video abbia dimensioni reali, al massimo `ms`. */
    _waitForFrame(ms) {
        const v = this.video;
        if (v.videoWidth && v.videoHeight) return Promise.resolve(true);
        return new Promise(resolve => {
            let done = false;
            const finish = ok => {
                if (done) return;
                done = true;
                v.removeEventListener('loadedmetadata', onMeta);
                v.removeEventListener('resize', onMeta);
                clearTimeout(timer);
                resolve(ok);
            };
            const onMeta = () => { if (v.videoWidth && v.videoHeight) finish(true); };
            const timer = setTimeout(() => {
                console.warn('Nessun fotogramma dalla webcam entro ' + ms + 'ms: si prosegue comunque.');
                finish(false);
            }, ms);
            v.addEventListener('loadedmetadata', onMeta);
            v.addEventListener('resize', onMeta);
        });
    }

    async startPose() {
        this.pose = new Pose({
            locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`
        });
        this.pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            enableSegmentation: false,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        let first = true;
        this.pose.onResults(r => {
            this.landmarks = r.poseLandmarks || null;
            this.worldLandmarks = r.poseWorldLandmarks || null;
            if (first) {
                first = false;
                if (this.onFirstResult) this.onFirstResult();
            }
        });

        this.running = true;
        const pump = async () => {
            while (this.running) {
                if (this.video.readyState >= 2) {
                    try { await this.pose.send({ image: this.video }); }
                    catch (e) { console.warn('MediaPipe:', e); }
                }
                await new Promise(r => requestAnimationFrame(r));
            }
        };
        pump();
    }

    stop() {
        this.running = false;
        if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    }
}
