@echo off
rem ---------------------------------------------------------------------
rem  Apre la porta di yogasynth verso la rete locale, una volta sola.
rem
rem  COME SI USA: doppio clic. Windows chiede il permesso, si accetta.
rem               Con "apri-firewall.cmd check" dice solo come sta messo,
rem               senza chiedere niente e senza cambiare niente.
rem
rem  PERCHE' UN .cmd E NON UN .ps1
rem    Windows, di serie, rifiuta di eseguire gli script PowerShell
rem    ("running scripts is disabled on this system"). Un .cmd parte sempre,
rem    e quello che passa a PowerShell sono comandi singoli, non script:
rem    quella regola non li riguarda.
rem
rem  PERCHE' POWERSHELL E NON NETSH
rem    netsh restituisce esito 0 anche quando la regola NON c'e', quindi
rem    "l'ho gia' fatto" e "non l'ho mai fatto" diventano indistinguibili.
rem
rem  COSA FA, esattamente
rem    consente le connessioni in ingresso su TCP 8941 e SOLO da dispositivi
rem    della rete locale (LocalSubnet). Non apre niente verso internet.
rem
rem  PER TOGLIERLA
rem    powershell -Command "Remove-NetFirewallRule -DisplayName yogasynth"
rem ---------------------------------------------------------------------

setlocal
set NOME=yogasynth
set PORTA=8941
set PS=powershell -NoProfile -ExecutionPolicy Bypass -Command

if /i "%~1"=="check" goto :stato

net session >nul 2>&1
if not "%errorlevel%"=="0" (
    echo.
    echo   Serve l'autorizzazione di amministratore.
    echo   Sto aprendo la richiesta: accettala.
    echo.
    %PS% "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

%PS% "if (Get-NetFirewallRule -DisplayName '%NOME%' -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if "%errorlevel%"=="0" (
    echo.
    echo   La regola "%NOME%" c'e' gia'. Niente da fare.
    goto :stato
)

%PS% "New-NetFirewallRule -DisplayName '%NOME%' -Direction Inbound -Protocol TCP -LocalPort %PORTA% -Action Allow -Profile Any -RemoteAddress LocalSubnet -Description 'yogasynth: secondo schermo sul telefono, solo rete locale' | Out-Null"
if "%errorlevel%"=="0" (
    echo.
    echo   Fatto: la porta %PORTA% e' aperta verso la rete locale.
) else (
    echo.
    echo   Non ci sono riuscito. Prova a mano, da PowerShell come amministratore:
    echo     New-NetFirewallRule -DisplayName "%NOME%" -Direction Inbound -Protocol TCP -LocalPort %PORTA% -Action Allow -Profile Any -RemoteAddress LocalSubnet
)

:stato
echo.
%PS% "if (Get-NetFirewallRule -DisplayName '%NOME%' -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if "%errorlevel%"=="0" (echo   regola firewall: presente) else (echo   regola firewall: ASSENTE)

rem L'indirizzo cambia quando il router rinnova il contratto DHCP: uno
rem annotato ieri oggi puo' essere di un altro dispositivo. Niente pipe nel
rem comando, che dentro un for/f di cmd andrebbe protetta e si rompe.
for /f "usebackq delims=" %%i in (`%PS% "(Get-NetIPConfiguration).Where({$_.IPv4DefaultGateway})[0].IPv4Address.IPAddress"`) do set IP=%%i
echo   indirizzo adesso: %IP%
echo.
echo   Sul computer:  http://localhost:%PORTA%/
echo   Sul telefono:  http://%IP%:%PORTA%/schermo.html
echo.
echo   L'indirizzo puo' cambiare da un giorno all'altro: meglio inquadrare
echo   il QR che compare nell'app, quello e' sempre aggiornato.
echo.
if /i not "%~1"=="check" pause
endlocal
