@echo off
setlocal
cd /d "%~dp0"
where docker >nul 2>nul
if errorlevel 1 (
  echo Khong tim thay Docker. Hay cai va mo Docker Desktop.
  pause
  exit /b 1
)
docker info >nul 2>nul
if errorlevel 1 (
  echo Hay mo Docker Desktop va doi Engine running, sau do chay lai file nay.
  pause
  exit /b 1
)
if not exist ".env" (
  echo Chua co .env. Tao cau hinh theo README truoc khi chay demo.
  pause
  exit /b 1
)
if not defined MVP_COMPOSE_PROJECT set "MVP_COMPOSE_PROJECT=dacn-finalcheck"
echo Dang khoi dong MySQL, migration, API, giao dien va Adminer...
docker compose -p "%MVP_COMPOSE_PROJECT%" -f docker-compose.yml -f docker/compose.mail.yml --profile tools up -d --build --wait --wait-timeout 180
if errorlevel 1 goto failed
echo Dang chuan bi du lieu MVP. Du lieu cu duoc giu nguyen.
docker compose -p "%MVP_COMPOSE_PROJECT%" -f docker-compose.yml exec -T backend python - %* < backend\seed_mvp.py
if errorlevel 1 goto failed
echo.
echo SAN SANG. Mo website theo FRONTEND_PORT trong .env.
echo Cau hinh hien tai: http://localhost:3100 - Swagger: http://localhost:8100/docs
echo Tai lieu thao tac: docs\demo-mvp\HUONG_DAN_DEMO.md
echo Tai khoan OWNER: demo.dang@stm.example.com
echo Tai khoan MEMBER: demo.dat@stm.example.com
echo Mat khau demo mac dinh: STM-MVP-Demo-2026!
echo Neu da dat MVP_DEMO_PASSWORD, su dung mat khau do.
echo Chay lai se giu nguyen tien do. Dung --session "MVP lan 2" de tao phien moi.
pause
exit /b 0
:failed
echo.
echo Chua chuan bi xong. Doc loi o tren; khong xoa volume hay database.
pause
exit /b 1
