@echo off
title 大英造梦室 - 后端
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 没找到 Node.js。
  echo 请先安装 https://nodejs.org/ 的 LTS 版本，装完再双击本文件。
  pause
  exit /b 1
)

echo.
echo   大英造梦室 后端启动中，两秒后自动打开浏览器
echo   页面地址：http://127.0.0.1:8787/
echo   关闭这个黑窗口 = 停止服务
echo.
start "" cmd /c "timeout /t 2 >nul & start http://127.0.0.1:8787/"
node "_server\server.js"

echo.
echo 服务已停止。
pause
