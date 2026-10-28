@echo off
setlocal
cd /d "%~dp0"
title KAIROS - Ciencias de Datos
where node >nul 2>nul
if errorlevel 1 (
  echo No encuentro Node.js. Instala Node.js 20 o superior y vuelve a intentarlo.
  pause
  exit /b 1
)
if not exist .env (
  copy /y .env.example .env >nul
  echo Cree el archivo .env de configuracion.
  start "" notepad.exe "%cd%\.env"
  echo Guarda la contrasena de PostgreSQL y un SESSION_SECRET, luego vuelve a ejecutar este archivo.
  pause
  exit /b 1
)
findstr /c:"TU_PASSWORD" /c:"REEMPLAZA_ESTO" .env >nul
if not errorlevel 1 (
  echo Falta completar la conexion a PostgreSQL o SESSION_SECRET en .env.
  start "" notepad.exe "%cd%\.env"
  echo Guarda los cambios y vuelve a ejecutar este archivo.
  pause
  exit /b 1
)
if not exist node_modules\express\package.json (
  echo Preparando dependencias de la aplicacion...
  call npm.cmd install
  if errorlevel 1 (
    echo No pude instalar las dependencias. Revisa la conexion a Internet.
    pause
    exit /b 1
  )
)
echo Iniciando KAIROS. Manten abierta esta ventana del servidor.
echo Cuando veas que el servidor esta listo, abre http://localhost:3000
call npm.cmd start
pause
