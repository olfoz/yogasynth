#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Prova le credenziali TURN di data/ice.json, senza browser.

Perche' serve. Il banco banco-rete.html dice se il browser riesce a ottenere
un candidato "relay", ma se fallisce non distingue fra credenziali sbagliate,
server spento e rete che filtra: tre cause diverse con lo stesso sintomo. E
soprattutto non si puo' eseguire da riga di comando, ne' prima di una
dimostrazione in un posto dove il browser magari non collabora.

Qui invece si parla STUN/TURN direttamente:

  1. si manda una richiesta Allocate;
  2. il server risponde 401 con il suo realm e un nonce;
  3. si rimanda la richiesta firmata (HMAC-SHA1, chiave MD5 di
     utente:realm:password, come vuole l'autenticazione a lungo termine);
  4. se il server assegna un indirizzo di relay, le credenziali sono buone.

Uso:
    python tools/prova-turn.py
"""

import hashlib
import hmac
import io
import json
import os
import re
import socket
import struct
import sys

MAGIC = 0x2112A442
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICE = os.path.join(ROOT, 'data', 'ice.json')

ALLOCATE = 0x0003
ALLOC_OK = 0x0103
ALLOC_NO = 0x0113
BINDING = 0x0001
BINDING_OK = 0x0101

A_USERNAME = 0x0006
A_MESSAGE_INTEGRITY = 0x0008
A_ERROR_CODE = 0x0009
A_REALM = 0x0014
A_NONCE = 0x0015
A_XOR_RELAYED = 0x0016
A_REQUESTED_TRANSPORT = 0x0019


def attributo(tipo, valore):
    riempi = (-len(valore)) % 4
    return struct.pack('>HH', tipo, len(valore)) + valore + b'\x00' * riempi


def messaggio(tipo, txid, corpo=b'', chiave=None):
    if chiave is not None:
        # la lunghezza dichiarata deve gia' comprendere MESSAGE-INTEGRITY
        testa = struct.pack('>HHI', tipo, len(corpo) + 24, MAGIC) + txid
        firma = hmac.new(hashlib.md5(chiave).digest(), testa + corpo, hashlib.sha1).digest()
        corpo = corpo + attributo(A_MESSAGE_INTEGRITY, firma)
    return struct.pack('>HHI', tipo, len(corpo), MAGIC) + txid + corpo


def attributi(dati):
    fuori, i = {}, 20
    while i + 4 <= len(dati):
        tipo, lung = struct.unpack('>HH', dati[i:i + 4])
        fuori[tipo] = dati[i + 4:i + 4 + lung]
        i += 4 + lung + ((-lung) % 4)
    return fuori


def errore_di(attrs):
    codice = attrs.get(A_ERROR_CODE, b'\x00\x00\x00\x00')
    return codice[2] * 100 + codice[3] if len(codice) >= 4 else 0


def indirizzo_relay(attrs):
    val = attrs.get(A_XOR_RELAYED)
    if not val or len(val) < 8:
        return ''
    porta = struct.unpack('>H', val[2:4])[0] ^ (MAGIC >> 16)
    ip = bytes(a ^ b for a, b in zip(val[4:8], struct.pack('>I', MAGIC)))
    return '%d.%d.%d.%d:%d' % (ip[0], ip[1], ip[2], ip[3], porta)


def prova_stun(host, porta, attesa=5):
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(attesa)
    try:
        s.sendto(messaggio(BINDING, os.urandom(12)), (host, porta))
        risposta, _ = s.recvfrom(2048)
        tipo = struct.unpack('>H', risposta[:2])[0]
        return 'risponde' if tipo == BINDING_OK else 'risposta inattesa %s' % hex(tipo)
    except socket.timeout:
        return 'nessuna risposta'
    except Exception as e:
        return 'errore: %s' % e
    finally:
        s.close()


def prova_turn(host, porta, utente, parola, attesa=6):
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(attesa)
    try:
        richiesta = attributo(A_REQUESTED_TRANSPORT, b'\x11\x00\x00\x00')   # 17 = UDP
        s.sendto(messaggio(ALLOCATE, os.urandom(12), richiesta), (host, porta))
        risposta, _ = s.recvfrom(2048)
        attrs = attributi(risposta)
        tipo = struct.unpack('>H', risposta[:2])[0]

        if tipo != ALLOC_NO or errore_di(attrs) != 401:
            return 'il server non chiede le credenziali come previsto (%s)' % hex(tipo)

        realm = attrs.get(A_REALM, b'')
        nonce = attrs.get(A_NONCE, b'')
        corpo = (richiesta
                 + attributo(A_USERNAME, utente.encode())
                 + attributo(A_REALM, realm)
                 + attributo(A_NONCE, nonce))
        chiave = ('%s:%s:%s' % (utente, realm.decode(), parola)).encode()
        s.sendto(messaggio(ALLOCATE, os.urandom(12), corpo, chiave), (host, porta))

        risposta, _ = s.recvfrom(2048)
        attrs = attributi(risposta)
        tipo = struct.unpack('>H', risposta[:2])[0]
        if tipo == ALLOC_OK:
            return 'OK  credenziali valide, relay assegnato %s' % indirizzo_relay(attrs)
        codice = errore_di(attrs)
        spiega = {401: 'credenziali rifiutate', 403: 'vietato',
                  486: 'quota esaurita o troppe allocazioni',
                  508: 'capacita' + "' " + 'esaurita'}.get(codice, '')
        return 'RIFIUTATA: errore %d %s' % (codice, spiega)
    except socket.timeout:
        return 'nessuna risposta (porta chiusa, oppure UDP filtrato da questa rete)'
    except Exception as e:
        return 'errore: %s' % e
    finally:
        s.close()


def main():
    try:
        dati = json.load(io.open(ICE, encoding='utf-8'))
    except Exception as e:
        print('Non riesco a leggere %s: %s' % (ICE, e))
        return 1

    elenco = dati.get('iceServers', [])
    if not elenco:
        print('Nessun server in data/ice.json.')
        return 1

    print('')
    print('  Server in data/ice.json')
    print('  ' + '-' * 62)
    buoni = 0
    turn_totali = 0

    for voce in elenco:
        url = str(voce.get('urls', ''))
        m = re.match(r'^(stuns?|turns?):([^:?]+)(?::(\d+))?', url)
        if not m:
            print('  %-46s  non interpretabile' % url[:46])
            continue
        schema, host, porta = m.group(1), m.group(2), int(m.group(3) or 3478)

        if schema.startswith('stun'):
            esito = prova_stun(host, porta)
        elif 'transport=tcp' in url or schema == 'turns':
            # qui si parla solo UDP: le varianti su TCP/TLS servono dove la
            # rete filtra, e vanno provate dal browser (banco-rete.html)
            esito = 'non provata da qui (TCP/TLS): la prova il browser'
        else:
            turn_totali += 1
            esito = prova_turn(host, porta, voce.get('username', ''), voce.get('credential', ''))
            if esito.startswith('OK'):
                buoni += 1

        print('  %-46s  %s' % (url[:46], esito))

    print('')
    if turn_totali == 0:
        print('  Nessun TURN su UDP da provare. Senza, il collegamento diretto')
        print('  funziona solo quando esiste una strada diretta fra i dispositivi.')
    elif buoni:
        print('  %d TURN su %d funzionano: c\'e\' una via di scorta.' % (buoni, turn_totali))
    else:
        print('  Nessun TURN funzionante. Se la rete di qui filtra UDP il')
        print('  risultato puo\' essere falsato: riprova da un\'altra rete, e')
        print('  controlla comunque con tools/banco-rete.html nel browser.')
    print('')
    return 0


if __name__ == '__main__':
    sys.exit(main())
