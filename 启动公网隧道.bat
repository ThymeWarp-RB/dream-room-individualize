@echo off
setlocal
title 大英造梦室 - 公网隧道
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 没找到 Node.js，先装 https://nodejs.org/ 的 LTS 版本。
  pause
  exit /b 1
)

set "LOCALCF=%~dp0cloudflared.exe"
if exist "%LOCALCF%" goto :havecf
where cloudflared >nul 2>nul
if errorlevel 1 (
  echo [错误] 没找到 cloudflared.exe
  echo.
  echo 下载：https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
  echo 下 Windows 版，解压出 cloudflared.exe，放到本文件夹里，再双击本文件。
  pause
  exit /b 1
)
set "LOCALCF=cloudflared"

:havecf
netstat -ano | findstr /C:":8787" | findstr /I "LISTENING" >nul
if errorlevel 1 (
  echo 后台启动本地服务...
  start "大英后端" /min cmd /c "node _server\server.js"
  timeout /t 2 >nul
) else (
  echo 本地服务已经在跑，直接用。
)

echo.
echo ============================================================
echo   下面出现 https://xxxx.trycloudflare.com 就是公网地址
echo   发给不在校园网里的学生用；这个窗口别关，关了隧道就断
echo   校园网内的同学仍然用 http://本机IP:8787/
echo ============================================================
echo.

if /I "%LOCALCF%"=="cloudflared" (
  cloudflared tunnel --url http://127.0.0.1:8787
) else (
  "%LOCALCF%" tunnel --url http://127.0.0.1:8787
)

echo.
echo 隧道已断开。
pause
