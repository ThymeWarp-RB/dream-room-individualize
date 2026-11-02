@echo off
setlocal enabledelayedexpansion
title 推送到 GitHub
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo [错误] 没找到 git，先安装 https://git-scm.com/
  pause
  exit /b 1
)

if not exist ".git" (
  echo [错误] 当前文件夹还不是 git 仓库。
  pause
  exit /b 1
)

echo.
echo   先在网页上建一个空仓库：https://github.com/new
echo   （不要勾选 README / .gitignore / LICENSE，名字建议 zju-ce-room）
echo.
set /p GHUSER=你的 GitHub 用户名：
if "%GHUSER%"=="" ( echo 用户名不能为空 & pause & exit /b 1 )
set /p GHREPO=仓库名（直接回车用 zju-ce-room）：
if "%GHREPO%"=="" set "GHREPO=zju-ce-room"

git remote remove origin >nul 2>nul
git remote add origin "https://github.com/%GHUSER%/%GHREPO%.git"

echo.
echo 正在推送……第一次会弹窗让你登录 GitHub（用浏览器授权即可）
echo.
git push -u origin main
if errorlevel 1 (
  echo.
  echo [失败] 推送没成功。常见原因：
  echo   1. 仓库还没在网页上建好
  echo   2. 用户名或仓库名拼错
  echo   3. 登录被取消
  echo 改好后可以重跑本文件。
  pause
  exit /b 1
)

echo.
echo 推送成功！打开： https://github.com/%GHUSER%/%GHREPO%
start "" "https://github.com/%GHUSER%/%GHREPO%"
pause
