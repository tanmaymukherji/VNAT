@echo off
echo ================================
echo  Translation Tool - Dev Server
echo ================================
echo.

REM Install backend dependencies
echo Installing Python dependencies...
cd /d "%~dp0backend"
pip install -r requirements.txt

echo Starting backend server...
start cmd /k "uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

REM Install frontend dependencies
echo Installing Node.js dependencies...
cd /d "%~dp0"
npm install

echo Starting frontend dev server...
start cmd /k "npm run dev"

echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo API Docs: http://localhost:8000/docs
echo.
echo Press any key to stop all servers...
pause
