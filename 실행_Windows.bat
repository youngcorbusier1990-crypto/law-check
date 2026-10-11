@echo off
chcp 65001 >nul
title 法規·CHECK 서버
echo.
echo   法規·CHECK 건축 법령 검토 서버를 시작합니다...
echo.

REM Node.js 설치 확인
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo   [오류] Node.js가 설치되어 있지 않습니다.
  echo   https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
  echo.
  pause
  exit /b
)

REM 인증키 확인 (my_oc.txt 파일이 있으면 읽어서 사용)
if exist "%~dp0my_oc.txt" (
  set /p LAW_OC=<"%~dp0my_oc.txt"
  echo   법령 인증키(OC)를 my_oc.txt에서 불러왔습니다.
) else (
  echo   [안내] 법령 샘플키(test)로 실행합니다.
)
if exist "%~dp0my_vworld.txt" (
  set /p VWORLD_KEY=<"%~dp0my_vworld.txt"
  echo   브이월드 인증키를 my_vworld.txt에서 불러왔습니다.
) else (
  echo   [안내] 브이월드 키 없음 — 대지 자동조회는 비활성화됩니다.
)
echo.

REM 서버 실행 후 브라우저 자동 열기
start "" http://localhost:8080
node "%~dp0server.js"
pause
