@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo   正在启动《七大奇迹对决》服务器...
echo.

node -v >nul 2>&1
if errorlevel 1 (
  echo   [错误] 没有检测到 Node.js。
  echo.
  echo   请先到 https://nodejs.org 下载并安装 LTS 版本，然后重新运行本文件。
  echo.
  pause
  exit /b 1
)

echo   Node 版本：
node -v
echo.
echo   启动后，在浏览器打开下面任意一个地址即可游玩。
echo   停止服务请在本窗口按 Ctrl + C。
echo.

node dist-server\server.mjs

echo.
echo   服务器已停止。
pause
