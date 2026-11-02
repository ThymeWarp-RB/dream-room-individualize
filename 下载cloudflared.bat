@echo off
setlocal
title 下载 cloudflared
cd /d "%~dp0"

if exist "cloudflared.exe" (
  echo 本地已经有 cloudflared.exe 了。
  "cloudflared.exe" --version
  pause
  exit /b 0
)

echo 从 Cloudflare 官方 GitHub Release 下载 cloudflared.exe（约 53 MB）...
echo.
where curl >nul 2>nul
if errorlevel 1 (
  echo [错误] 系统里没有 curl（Windows 10 1803 以上才有）。
  echo 请手动下载：
  echo https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
  pause
  exit /b 1
)

rem 有些校园网会把 HTTP/2 掐掉，用 http1.1 更稳
curl.exe -L --http1.1 --fail --retry 3 --connect-timeout 25 -o "cloudflared.exe" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
if errorlevel 1 (
  echo.
  echo [错误] 下载失败。
  echo 试试换个网络，或手动下载后把 cloudflared.exe 放进本文件夹。
  pause
  exit /b 1
)

echo.
"cloudflared.exe" --version
echo.
echo 完成，现在可以双击「启动公网隧道.bat」了。
pause
