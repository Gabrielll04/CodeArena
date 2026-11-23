@echo off
rem Inicia o CodeArena no Windows: instala o que faltar, gera a interface e abre o navegador.
rem Clique duas vezes neste arquivo. Para parar, feche esta janela.
title CodeArena
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js 22 ou mais novo: https://nodejs.org
  pause
  exit /b 1
)

where pnpm >nul 2>nul
if errorlevel 1 call corepack enable

if not exist node_modules (
  echo Instalando dependencias, so na primeira vez...
  call pnpm install || goto erro
)

if not exist apps\web\dist\index.html (
  echo Gerando a interface, so na primeira vez...
  call pnpm build || goto erro
)

echo.
echo Os alunos entram pelo endereco de rede que aparece abaixo (ex.: http://192.168.0.10:3000).
echo.
start "" http://localhost:3000/teacher
call pnpm start
goto fim

:erro
echo.
echo Algo deu errado. Veja a mensagem acima.
:fim
pause
