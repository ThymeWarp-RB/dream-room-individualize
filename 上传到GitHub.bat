@echo off
setlocal enabledelayedexpansion
title 上传到 GitHub
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo [错误] 没找到 git，先装 https://git-scm.com/ （一路下一步即可）
  pause
  exit /b 1
)
if not exist ".git" (
  echo [错误] 这个文件夹还不是 git 仓库。
  pause
  exit /b 1
)

echo.
echo   1. 浏览器打开你的仓库页面
echo   2. 点右上角绿色 [ Code ] 按钮
echo   3. 复制那串 https://github.com/xxx/yyy.git
echo.
set /p REPO_URL=把仓库地址粘贴到这里，然后回车：

rem 去掉可能的引号和空格
set "REPO_URL=%REPO_URL:"=%"
set "REPO_URL=%REPO_URL: =%"
if "%REPO_URL%"=="" ( echo 地址是空的，退出。 & pause & exit /b 1 )

rem 没写 .git 就补上
if /I not "%REPO_URL:~-4%"==".git" set "REPO_URL=%REPO_URL%.git"

echo.
echo 目标仓库：%REPO_URL%
echo.

git remote remove origin >nul 2>nul
git remote add origin "%REPO_URL%"

echo 正在上传……第一次会弹浏览器让你登录 GitHub，点 Authorize 就行。
echo.
git push -u origin main

if errorlevel 1 (
  echo.
  echo ------------------------------------------------------------
  echo  第一次没推上去。如果上面写的是 rejected / fetch first，
  echo  说明你建仓库时勾了 README，仓库里已经有东西了。
  echo  这个仓库里本来没有你要保留的文件，可以直接覆盖：
  echo ------------------------------------------------------------
  echo.
  set /p OW=输入 y 直接覆盖：
  if /I "%OW%"=="y" (
     git push --force -u origin main
     if errorlevel 1 (
        echo 还是失败。把上面的红字发给帮你的人看看。
        pause
        exit /b 1
     )
  ) else (
     pause
     exit /b 1
  )
)

echo.
echo ============================================================
echo   上传完成！浏览器会打开你的仓库页面，刷新就能看到文件。
echo ============================================================
start "" "%REPO_URL:.git=%"
pause
