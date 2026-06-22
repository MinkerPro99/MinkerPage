@echo off
C:\Windows\System32\shutdown.exe /s /f /t 5
timeout /t 10 /nobreak >nul
curl --max-time 5 -X POST https://minkerpage.ch/api/kill-setup