@echo off
chcp 65001 >nul
title Testar xSaskizin Deck
cd /d "%~dp0"
echo  Instalando dependencias e testando o codigo... (2-3 minutos)
call npm install > log_teste.txt 2>&1
call npx --yes expo export --platform android >> log_teste.txt 2>&1
echo. >> log_teste.txt
echo FIM codigo=%errorlevel% >> log_teste.txt
echo.
echo  Pronto. Avise o Claude que terminou.
pause
