@echo off
title Claude Manager
echo.
echo  Claude Manager
echo  ==============

:: Check if already running on port 3847
netstat -ano | findstr ":3847" >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo  Server already running on port 3847.
    echo  Opening browser...
    start "" "http://localhost:3847"
    timeout /t 2 >nul
    exit
)

echo  Starting server...
cd /d "%~dp0server"
start /B node server.js
timeout /t 2 >nul
start "" "http://localhost:3847"
pause
