@echo off
setlocal
set "URL=https://kolaykasam.com/"
for %%B in ("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" "%LocalAppData%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe") do (
 if exist "%%~B" (start "HizliSatis" "%%~B" --app=%URL% & exit /b 0)
)
start "" "%URL%"
