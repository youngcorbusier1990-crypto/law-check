#!/bin/bash
cd "$(dirname "$0")"
echo ""
echo "  法規·CHECK 건축 법령 검토 서버를 시작합니다..."
echo ""

# Node.js 설치 확인
if ! command -v node &> /dev/null; then
  echo "  [오류] Node.js가 설치되어 있지 않습니다."
  echo "  https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요."
  echo ""
  read -p "  엔터를 누르면 종료합니다..."
  exit 1
fi

# 인증키 확인
if [ -f "my_oc.txt" ]; then
  export LAW_OC=$(cat my_oc.txt | tr -d '[:space:]')
  echo "  법령 인증키(OC)를 my_oc.txt에서 불러왔습니다."
else
  echo "  [안내] 법령 샘플키(test)로 실행합니다."
fi
if [ -f "my_vworld.txt" ]; then
  export VWORLD_KEY=$(cat my_vworld.txt | tr -d '[:space:]')
  echo "  브이월드 인증키를 my_vworld.txt에서 불러왔습니다."
else
  echo "  [안내] 브이월드 키 없음 — 대지 자동조회는 비활성화됩니다."
fi
echo ""

# 브라우저 자동 열기 (2초 후)
( sleep 2 && open "http://localhost:8080" 2>/dev/null || xdg-open "http://localhost:8080" 2>/dev/null ) &

node server.js
