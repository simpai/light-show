@echo off
echo ========================================
echo  Tesla Light Show Generator
echo ========================================
echo.

REM Start Flask backend
echo [1/2] Starting Flask backend server...
start "Flask Backend" cmd /k "python server.py"

REM Wait a moment for Flask to start
timeout /t 2 /nobreak >nul

REM Start Vite frontend
echo [2/2] Starting Vite frontend server...
cd frontend
start "Vite Frontend" cmd /k "npm run dev"
cd ..

echo.
echo ========================================
echo  Servers are starting...
echo  Backend:  http://127.0.0.1:5000
echo  Frontend: http://localhost:5173
echo ========================================
echo.
echo Press any key to exit this window (servers will keep running)
pause >nul
