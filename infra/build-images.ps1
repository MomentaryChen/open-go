$ErrorActionPreference = "Stop"

Write-Host "Building Docker images with pnpm script..."
pnpm docker:build

Write-Host "Starting containers..."
pnpm docker:up

Write-Host ""
Write-Host "Container status:"
pnpm docker:info

Write-Host ""
Write-Host "Available endpoints:"
Write-Host "- Frontend: http://localhost:35173"
Write-Host "- Backend API: http://localhost:33000"
Write-Host "- Postgres: localhost:35432"

Write-Host ""
Write-Host "Local IP endpoints (replace <LAN_IP> with your machine IP):"
Write-Host "- Frontend: http://<LAN_IP>:35173"
Write-Host "- Backend API: http://<LAN_IP>:33000"
Write-Host "- Postgres: <LAN_IP>:35432"

Write-Host ""
Write-Host "Done."
