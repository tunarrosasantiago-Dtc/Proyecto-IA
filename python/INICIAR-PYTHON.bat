@echo off
setlocal
cd /d "%~dp0"
title KAIROS - Ciencias de Datos (Python)

where py >nul 2>nul
if errorlevel 1 (
  python preparar_configuracion.py
) else (
  py -3 preparar_configuracion.py
)
if errorlevel 1 (
  echo No se pudo preparar la configuracion. Revisa la instalacion de Python.
  pause
  exit /b 1
)

findstr /C:"TU_PASSWORD" ".env" >nul
if not errorlevel 1 (
  echo Completa la contrasena de PostgreSQL en el archivo .env.
  start "Editar configuracion de KAIROS" notepad "%CD%\.env"
  echo Guarda los cambios y vuelve a ejecutar INICIAR-PYTHON.bat.
  pause
  exit /b 0
)

if not exist ".venv\Scripts\python.exe" (
  echo Preparando entorno virtual de Python...
  where py >nul 2>nul
  if errorlevel 1 (
    python -m venv .venv
  ) else (
    py -3 -m venv .venv
  )
  if errorlevel 1 (
    echo No se pudo crear el entorno virtual. Instala Python 3.10 o posterior.
    pause
    exit /b 1
  )
)

.venv\Scripts\python.exe -c "import flask, psycopg, psycopg_pool, dotenv, waitress" >nul 2>nul
if errorlevel 1 (
  echo Descargando e instalando dependencias de Python...
  .venv\Scripts\python.exe -m pip install --upgrade pip
  if errorlevel 1 (
    echo No se pudo actualizar pip. Revisa tu conexion a internet.
    pause
    exit /b 1
  )
  .venv\Scripts\python.exe -m pip install -r requirements.txt
  if errorlevel 1 (
    echo No se pudieron instalar las dependencias.
    pause
    exit /b 1
  )
)

echo Iniciando KAIROS en http://localhost:3001
echo Para cerrar el servidor, presiona Ctrl+C en esta ventana.
.venv\Scripts\python.exe app.py
echo El servidor se detuvo.
pause
