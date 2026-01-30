@echo off
echo ========================================
echo  Stopping Tesla Light Show Generator
echo ========================================
echo.

REM Kill Flask server (Python)
echo [1/2] Stopping Flask backend...
taskkill /F /FI "WINDOWTITLE eq Flask Backend*" >nul 2>&1
taskkill /F /FI "IMAGENAME eq python.exe" /FI "WINDOWTITLE eq Flask*" >nul 2>&1

REM Kill Vite server (Node)
echo [2/2] Stopping Vite frontend...
taskkill /F /FI "WINDOWTITLE eq Vite Frontend*" >nul 2>&1

echo.
echo ========================================
echo  All servers stopped
echo ========================================
echo.
pause
