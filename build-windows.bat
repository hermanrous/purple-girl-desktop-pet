@echo off
chcp 65001 >nul
title 紫帽少女桌宠 - Windows 构建脚本

echo ========================================
echo   紫帽少女桌宠 - Windows 一键构建
echo ========================================
echo.

REM 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js！
    echo 请先安装 Node.js 18+ ：https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [1/4] 检测到 Node.js 版本：
node --version
echo.

REM 安装依赖
echo [2/4] 正在安装依赖（首次运行需要几分钟）...
call npm ci
if %errorlevel% neq 0 (
    echo [错误] 依赖安装失败！
    pause
    exit /b 1
)
echo 依赖安装完成。
echo.

REM 处理素材
echo [3/4] 正在处理角色素材...
call npm run process:assets
if %errorlevel% neq 0 (
    echo [警告] 素材处理脚本返回非零，继续尝试构建...
)
echo 素材处理完成。
echo.

REM 打包 Windows EXE
echo [4/4] 正在打包 Windows 可执行程序（需要几分钟）...
call npm run package:win
if %errorlevel% neq 0 (
    echo [错误] 打包失败！
    pause
    exit /b 1
)

echo.
echo ========================================
echo   构建成功！
echo ========================================
echo.
echo 可执行文件位于：
echo   release\紫帽少女桌宠-win32-x64-ready-to-run\紫帽少女桌宠.exe
echo.
echo 注意：请保留整个目录，不要只单独复制 EXE 文件。
echo 双击 紫帽少女桌宠.exe 即可运行。
echo.
pause
