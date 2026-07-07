@echo off
title LZT Market Auto Buy e Radar
echo ===================================================
echo   Iniciando LZT Market Auto Buy e Radar...
echo ===================================================
echo.

:: CONFIGURAÇÃO DE PORTA: Modifique se quiser rodar em outra porta diferente de 3500
set PORT=3500

echo [1/4] Verificando atualizacoes do GitHub...
where git >nul 2>nul
if %errorlevel% equ 0 (
    if exist .git (
        echo [Atualizacao] Buscando novas atualizacoes do repositorio...
        git fetch origin main >nul 2>nul
        git pull origin main >nul 2>nul
        echo [Atualizacao] Prontinho! O robô esta atualizado.
    ) else (
        echo [Atualizacao] Vinculando sua pasta ao repositório pela primeira vez...
        git init >nul 2>nul
        git remote add origin https://github.com/lipex15/radarlzt.git >nul 2>nul
        git branch -M main >nul 2>nul
        git fetch origin main >nul 2>nul
        :: Salva arquivos locais antes de mesclar para evitar perdas
        git stash >nul 2>nul
        git pull origin main >nul 2>nul
        git stash pop >nul 2>nul
    )
) else (
    echo [AVISO] O Git nao esta instalado no sistema. Ignorando atualizacoes auto...
)
echo.

:: Verificar se o Node.js está instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao encontrado!
    echo Por favor, instale o Node.js v18 ou superior antes de continuar.
    echo Baixe em: https://nodejs.org/
    pause
    exit /b 1
)

echo [1/3] Instalando dependencias (pode demorar alguns segundos)...
call npm install

echo [2/3] Iniciando o servidor...
echo O app rodara em http://localhost:%PORT%
echo Se desejar mudar a porta, edite este arquivo .bat e mude o valor de "PORT".
echo.

:: Abrir o navegador automaticamente
start "" "http://localhost:%PORT%"

:: Executar o comando de desenvolvimento
call npm run dev

pause
