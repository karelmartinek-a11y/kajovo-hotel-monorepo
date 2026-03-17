@echo off
setlocal enabledelayedexpansion
set APP_HOME=%~dp0
set PROPERTIES_FILE=%APP_HOME%gradle\wrapper\gradle-wrapper.properties
for /f "tokens=1,* delims==" %%A in (%PROPERTIES_FILE%) do (
    if "%%A"=="distributionUrl" set DISTRIBUTION_URL=%%B
)
set DISTRIBUTION_URL=%DISTRIBUTION_URL:\=%
for %%F in (%DISTRIBUTION_URL%) do set DIST_ZIP=%%~nxF
set DIST_NAME=%DIST_ZIP:.zip=%
set DIST_DIR=%APP_HOME%.gradle-dist\%DIST_NAME%
set GRADLE_BIN=%DIST_DIR%\bin\gradle.bat
set ZIP_PATH=%APP_HOME%.gradle-dist\%DIST_ZIP%

if not exist "%APP_HOME%.gradle-dist" mkdir "%APP_HOME%.gradle-dist"

if not exist "%GRADLE_BIN%" (
    echo Bootstrapping Gradle distribution: %DISTRIBUTION_URL%
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing '%DISTRIBUTION_URL%' -OutFile '%ZIP_PATH%'; Expand-Archive -Path '%ZIP_PATH%' -DestinationPath '%APP_HOME%.gradle-dist' -Force"
    if errorlevel 1 exit /b 1
)

call "%GRADLE_BIN%" -p "%APP_HOME%" %*
