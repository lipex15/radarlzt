#!/bin/bash
echo "==================================================="
echo "  Iniciando LZT Market Auto Buy e Radar..."
echo "==================================================="
echo

# CONFIGURAÇÃO DE PORTA: Modifique se quiser rodar em outra porta diferente de 3500
export PORT=3500

# Verificar se o Node.js está instalado
if ! command -v node &> /dev/null
then
    echo "[ERRO] Node.js não encontrado!"
    echo "Por favor, instale o Node.js v18 ou superior antes de continuar."
    echo "Baixe em: https://nodejs.org/"
    exit 1
fi

echo "[1/3] Instalando dependências (pode demorar alguns segundos)..."
npm install

echo "[2/3] Iniciando o servidor..."
echo "O app rodará em http://localhost:$PORT"
echo "Se desejar mudar a porta, edite este script e altere o valor de PORT."
echo

# Abrir o navegador automaticamente
if command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:$PORT"
elif command -v open &> /dev/null; then
    open "http://localhost:$PORT"
fi

# Executar o comando de desenvolvimento
npm run dev
