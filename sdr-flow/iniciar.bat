@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo O Node.js nao esta instalado. Baixe a versao LTS em https://nodejs.org e rode este arquivo de novo.
  pause
  exit /b
)
if not exist node_modules (
  echo Instalando dependencias, aguarde...
  call npm install
)
start "" http://localhost:3000
node server.js
pause
