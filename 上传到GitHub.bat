@echo off
setlocal enabledelayedexpansion
title 上传到 GitHub
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo [错误] 没找到 git，先装 https://git-scm.com/ （一路下一步）
  pause
  exit /b 1
)
if not exist ".git" (
  echo [错误] 这个文件夹还不是 git 仓库。
  pause
  exit /b 1
)

rem ---------- 1. 有没有记住仓库地址 ----------
for /f "delims=" %%u in ('git remote get-url origin 2^>nul') do set "EXISTING=%%u"

if defined EXISTING (
  echo 已记住仓库地址：
  echo   !EXISTING!
  echo.
  set /p CHANGE=要换一个仓库吗？直接回车 = 不变，输 y = 重填：
  if /I "!CHANGE!"=="y" set "EXISTING="
)

if not defined EXISTING (
  echo.
  echo   在仓库页面点绿色 [ Code ] 按钮，复制 https://github.com/xxx/yyy.git
  echo.
  set /p REPO_URL=把仓库地址粘贴到这里，然后回车：
  set "REPO_URL=!REPO_URL:"=!"
  set "REPO_URL=!REPO_URL: =!"
  if "!REPO_URL!"=="" ( echo 地址是空的，退出。 & pause & exit /b 1 )
  if /I not "!REPO_URL:~-4!"==".git" set "REPO_URL=!REPO_URL!.git"
  git remote remove origin >nul 2>nul
  git remote add origin "!REPO_URL!"
)

echo.
echo ============================================================
echo   正在上传……
echo   第一次会弹一个 GitHub 登录窗（可能躲在其他窗口后面），
echo   点绿色 Authorize / 浏览器里点授权即可。
echo ============================================================
echo.

git push -u origin main

if errorlevel 1 (
  echo.
  echo ------------------------------------------------------------
  echo  第一次没推上去。
  echo   提示 rejected / fetch first  =^> 仓库里已经有东西（比如 README），
  echo   这个仓库没有你要保留的文件，可以直接覆盖。
  echo   提示 Authentication failed  =^> 登录没完成，重跑本文件再授权一次。
  echo ------------------------------------------------------------
  echo.
  set /p OW=要直接覆盖远端内容吗？输 y 覆盖，直接回车退出：
  if /I "!OW!"=="y" (
     git push --force -u origin main
     if errorlevel 1 (
        echo.
        echo 还是失败。把上面的红字拍下来发给帮你的人。
        pause
        exit /b 1
     )
  ) else (
     pause
     exit /b 1
  )
)

for /f "delims=" %%u in ('git remote get-url origin 2^>nul') do set "URL=%%u"
set "WEB=!URL:.git=!"

echo.
echo ============================================================
echo   上传完成！
echo   !WEB!
echo ============================================================
start "" "!WEB!"
pause
