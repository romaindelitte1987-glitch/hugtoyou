@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Installe Node.js 22 ou plus recent depuis https://nodejs.org/
  pause
  exit /b 1
)
echo Ouvre http://localhost:8787 dans ton navigateur.
echo Garde cette fenetre ouverte pendant la partie.
node server.js
pause
