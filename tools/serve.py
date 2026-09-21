#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Server di sviluppo di yogasynth, con ponte per il secondo schermo.

Fa due cose:

  1. serve i file del progetto, come `python -m http.server`, ma in ascolto su
     tutta la rete locale invece che solo su questo computer;

  2. fa da ponte fra il computer che pratica e il telefono che guarda.
     Il computer manda POSIZIONI, non immagini: dove sono i giunti, dove
     passano i raggi, che note suonano (POST /live/state). Il telefono apre
     /schermo.html e ridisegna la scena per conto suo.

     Circa un chilobyte per fotogramma invece di quaranta, e il telefono
     disegna alla sua risoluzione invece di ingrandire un JPEG compresso.

     Il trasporto e' "long polling": il telefono chiede
     GET /live/state?after=<numero> e il server NON risponde finche' non c'e'
     qualcosa di piu' nuovo. Latenza da streaming, senza WebSocket.

     La prima versione mandava lo schermo intero come MJPEG
     (multipart/x-mixed-replace). Oltre a essere sproporzionato, Safari su
     iPhone e iPad non lo mostra dentro un <img>: pagina bianca.

Uso:

    python tools/serve.py            # porta 8941
    python tools/serve.py 9000

Poi, sul COMPUTER, apri http://localhost:8941/ — non l'indirizzo di rete:
le webcam funzionano solo in contesto sicuro, e per il browser "localhost"
lo e' mentre "192.168.x.x" via http no.

Sul TELEFONO apri l'indirizzo di rete che il server stampa all'avvio.

Nota: mentre gira, la cartella del progetto e' visibile a chiunque sia sulla
tua rete locale. Su una rete di casa va bene; su una rete pubblica no.
"""

import os
import socket
import subprocess
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_PORT = 8941
# Quanto si tiene appesa una richiesta di fotogramma prima di rispondere
# "niente di nuovo". Abbastanza da non fare raffiche di richieste a vuoto,
# poco abbastanza da non incappare nei limiti di tempo dei browser.
IDLE_TIMEOUT = 8.0


class Live(object):
    """L'ultimo stato pubblicato, e chi lo sta aspettando."""

    def __init__(self):
        self.cond = threading.Condition()
        self.state = None
        self.seq = 0
        self.viewers = 0

    def put(self, data):
        with self.cond:
            self.state = data
            self.seq += 1
            self.cond.notify_all()

    def wait(self, seen):
        """
        Aspetta uno stato piu' nuovo di `seen`. (seq, dati, c'e' di nuovo?)

        Si attende anche quando non e' ancora arrivato NIENTE, non solo
        quando il numero coincide: altrimenti il telefono che si collega
        prima del computer riceverebbe subito "niente di nuovo" e
        ricomincerebbe da capo all'infinito, a piena velocita'.
        """
        with self.cond:
            if self.state is None or self.seq <= seen:
                self.cond.wait(IDLE_TIMEOUT)
            fresh = self.state is not None and self.seq > seen
            return self.seq, self.state, fresh


LIVE = Live()


FIREWALL_RULE = 'yogasynth'


def lan_ip():
    """Indirizzo con cui questo computer si presenta sulla rete locale."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # non manda niente: serve solo a far scegliere al sistema
        # l'interfaccia di rete giusta
        s.connect(('10.255.255.255', 1))
        return s.getsockname()[0]
    except Exception:
        return '127.0.0.1'
    finally:
        s.close()


def other_addresses(primary):
    """
    Gli altri indirizzi IPv4 di questo computer.

    Con schede virtuali, VPN o piu' reti, quello della rotta predefinita non
    sempre e' quello che il telefono puo' raggiungere: meglio elencarli tutti
    e lasciar provare. Si scartano i 169.254.x.x, che sono indirizzi di
    ripiego di una scheda senza rete e non portano da nessuna parte.
    """
    found = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            addr = info[4][0]
            if addr.startswith('127.') or addr.startswith('169.254.'):
                continue
            if addr != primary and addr not in found:
                found.append(addr)
    except Exception:
        pass
    return found


def firewall_hint(port):
    """
    Su Windows il firewall blocca in ingresso quasi tutto, e su una rete
    classificata "Public" lo fa di sicuro: il server risponde benissimo sul
    computer e resta irraggiungibile dal telefono, senza dire niente.

    Qui si guarda se la regola c'e'. Se manca, si stampa il comando da dare
    una volta sola. Leggere le regole non richiede privilegi; crearla si',
    quindi il comando va eseguito in un PowerShell "come amministratore".
    """
    if os.name != 'nt':
        return None
    try:
        done = subprocess.run(
            ['netsh', 'advfirewall', 'firewall', 'show', 'rule', 'name=' + FIREWALL_RULE],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=8
        )
        if done.returncode == 0:
            return None            # la regola c'e' gia'
    except Exception:
        return None                # non si riesce a controllare: meglio tacere

    return (
        'New-NetFirewallRule -DisplayName "%s" -Direction Inbound '
        '-Protocol TCP -LocalPort %d -Action Allow -Profile Any '
        '-RemoteAddress LocalSubnet' % (FIREWALL_RULE, port)
    )


class Handler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def __init__(self, *args, **kwargs):
        kwargs['directory'] = ROOT
        SimpleHTTPRequestHandler.__init__(self, *args, **kwargs)

    # ─── registro ────────────────────────────────────────────────────────
    def log_message(self, fmt, *args):
        # i fotogrammi arrivano dieci volte al secondo: registrarli renderebbe
        # illeggibile tutto il resto
        path = getattr(self, 'path', '')
        if '/live/state' in path:
            return
        sys.stderr.write('%s  %s\n' % (self.log_date_time_string(), fmt % args))

    # ─── ponte ───────────────────────────────────────────────────────────
    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            length = 0
        body = self.rfile.read(length) if length else b''

        if self.path.startswith('/live/state'):
            LIVE.put(body)
            return self._no_content()
        self.send_error(404, 'Sconosciuto: ' + self.path)

    def do_GET(self):
        if self.path.startswith('/live/state'):
            return self._state()
        if self.path.startswith('/live/ping'):
            # serve alla pagina del telefono per distinguere "server
            # irraggiungibile" da "server c'e' ma nessuno sta praticando"
            return self._json(b'{"ok":true}')
        if self.path.startswith('/live/info'):
            import json
            info = {
                'schermo': 'http://%s:%d/schermo.html' % (lan_ip(), self.server.server_address[1]),
                'spettatori': LIVE.viewers
            }
            return self._json(json.dumps(info).encode('utf-8'))
        return SimpleHTTPRequestHandler.do_GET(self)

    def _no_content(self):
        self.send_response(204)
        self.send_header('Content-Length', '0')
        self.end_headers()

    def _json(self, payload):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _state(self):
        """
        Lo stato piu' recente, tenendo la richiesta appesa finche' non ce n'e'
        uno piu' nuovo di quello che il telefono ha gia'. Il telefono richiede
        il successivo appena ricevuto questo, quindi la catena si
        autoalimenta senza raffiche a vuoto.
        """
        after = -1
        if '?' in self.path:
            from urllib.parse import parse_qs, urlparse
            q = parse_qs(urlparse(self.path).query)
            try:
                after = int(q.get('after', ['-1'])[0])
            except ValueError:
                after = -1

        with LIVE.cond:
            LIVE.viewers += 1
        try:
            seq, state, fresh = LIVE.wait(after)
            if state is None or not fresh:
                # nessuno sta praticando, o nulla di nuovo entro il tempo
                # massimo: il telefono richiama subito e intanto la
                # connessione non resta appesa per sempre
                self.send_response(204)
                self.send_header('Content-Length', '0')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                return

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(state)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Seq', str(seq))
            self.end_headers()
            self.wfile.write(state)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass            # il telefono se n'e' andato: normale
        finally:
            with LIVE.cond:
                LIVE.viewers -= 1

    # gli asset statici non devono restare in cache mentre si sviluppa
    def end_headers(self):
        if not getattr(self, 'path', '').startswith('/live/'):
            self.send_header('Cache-Control', 'no-cache')
        SimpleHTTPRequestHandler.end_headers(self)


def main():
    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print('Porta non valida: ' + sys.argv[1])
            return 1

    server = ThreadingHTTPServer(('0.0.0.0', port), Handler)
    server.daemon_threads = True

    ip = lan_ip()
    print('')
    print('  yogasynth')
    print('  ---------')
    print('  Su QUESTO computer (webcam):  http://localhost:%d/' % port)
    print('  Sul TELEFONO (solo schermo):  http://%s:%d/schermo.html' % (ip, port))

    others = other_addresses(ip)
    if others:
        print('')
        print("  Se quell'indirizzo non risponde, questo computer ne ha anche altri:")
        for addr in others:
            print('    http://%s:%d/schermo.html' % (addr, port))

    print('')
    print('  Sul computer usa "localhost": la webcam non parte su un')
    print('  indirizzo di rete in http. Il telefono invece la camera non la')
    print("  usa, quindi per lui va bene cosi'.")

    hint = firewall_hint(port)
    if hint:
        print('')
        print('  ATTENZIONE: il firewall di Windows non ha una regola per la')
        print("  porta %d. Il telefono non riuscira' a collegarsi, mentre da" % port)
        print("  qui sembrera' tutto a posto. Apri PowerShell COME")
        print('  AMMINISTRATORE e dai questo comando, una volta sola:')
        print('')
        print('    ' + hint)
        print('')
        print('  (apre la porta solo verso la tua rete locale. Per toglierla:')
        print('   Remove-NetFirewallRule -DisplayName "%s")' % FIREWALL_RULE)

    print('')
    print('  Ctrl+C per fermare.')
    print('')
    # verso un file o una pipe, print bufferizza: senza questo l'avviso
    # arriva solo alla chiusura, e sembra che il server non sia partito
    sys.stdout.flush()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n  fermato.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
