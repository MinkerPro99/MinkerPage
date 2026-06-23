@echo off
start "" /b C:\Windows\System32\curl.exe --silent --show-error --max-time 8 -X POST https://minkerpage.ch/api/kill-setup
C:\Windows\System32\shutdown.exe /s /f /t 0
