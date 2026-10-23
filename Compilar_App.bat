@echo off
chcp 65001 >nul
title Compilar xSaskizin Deck
cd /d "%~dp0"
set EAS_NO_VCS=1
echo.
echo  [1/4] Instalando dependencias (pode demorar uns minutos)...
call npm install
if errorlevel 1 goto erro
echo.
echo  [2/4] Ajustando versoes dos pacotes...
call npx expo install --fix
echo.
echo  [3/4] Login no Expo (crie a conta gratis em expo.dev se ainda nao tiver)
call npx eas-cli@latest whoami >nul 2>&1 || call npx eas-cli@latest login
if errorlevel 1 goto erro
echo.
echo  [4/4] Enviando para compilar na nuvem do Expo...
echo  Responda Y (sim) nas perguntas. No fim aparece um link e um QR code do APK.
call npx eas-cli@latest build -p android --profile preview
if errorlevel 1 goto erro
echo.
echo  Pronto! Abra o link acima no celular para baixar o APK.
pause
exit /b 0
:erro
echo.
echo  Deu erro. Tire um print desta janela e mande para o Claude.
pause
exit /b 1
