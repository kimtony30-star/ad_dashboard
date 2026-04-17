Set-Location "D:\AI강의자료\files.manuscdn.com\ad-dashboard-antigravity"
Write-Host ""
Write-Host " 광고통계 대시보드 서버 시작 중..." -ForegroundColor Cyan
Write-Host " http://localhost:3000 으로 접속하세요" -ForegroundColor Green
Write-Host ""
Start-Process "http://localhost:3000"
npm run dev