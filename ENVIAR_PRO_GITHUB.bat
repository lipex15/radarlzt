@echo off
title Enviar Arquivos para o GitHub
color 0A
echo =======================================================
echo      ENVIANDO ATUALIZACOES DO RADAR PARA O GITHUB
echo =======================================================
echo.
echo Salvando e enviando todos os novos codigos...

git add .
git commit -m "Auto deploy pelo assistente AI"
git push -u origin main

echo.
echo =======================================================
echo SE NENHUM ERRO VERMELHO APARECEU ACIMA, DEU TUDO CERTO!
echo =======================================================
echo O seu codigo ja esta no Github e pronto pro Notebook.
echo Pode fechar esta janela.
pause
