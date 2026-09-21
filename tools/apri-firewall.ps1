# Apre la porta di yogasynth verso la rete locale, una volta sola.
#
# Serve perche' Windows, su una rete classificata "Public" (e le reti di casa
# lo sono quasi sempre), blocca tutto cio' che arriva dall'esterno. Il
# risultato e' sconcertante: dal computer il server risponde benissimo — il
# traffico verso se stessi non passa dal firewall — e dal telefono la pagina
# non si apre, senza un messaggio che spieghi perche'.
#
# COME SI USA
#   tasto destro su questo file -> "Esegui con PowerShell come amministratore"
# oppure, da un PowerShell aperto come amministratore:
#   powershell -ExecutionPolicy Bypass -File tools\apri-firewall.ps1
#
# COSA FA, esattamente
#   consente le connessioni in ingresso su TCP 8941, e SOLO da dispositivi
#   della tua rete locale (-RemoteAddress LocalSubnet). Non apre niente verso
#   internet.
#
# PER TOGLIERLA
#   Remove-NetFirewallRule -DisplayName "yogasynth"

param(
    [int]$Porta = 8941,
    [string]$Nome = "yogasynth"
)

$ErrorActionPreference = 'Stop'

$identita = [Security.Principal.WindowsIdentity]::GetCurrent()
$ruolo = New-Object Security.Principal.WindowsPrincipal($identita)
if (-not $ruolo.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host ""
    Write-Host "  Serve eseguirlo come amministratore." -ForegroundColor Yellow
    Write-Host "  Tasto destro sul file -> Esegui con PowerShell come amministratore."
    Write-Host ""
    Read-Host "  Invio per chiudere"
    exit 1
}

$esistente = Get-NetFirewallRule -DisplayName $Nome -ErrorAction SilentlyContinue
if ($esistente) {
    Write-Host ""
    Write-Host "  La regola '$Nome' c'e' gia'. Niente da fare." -ForegroundColor Green
} else {
    New-NetFirewallRule -DisplayName $Nome `
        -Direction Inbound -Protocol TCP -LocalPort $Porta `
        -Action Allow -Profile Any -RemoteAddress LocalSubnet `
        -Description "yogasynth: secondo schermo sul telefono, solo rete locale" | Out-Null
    Write-Host ""
    Write-Host "  Fatto: la porta $Porta e' aperta verso la tua rete locale." -ForegroundColor Green
}

# A cosa serve saperlo: l'indirizzo cambia quando il router rinnova il
# contratto DHCP, e un indirizzo annotato ieri oggi puo' essere di un altro
# dispositivo. Il QR nell'app lo rigenera ogni volta, quindi conviene
# inquadrare quello invece di ricordarselo.
$ip = (Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } |
       Select-Object -First 1).IPv4Address.IPAddress
Write-Host ""
Write-Host "  Adesso questo computer e':  http://${ip}:$Porta/"
Write-Host "  Sul telefono:               http://${ip}:$Porta/schermo.html"
Write-Host ""
Write-Host "  L'indirizzo puo' cambiare da un giorno all'altro. Inquadra il QR"
Write-Host "  che compare nell'app: quello e' sempre aggiornato."
Write-Host ""
Read-Host "  Invio per chiudere"
